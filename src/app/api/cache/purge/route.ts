import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

export const dynamic = "force-dynamic";

// All `nextpress:*` tags registered via `unstable_cache` in service modules.
// Mirror replaces every row wholesale, so every tag must be invalidated. New
// tags added in service modules belong in this list — grep `_CACHE_TAG =` and
// `tags: [` to audit.
const TAGS = [
  "nextpress:menus",
  "nextpress:pages",
  "nextpress:posts",
  "nextpress:redirects",
  "nextpress:ip-access",
  "nextpress:settings",
  "nextpress:topics",
  "nextpress:roles",
  "nextpress:user",
  "nextpress:plugins",
  "nextpress:theme",
] as const;

function bearerEquals(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  const expected = process.env.CACHE_PURGE_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { ok: false, error: "CACHE_PURGE_TOKEN not configured" },
      { status: 503 },
    );
  }

  const header = req.headers.get("authorization") ?? "";
  const provided = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!provided || !bearerEquals(provided, expected)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  for (const tag of TAGS) revalidateTag(tag, "max");
  revalidatePath("/", "layout");
  return NextResponse.json({
    ok: true,
    revalidated: { path: "/", scope: "layout", tags: TAGS },
  });
}
