import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import type { DbClient } from "@core/db/client";
import type { MediaPutData, MediaPutResult, MediaStorage } from "./types";

const MAX_COLLISION_RETRIES = 20;

interface R2Env {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
}

function readR2Env(): R2Env | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  // Public URL must be reachable from CLIENT components (the admin Media grid
  // builds <img src> with it in render). Next.js only exposes env vars to
  // client bundles when prefixed `NEXT_PUBLIC_` — server reads the same var.
  const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) {
    return null;
  }
  return { accountId, accessKeyId, secretAccessKey, bucket, publicUrl };
}

let credDiagLogged = false;
function logCredDiagnostic(env: R2Env): void {
  if (credDiagLogged) return;
  credDiagLogged = true;
  const peek = (s: string) =>
    `len=${s.length} first2='${s.slice(0, 2)}' last2='${s.slice(-2)}'`;
  console.warn(
    "[R2Storage] credential diagnostic (one-shot per process — NOT a secret leak):",
    {
      accessKeyId: peek(env.accessKeyId),
      secretAccessKey: peek(env.secretAccessKey),
      bucket: env.bucket,
      endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    }
  );
}

function buildClient(env: R2Env): S3Client {
  logCredDiagnostic(env);
  return new S3Client({
    region: "auto",
    endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: env.accessKeyId,
      secretAccessKey: env.secretAccessKey,
    },
    // Disable the SDK's default "always add CRC32 integrity headers" behavior
    // (new in @aws-sdk/client-s3 >= 3.700). The added `x-amz-checksum-crc32`
    // and `x-amz-sdk-checksum-algorithm` headers are part of the SigV4
    // canonical request the SDK signs, but Cloudflare R2 doesn't cooperate
    // with the new integrity scheme yet — its signature calculation diverges
    // from the SDK's and every PUT fails with `SignatureDoesNotMatch`.
    // WHEN_REQUIRED tells the SDK to add checksum headers only when the
    // operation explicitly demands them (PutObject does not).
    // See: https://github.com/aws/aws-sdk-js-v3/issues/6810
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

/**
 * Sanitize a user-supplied filename into an R2-safe key segment.
 * Splits on the final dot to preserve the extension verbatim (lowercased).
 * Returns `{ stem, ext }` where stem is lowercased alphanumerics with single
 * dashes between word groups, and ext is the extension (or "" if none).
 */
export function sanitizeFilenameForKey(filename: string): { stem: string; ext: string } {
  const lastDot = filename.lastIndexOf(".");
  const rawStem = lastDot > 0 ? filename.slice(0, lastDot) : filename;
  const rawExt = lastDot > 0 ? filename.slice(lastDot + 1) : "";
  const stem =
    rawStem
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "file";
  const ext = rawExt.toLowerCase().replace(/[^a-z0-9]/g, "");
  return { stem, ext };
}

function buildOriginalKey(yyyy: string, mm: string, stem: string, ext: string, attempt: number): string {
  const suffix = attempt === 0 ? "" : `-${attempt}`;
  const tail = ext ? `${stem}${suffix}.${ext}` : `${stem}${suffix}`;
  return `${yyyy}/${mm}/${tail}`;
}

function deriveThumbKey(originalKey: string): string {
  return deriveVariantKey(originalKey, "thumb");
}

function deriveMediumKey(originalKey: string): string {
  return deriveVariantKey(originalKey, "medium");
}

function deriveVariantKey(originalKey: string, suffix: "thumb" | "medium"): string {
  const lastDot = originalKey.lastIndexOf(".");
  const lastSlash = originalKey.lastIndexOf("/");
  if (lastDot < 0 || lastDot <= lastSlash) {
    return `${originalKey}-${suffix}.webp`;
  }
  return `${originalKey.slice(0, lastDot)}-${suffix}.webp`;
}

function isPreconditionFailed(err: unknown): boolean {
  if (err == null || typeof err !== "object") return false;
  const e = err as { name?: string; $metadata?: { httpStatusCode?: number }; Code?: string };
  if (e.name === "PreconditionFailed") return true;
  if (e.Code === "PreconditionFailed") return true;
  if (e.$metadata?.httpStatusCode === 412) return true;
  return false;
}

/**
 * Re-throw an S3 SDK error with enough context that the upstream admin can
 * actually debug it. The SDK's `UnknownError` name is unhelpful on its own;
 * we want the operation, key, and HTTP status alongside the message.
 *
 * Also `console.error`s the full original error so the server terminal /
 * Vercel function logs show the real stack + $metadata.
 */
function rethrowR2(op: string, key: string, err: unknown): never {
  console.error(`[R2Storage] ${op} failed for key='${key}':`, err);
  const e = err as { name?: string; message?: string; $metadata?: { httpStatusCode?: number; requestId?: string } };
  const parts = [`R2 ${op} failed`];
  if (e?.name && e.name !== "Error") parts.push(`(${e.name})`);
  const status = e?.$metadata?.httpStatusCode;
  if (status) parts.push(`status ${status}`);
  parts.push(`key '${key}'`);
  if (e?.message) parts.push(`— ${e.message}`);
  const reqId = e?.$metadata?.requestId;
  if (reqId) parts.push(`[req ${reqId}]`);
  throw new Error(parts.join(" "));
}

/**
 * Cloudflare R2 media storage.
 *
 * S3-compatible client pointed at the R2 endpoint. Writes the resized original
 * and (when present) its 600px thumb as separate objects under `YYYY/MM/`,
 * using HEAD-before-PUT to resolve filename collisions WordPress-style (`-1`,
 * `-2`, …). The thumb key is NOT persisted — it's derived from the original
 * key at render time.
 *
 * Env-gated via `available()`; the upload pipeline refuses with a clear error
 * when the active backend is `'r2'` but env is incomplete (no silent fallback
 * to DB — see CLAUDE.md's "silent failure" anti-pattern callout).
 */
export class R2Storage implements MediaStorage {
  readonly id = "r2" as const;
  private cachedClient: S3Client | null = null;
  private cachedEnv: R2Env | null = null;
  private readonly injectedClient: S3Client | null;

  constructor(injectedClient?: S3Client) {
    this.injectedClient = injectedClient ?? null;
  }

  available(): boolean {
    return readR2Env() !== null;
  }

  private clientAndEnv(): { client: S3Client; env: R2Env } {
    const env = readR2Env();
    if (!env) {
      throw new Error(
        "R2Storage: missing env. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, NEXT_PUBLIC_R2_PUBLIC_URL."
      );
    }
    if (this.injectedClient) {
      return { client: this.injectedClient, env };
    }
    if (!this.cachedClient || this.cachedEnv !== env) {
      this.cachedClient = buildClient(env);
      this.cachedEnv = env;
    }
    return { client: this.cachedClient, env };
  }

  async put(db: DbClient, data: MediaPutData): Promise<MediaPutResult> {
    const { client, env } = this.clientAndEnv();
    const uploadedAt = data.uploadedAt ?? new Date();
    const yyyy = String(uploadedAt.getUTCFullYear());
    const mm = String(uploadedAt.getUTCMonth() + 1).padStart(2, "0");
    const { stem, ext } = sanitizeFilenameForKey(data.filename);

    // Atomic create-only PUT via `If-None-Match: '*'` — R2 returns
    // `412 PreconditionFailed` when the key already exists, otherwise the PUT
    // succeeds. One round-trip per attempt (no preceding HEAD), no race
    // window between check and write, and — crucially — works with the
    // least-privilege `Object Read & Write` R2 token, which does NOT grant
    // `s3:ListBucket` and therefore makes HEAD on a non-existent key return
    // 403 instead of 404. (Per S3 / R2 semantics: without ListBucket, the
    // service refuses to confirm or deny existence.)
    let originalKey: string | null = null;
    for (let attempt = 0; attempt <= MAX_COLLISION_RETRIES; attempt++) {
      const candidate = buildOriginalKey(yyyy, mm, stem, ext, attempt);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: env.bucket,
            Key: candidate,
            Body: data.bytes,
            ContentType: data.mime,
            ContentLength: data.bytes.byteLength,
            IfNoneMatch: "*",
          })
        );
        originalKey = candidate;
        break;
      } catch (err) {
        if (isPreconditionFailed(err)) {
          // 412 — key is taken; try the next suffix.
          continue;
        }
        rethrowR2("PutObject", candidate, err);
      }
    }
    if (originalKey === null) {
      throw new Error("Filename too contested — rename and try again");
    }

    // PUT thumb if present. Key is derived; we trust the original's collision
    // resolution and don't HEAD the thumb separately.
    let thumbMime: string | null = null;
    if (data.thumb) {
      const thumbKey = deriveThumbKey(originalKey);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: env.bucket,
            Key: thumbKey,
            Body: data.thumb.bytes,
            ContentType: data.thumb.mime,
            ContentLength: data.thumb.bytes.byteLength,
          })
        );
      } catch (err) {
        rethrowR2("PutObject (thumb)", thumbKey, err);
      }
      thumbMime = data.thumb.mime;
    }

    // PUT medium if present. Same derivation pattern.
    let mediumMime: string | null = null;
    if (data.medium) {
      const mediumKey = deriveMediumKey(originalKey);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: env.bucket,
            Key: mediumKey,
            Body: data.medium.bytes,
            ContentType: data.medium.mime,
            ContentLength: data.medium.bytes.byteLength,
          })
        );
      } catch (err) {
        rethrowR2("PutObject (medium)", mediumKey, err);
      }
      mediumMime = data.medium.mime;
    }

    // Row INSERT — same shape as DbStorage but storage_backend='r2',
    // storage_ref=<R2 key>, blob/thumb/medium_data NULL.
    await db.execute({
      sql: `INSERT INTO media
            (id, tenant_id, filename, mime, size_bytes, width, height,
             blob_data, thumb_data, thumb_mime, medium_data, medium_mime,
             storage_backend, storage_ref, uploaded_by)
            VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, NULL, ?, 'r2', ?, ?)`,
      args: [
        data.id,
        data.tenantId,
        data.filename,
        data.mime,
        data.sizeBytes,
        data.width,
        data.height,
        thumbMime,
        mediumMime,
        originalKey,
        data.uploadedBy,
      ],
    });

    return { ref: originalKey, thumbMime, mediumMime };
  }

  /**
   * Fetch raw bytes of an R2 object — used by the R2→DB migration path.
   * Returns null if the object is missing (rather than throwing) so the
   * migrator can flag the row as a failure and continue.
   */
  async getBytes(key: string): Promise<Uint8Array | null> {
    const { client, env } = this.clientAndEnv();
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: env.bucket, Key: key }));
      if (!res.Body) return null;
      // AWS SDK v3 returns a stream; transformToByteArray is the documented helper.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const bodyWithHelper = res.Body as any;
      if (typeof bodyWithHelper.transformToByteArray === "function") {
        return await bodyWithHelper.transformToByteArray();
      }
      // Fallback for older SDK versions / Node streams.
      const chunks: Buffer[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for await (const chunk of bodyWithHelper as AsyncIterable<any>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return new Uint8Array(Buffer.concat(chunks));
    } catch (err) {
      const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
      if (e.name === "NoSuchKey" || e.$metadata?.httpStatusCode === 404) return null;
      rethrowR2("GetObject", key, err);
    }
  }

  /**
   * Delete the R2 objects (original + derived thumb) for a row without
   * touching the DB row itself. Used by R2→DB migration after the bytes
   * have been copied back into the database — keeps the row intact while
   * cleaning up R2-side objects.
   */
  async deleteObjects(ref: string, hasThumb: boolean, hasMedium = false): Promise<void> {
    const { client, env } = this.clientAndEnv();
    try {
      await client.send(new DeleteObjectCommand({ Bucket: env.bucket, Key: ref }));
    } catch (err) {
      console.warn(`R2Storage.deleteObjects: failed to delete original ${ref}:`, err);
    }
    if (hasThumb) {
      const thumbKey = deriveThumbKey(ref);
      try {
        await client.send(new DeleteObjectCommand({ Bucket: env.bucket, Key: thumbKey }));
      } catch (err) {
        console.warn(`R2Storage.deleteObjects: failed to delete thumb ${thumbKey}:`, err);
      }
    }
    if (hasMedium) {
      const mediumKey = deriveMediumKey(ref);
      try {
        await client.send(new DeleteObjectCommand({ Bucket: env.bucket, Key: mediumKey }));
      } catch (err) {
        console.warn(`R2Storage.deleteObjects: failed to delete medium ${mediumKey}:`, err);
      }
    }
  }

  /**
   * PUT an existing media row's bytes to R2 without doing the row INSERT —
   * used by the DB→R2 migration path, which UPDATEs the row separately.
   *
   * Returns the resolved R2 key (post-collision suffix) and thumb mime.
   * Same `If-None-Match: '*'` create-only semantics as `put` to avoid
   * clobbering existing objects.
   */
  async writeBytesOnly(args: {
    bytes: Uint8Array;
    mime: string;
    filename: string;
    thumb: { bytes: Uint8Array; mime: string } | null;
    medium?: { bytes: Uint8Array; mime: string } | null;
    uploadedAt?: Date;
  }): Promise<{ ref: string; thumbMime: string | null; mediumMime: string | null }> {
    const { client, env } = this.clientAndEnv();
    const uploadedAt = args.uploadedAt ?? new Date();
    const yyyy = String(uploadedAt.getUTCFullYear());
    const mm = String(uploadedAt.getUTCMonth() + 1).padStart(2, "0");
    const { stem, ext } = sanitizeFilenameForKey(args.filename);

    let originalKey: string | null = null;
    for (let attempt = 0; attempt <= MAX_COLLISION_RETRIES; attempt++) {
      const candidate = buildOriginalKey(yyyy, mm, stem, ext, attempt);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: env.bucket,
            Key: candidate,
            Body: args.bytes,
            ContentType: args.mime,
            ContentLength: args.bytes.byteLength,
            IfNoneMatch: "*",
          })
        );
        originalKey = candidate;
        break;
      } catch (err) {
        if (isPreconditionFailed(err)) continue;
        rethrowR2("PutObject", candidate, err);
      }
    }
    if (originalKey === null) {
      throw new Error("Filename too contested — rename and try again");
    }

    let thumbMime: string | null = null;
    if (args.thumb) {
      const thumbKey = deriveThumbKey(originalKey);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: env.bucket,
            Key: thumbKey,
            Body: args.thumb.bytes,
            ContentType: args.thumb.mime,
            ContentLength: args.thumb.bytes.byteLength,
          })
        );
      } catch (err) {
        rethrowR2("PutObject (thumb)", thumbKey, err);
      }
      thumbMime = args.thumb.mime;
    }

    let mediumMime: string | null = null;
    if (args.medium) {
      const mediumKey = deriveMediumKey(originalKey);
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: env.bucket,
            Key: mediumKey,
            Body: args.medium.bytes,
            ContentType: args.medium.mime,
            ContentLength: args.medium.bytes.byteLength,
          })
        );
      } catch (err) {
        rethrowR2("PutObject (medium)", mediumKey, err);
      }
      mediumMime = args.medium.mime;
    }

    return { ref: originalKey, thumbMime, mediumMime };
  }

  /**
   * PUT bytes at an explicit derived-key (e.g. the `-medium.webp` variant of
   * an already-stored original). No collision suffix is applied — caller owns
   * the key derivation. Used by the medium-variant backfill script.
   */
  async putDerivedVariant(key: string, bytes: Uint8Array, mime: string): Promise<void> {
    const { client, env } = this.clientAndEnv();
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: env.bucket,
          Key: key,
          Body: bytes,
          ContentType: mime,
          ContentLength: bytes.byteLength,
        })
      );
    } catch (err) {
      rethrowR2("PutObject (derived variant)", key, err);
    }
  }

  async remove(db: DbClient, id: string, ref: string, hasThumb: boolean, hasMedium = false): Promise<void> {
    // Delete the row first so even if R2 cleanup fails, the row is gone
    // (admin UI no longer references the object; leaked R2 objects are cheap).
    await db.execute({
      sql: "DELETE FROM media WHERE id = ? AND tenant_id = 1",
      args: [id],
    });

    await this.deleteObjects(ref, hasThumb, hasMedium);
  }
}
