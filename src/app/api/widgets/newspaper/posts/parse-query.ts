/**
 * Discriminated parsed query for the newspaper posts endpoint. Splits
 * single-scope and all-scope queries so each downstream handler doesn't
 * have to re-discriminate.
 */
export type ParsedNewspaperQuery =
  | {
      kind: "single";
      type: "pillar" | "topic";
      key: string;
      limit: number;
      offset: number;
    }
  | {
      kind: "all";
      allType: "pillar" | "topic";
      keys: string[];
      limit: number;
      offset: number;
    };

export type ParseResult =
  | { ok: true; value: ParsedNewspaperQuery }
  | { ok: false; error: string };

const TOPIC_SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const PILLAR_ID_RE = /^[1-9][0-9]*$/;

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  if (raw == null) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/**
 * Validate + parse `URLSearchParams` for `/api/widgets/newspaper/posts`.
 * Pure: no DB, no env. Tests exercise every branch.
 */
export function parseNewspaperQuery(params: URLSearchParams): ParseResult {
  const type = params.get("type");
  const limit = clampInt(params.get("limit"), 1, 24, 5);
  const offset = clampInt(params.get("offset"), 0, 200, 0);

  if (type !== "pillar" && type !== "topic" && type !== "all") {
    return { ok: false, error: "type must be pillar | topic | all" };
  }

  if (type === "all") {
    const allType = params.get("allType");
    const scopesRaw = params.get("scopes");
    if (allType !== "pillar" && allType !== "topic") {
      return { ok: false, error: "allType must be pillar | topic when type=all" };
    }
    // `scopes` may be absent or empty — that's the "no narrowing"
    // sentinel used by the Newspaper widgets when the picker is in
    // its "all checked" state. Handler skips the pillar/topic filter
    // when keys is empty and returns the full feed (capped to limit).
    const keys = (scopesRaw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (keys.length > 50) {
      return { ok: false, error: "scopes: maximum 50 keys allowed" };
    }
    const re = allType === "pillar" ? PILLAR_ID_RE : TOPIC_SLUG_RE;
    for (const k of keys) {
      if (!re.test(k)) return { ok: false, error: `invalid scope key: ${k}` };
    }
    return { ok: true, value: { kind: "all", allType, keys, limit, offset } };
  }

  const scope = params.get("scope");
  if (!scope) return { ok: false, error: "scope required when type=pillar|topic" };
  const re = type === "pillar" ? PILLAR_ID_RE : TOPIC_SLUG_RE;
  if (!re.test(scope)) {
    return { ok: false, error: `invalid scope: ${scope}` };
  }
  return { ok: true, value: { kind: "single", type, key: scope, limit, offset } };
}
