#!/usr/bin/env -S npx tsx
/**
 * Audit which core engine settings are actually consumed by application
 * code vs registered-but-never-read.
 *
 * Scope (per the 2026-05-09 settings audit plan):
 *   - settings/definitions.ts (site, security, api, logging, maintenance, content, smtp, …)
 *   - seo/index.ts            (sitemap, schema toggles, verification, identity, title format)
 *   - redirects/index.ts      (redirect status, auto-create rules)
 *   - media/index.ts          (allowed mime types, max file size, webp conversion)
 *
 * NOT in scope: per-theme settings, per-plugin add-ons, content-type plugins,
 * page-builder configuration. Those are tracked by their owning plugin.
 *
 * Output: development_docs/audits/settings-wiring.md
 *
 * Re-run after changes: `npx tsx scripts/audit-settings-wiring.ts`
 *
 * Caveats:
 *   - Static. Catches "key never read" but can't tell if the value is
 *     used correctly (wrong direction, ignored, etc.).
 *   - "Wired" classification is path-based (public render dirs vs admin),
 *     not semantic — a public-route consumer may still be a no-op in
 *     practice. This is the "is it wired" half; behavior testing is a
 *     separate pass.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

interface SettingEntry {
  key: string;
  label?: string;
  source: string; // file the key was registered from
}

const REGISTRY_FILES = [
  "src/core-plugins/settings/definitions.ts",
  "src/core-plugins/seo/index.ts",
  "src/core-plugins/redirects/index.ts",
  "src/core-plugins/media/index.ts",
];

const REPORT_PATH = "development_docs/audits/settings-wiring.md";

function extractKeys(filePath: string): SettingEntry[] {
  const src = readFileSync(filePath, "utf8");
  const out: SettingEntry[] = [];
  // Match `{ key: "<key>", … label: "<label>" … }` blocks. Settings
  // definitions are object literals so we walk line-by-line and pair up
  // the immediately-following label/description with the key.
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const keyMatch = lines[i].match(/^\s*key:\s*"([^"]+)"/);
    if (!keyMatch) continue;
    let label: string | undefined;
    // Look forward up to ~10 lines for the matching label entry.
    for (let j = i + 1; j < Math.min(i + 10, lines.length); j++) {
      const labelMatch = lines[j].match(/^\s*label:\s*"([^"]+)"/);
      if (labelMatch) {
        label = labelMatch[1];
        break;
      }
    }
    out.push({ key: keyMatch[1], label, source: filePath });
  }
  return out;
}

function findConsumers(key: string): string[] {
  // git grep is fast and respects .gitignore. Match getSetting<…>(…, "key")
  // and the bare string literal — the latter catches cookie names + setting
  // keys read via custom helpers.
  let raw = "";
  try {
    raw = execSync(
      `git grep -l --fixed-strings '"${key}"' -- 'src/' 'themes/' || true`,
      { encoding: "utf8" },
    );
  } catch {
    raw = "";
  }
  return raw
    .split("\n")
    .filter((p) => p.length > 0)
    .filter((p) => !REGISTRY_FILES.includes(p)) // exclude the registry itself
    .filter((p) => !p.endsWith(".test.ts") && !p.endsWith(".test.tsx"));
}

function classify(consumers: string[]): {
  status: "wired" | "admin-only" | "orphan";
  publicConsumers: string[];
  adminConsumers: string[];
} {
  const adminConsumers: string[] = [];
  const publicConsumers: string[] = [];
  for (const c of consumers) {
    if (
      c.startsWith("src/app/admin/") ||
      c.startsWith("src/app/api/admin/")
    ) {
      adminConsumers.push(c);
    } else {
      publicConsumers.push(c);
    }
  }
  if (publicConsumers.length > 0) return { status: "wired", publicConsumers, adminConsumers };
  if (adminConsumers.length > 0) return { status: "admin-only", publicConsumers, adminConsumers };
  return { status: "orphan", publicConsumers, adminConsumers };
}

function main() {
  const allEntries: SettingEntry[] = [];
  for (const f of REGISTRY_FILES) {
    allEntries.push(...extractKeys(f));
  }
  // De-dupe (a key can only be registered once, but guard against accidents)
  const seen = new Set<string>();
  const entries = allEntries.filter((e) => {
    if (seen.has(e.key)) return false;
    seen.add(e.key);
    return true;
  });

  type Row = SettingEntry & ReturnType<typeof classify> & { consumers: string[] };
  const rows: Row[] = entries.map((e) => {
    const consumers = findConsumers(e.key);
    return { ...e, consumers, ...classify(consumers) };
  });

  // Group by status for the report
  const wired = rows.filter((r) => r.status === "wired");
  const adminOnly = rows.filter((r) => r.status === "admin-only");
  const orphan = rows.filter((r) => r.status === "orphan");

  const today = new Date().toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# Settings wiring audit`);
  lines.push("");
  lines.push(`*Generated ${today} by \`scripts/audit-settings-wiring.ts\`. Re-run after changing any setting registration or consumer.*`);
  lines.push("");
  lines.push(`## Summary`);
  lines.push("");
  lines.push(`- Total settings audited: **${rows.length}**`);
  lines.push(`- ✅ Wired (consumed in public render or non-admin code): **${wired.length}**`);
  lines.push(`- ⚠️ Admin-only (read only by admin chrome — round-trips through forms but no public surface uses it): **${adminOnly.length}**`);
  lines.push(`- ❌ Orphan (registered but never read anywhere): **${orphan.length}**`);
  lines.push("");
  lines.push(`## Scope`);
  lines.push("");
  lines.push(`Includes core engine settings only:`);
  for (const f of REGISTRY_FILES) lines.push(`- \`${f}\``);
  lines.push("");
  lines.push(`Excludes per-theme settings (\`theme.<slug>.*\`), plugin add-ons (weather/crypto-beat/google-news/structured-data), and content-type plugins (posts/pages/topics/menus/galleries).`);
  lines.push("");

  function writeRow(r: Row) {
    const label = r.label ? ` — *${r.label}*` : "";
    lines.push(`### \`${r.key}\`${label}`);
    lines.push("");
    lines.push(`Registered in \`${r.source}\``);
    lines.push("");
    if (r.publicConsumers.length > 0) {
      lines.push(`Public/render consumers:`);
      for (const c of r.publicConsumers) lines.push(`- \`${c}\``);
      lines.push("");
    }
    if (r.adminConsumers.length > 0) {
      lines.push(`Admin consumers:`);
      for (const c of r.adminConsumers) lines.push(`- \`${c}\``);
      lines.push("");
    }
    if (r.consumers.length === 0) {
      lines.push(`_No consumers found._`);
      lines.push("");
    }
  }

  if (orphan.length > 0) {
    lines.push(`## ❌ Orphan settings (${orphan.length})`);
    lines.push("");
    lines.push(`These keys are registered but no application code reads them. Either wire them up or delete the registration.`);
    lines.push("");
    for (const r of orphan) writeRow(r);
  }

  if (adminOnly.length > 0) {
    lines.push(`## ⚠️ Admin-only settings (${adminOnly.length})`);
    lines.push("");
    lines.push(`Read by admin code only. Confirm whether this is intentional (the value drives admin UX itself) or whether a public surface should be consulting it.`);
    lines.push("");
    for (const r of adminOnly) writeRow(r);
  }

  if (wired.length > 0) {
    lines.push(`## ✅ Wired settings (${wired.length})`);
    lines.push("");
    for (const r of wired) writeRow(r);
  }

  const out = lines.join("\n") + "\n";
  mkdirSync(dirname(REPORT_PATH), { recursive: true });
  writeFileSync(REPORT_PATH, out);

  // Also stream a terse summary to stdout so CI / dev runs see the totals.
  process.stdout.write(`Settings audit: ${rows.length} total → ${wired.length} wired / ${adminOnly.length} admin-only / ${orphan.length} orphan\n`);
  if (orphan.length > 0) {
    process.stdout.write(`  Orphans: ${orphan.map((r) => r.key).join(", ")}\n`);
  }
  if (adminOnly.length > 0) {
    process.stdout.write(`  Admin-only: ${adminOnly.map((r) => r.key).join(", ")}\n`);
  }
  process.stdout.write(`Report → ${REPORT_PATH}\n`);
}

main();
