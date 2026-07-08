import { db } from "../src/core/db/instance";
import {
  parseHtmlHead,
  extractJsonLd,
  resolveUrlToDbRow,
  runChecks,
  type AuditReport,
  type UrlAuditReport,
} from "./seo-audit-utils";

const args = process.argv.slice(2);
function flag(name: string, def: string): string {
  const hit = args.find((a) => a === name || a.startsWith(`${name}=`));
  if (!hit) return def;
  if (hit.includes("=")) return hit.split("=", 2)[1];
  const idx = args.indexOf(hit);
  return args[idx + 1] ?? def;
}

const BASE_URL = flag("--base-url", "http://localhost:3000");
const REPORT_MODE = flag("--report", "stdout");

const COLOR = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
  bold: (s: string) => `\x1b[1m${s}\x1b[0m`,
};

async function fetchSitemap(): Promise<string[]> {
  const r = await fetch(`${BASE_URL}/sitemap.xml`);
  if (!r.ok) throw new Error(`sitemap fetch failed: ${r.status}`);
  const xml = await r.text();
  const out: string[] = [];
  const re = /<loc>([^<]+)<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1].trim());
  return out;
}

async function fetchPage(url: string): Promise<string> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`page fetch failed (${r.status}): ${url}`);
  return r.text();
}

async function getTitleSuffix(): Promise<string> {
  // Site title suffix is stored in site_settings as JSON-encoded string.
  // Try a few likely keys (the convention isn't centralized in this repo).
  const candidates = ["seo.title_suffix", "site.title_suffix", "site.title"];
  for (const key of candidates) {
    try {
      const r = await db().execute({
        sql: "SELECT value FROM site_settings WHERE key=? LIMIT 1",
        args: [key],
      });
      if (r.rows.length === 0) continue;
      const v = r.rows[0].value;
      if (typeof v !== "string") continue;
      let parsed: unknown = v;
      try {
        parsed = JSON.parse(v);
      } catch {
        // value not JSON — use raw
      }
      if (typeof parsed === "string" && parsed.length > 0) {
        // For seo.title_suffix the stored value IS the suffix (with leading
        // separator, e.g. " | NextPress"). For site.title we'd need to derive.
        return key === "seo.title_suffix" ? parsed : ` | ${parsed}`;
      }
    } catch {
      // try next
    }
  }
  return "";
}

async function auditUrl(url: string, titleSuffix: string): Promise<UrlAuditReport> {
  const html = await fetchPage(url);
  const head = parseHtmlHead(html);
  const jsonLd = extractJsonLd(head.jsonLdBlocks);
  const resolved = await resolveUrlToDbRow(url, BASE_URL, db());
  if (!resolved) {
    return {
      url,
      resolvedKind: "unknown",
      resolvedId: null,
      checks: [
        {
          kind: "title",
          status: "fail",
          message: "URL in sitemap but not resolved to any DB row",
        },
      ],
    };
  }
  if (resolved.kind === "homepage") {
    return { url, resolvedKind: "homepage", resolvedId: null, checks: [] };
  }
  const checks = runChecks({
    kind: resolved.kind,
    url,
    baseUrl: BASE_URL,
    head,
    jsonLd,
    row: resolved.row,
    titleSuffix,
  });
  return {
    url,
    resolvedKind: resolved.kind,
    resolvedId: resolved.id,
    checks,
  };
}

async function main(): Promise<void> {
  const titleSuffix = await getTitleSuffix();
  let urls: string[];
  try {
    urls = await fetchSitemap();
  } catch (err) {
    console.error("[audit] could not fetch sitemap:", (err as Error).message);
    console.error("[audit] is the dev server running on", BASE_URL, "?");
    process.exit(2);
  }

  const urlReports: UrlAuditReport[] = [];
  for (const url of urls) {
    try {
      urlReports.push(await auditUrl(url, titleSuffix));
    } catch (err) {
      urlReports.push({
        url,
        resolvedKind: "unknown",
        resolvedId: null,
        checks: [
          {
            kind: "title",
            status: "fail",
            message: `fetch error: ${(err as Error).message}`,
          },
        ],
      });
    }
  }

  let total = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  for (const ur of urlReports) {
    for (const c of ur.checks) {
      total++;
      if (c.status === "pass") passed++;
      else if (c.status === "fail") failed++;
      else skipped++;
    }
  }

  const report: AuditReport = {
    baseUrl: BASE_URL,
    fetchedAt: new Date().toISOString(),
    urls: urlReports,
    summary: { total, passed, failed, skipped },
  };

  if (REPORT_MODE === "json") {
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const ur of urlReports) {
      console.log(COLOR.bold(`\n${ur.url}`) + COLOR.dim(`  [${ur.resolvedKind}]`));
      if (ur.checks.length === 0) {
        console.log(COLOR.dim("  (no checks)"));
        continue;
      }
      for (const c of ur.checks) {
        const sign =
          c.status === "pass"
            ? COLOR.green("✓")
            : c.status === "fail"
              ? COLOR.red("✗")
              : COLOR.dim("·");
        const expected = c.expected != null ? `expected=${JSON.stringify(c.expected)}` : "";
        const actual = c.actual != null ? `actual=${JSON.stringify(c.actual)}` : "";
        const msg = c.message ? `(${c.message})` : "";
        const detail = [expected, actual, msg].filter(Boolean).join(" ");
        console.log(`  ${sign} ${c.kind} ${COLOR.dim(detail)}`);
      }
    }
    console.log(
      `\n${total} checks across ${urlReports.length} URLs — ` +
        `${COLOR.green(`${passed} pass`)}, ` +
        `${COLOR.red(`${failed} fail`)}, ` +
        `${COLOR.dim(`${skipped} skip`)}`,
    );
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[audit] crashed:", err);
  process.exit(2);
});
