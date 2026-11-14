import { describe, it, expect, beforeAll, vi } from "vitest";
import { STAFF, staffDb } from "../helpers/staff-db";

// An uploaded SVG served from the site's own origin can run script in the
// site's context when opened directly. DB-stored media is served inline from
// /media/<id>, so responses get nosniff and SVGs an attachment disposition
// (the sandboxing CSP comes from next.config.ts); <img> embedding is unaffected (security audit
// 2026-11-12, nextpress:media:svg-upload-served-same-origin-unsanitized).

vi.mock("next/cache", () => ({
  revalidatePath: () => {},
  revalidateTag: () => {},
  unstable_cache: (fn: (...a: unknown[]) => unknown) => fn,
}));

const { db, ready } = staffDb("media-svg-headers");
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

beforeAll(async () => {
  await ready;
  await import("@core/db/instance");
  const ins = (id: string, mime: string, data: Buffer) =>
    db.execute({
      sql: "INSERT INTO media (id, filename, mime, size_bytes, blob_data, storage_backend, storage_ref, uploaded_by) VALUES (?, ?, ?, ?, ?, 'db', ?, ?)",
      args: [id, `${id}.x`, mime, data.byteLength, data, id, STAFF.author.id],
    });
  await ins("svg-1", "image/svg+xml", SVG);
  await ins("png-1", "image/png", PNG);
});

async function get(id: string) {
  const { GET } = await import("@/app/media/[id]/route");
  return GET(new Request(`http://localhost/media/${id}`), { params: Promise.resolve({ id }) });
}

describe("GET /media/<id>", () => {
  // The sandboxing CSP is set in next.config.ts (tests/unit/config/media-csp.test.ts).
  it("serves a DB-stored SVG nosniff and as an attachment", async () => {
    const res = await get("svg-1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("content-disposition")).toMatch(/^attachment/);
  });

  it("leaves other images inline", async () => {
    const res = await get("png-1");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-disposition")).toBeNull();
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });
});

describe("mediaSafetyHeaders", () => {
  it("is the same for every media route", async () => {
    const { mediaSafetyHeaders } = await import("@core-plugins/media/safety-headers");
    expect(mediaSafetyHeaders("image/svg+xml", "logo.svg")["Content-Disposition"]).toMatch(/^attachment/);
    expect(mediaSafetyHeaders("image/webp", "a.webp")["Content-Disposition"]).toBeUndefined();
  });
});
