import { readFile, stat } from "node:fs/promises";
import { join, normalize } from "node:path";
import { NextResponse } from "next/server";

/**
 * Serve files shipped inside a theme's filesystem folder
 * (`themes/<slug>/...`) under the public URL `/api/themes/<slug>/...`.
 *
 * Themes are autonomous packages — their cover image, theme.css,
 * default logo, and other static assets live next to their code rather
 * than in the global `public/` directory. This route exposes those
 * assets at runtime without requiring a build-time copy step. Vercel's
 * serverless tracing is told (via `outputFileTracingIncludes` in
 * next.config.ts) to bundle theme image / CSS files for this route.
 *
 * Path traversal is blocked: a normalized, slug-prefixed path that
 * escapes the theme's directory returns 400.
 */

const MIME: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  svg: "image/svg+xml",
  ico: "image/x-icon",
  css: "text/css; charset=utf-8",
  js: "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  txt: "text/plain; charset=utf-8",
  woff: "font/woff",
  woff2: "font/woff2",
  ttf: "font/ttf",
  otf: "font/otf",
};

const SLUG_RE = /^[a-z][a-z0-9-]*$/;

function mimeFor(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

interface Params {
  params: Promise<{ slug: string; path: string[] }>;
}

export async function GET(_req: Request, { params }: Params): Promise<Response> {
  const { slug, path } = await params;

  if (!SLUG_RE.test(slug)) {
    return NextResponse.json({ error: "Invalid theme slug" }, { status: 400 });
  }
  if (!Array.isArray(path) || path.length === 0) {
    return NextResponse.json({ error: "Path required" }, { status: 400 });
  }

  // Normalise the joined path and confirm it stays inside the theme dir.
  // `..` segments inside `path[]` could otherwise let a request read
  // arbitrary files relative to process.cwd().
  const themeRoot = join(process.cwd(), "themes", slug);
  const requested = normalize(join(themeRoot, ...path));
  if (!requested.startsWith(themeRoot + "/") && requested !== themeRoot) {
    return NextResponse.json({ error: "Path traversal denied" }, { status: 400 });
  }

  let buf: Buffer;
  try {
    const info = await stat(requested);
    if (!info.isFile()) {
      return NextResponse.json({ error: "Not a file" }, { status: 404 });
    }
    buf = await readFile(requested);
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type": mimeFor(requested),
      "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=86400",
    },
  });
}
