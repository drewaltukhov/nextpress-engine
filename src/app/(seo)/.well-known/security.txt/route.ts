import { NextResponse } from "next/server";
import { db } from "@core/db/instance";
import { getSetting } from "@core-plugins/settings/registry";
import { resolveSiteUrl } from "@core/site-url";

export const dynamic = "force-dynamic";
export const revalidate = 86400;

// RFC 9116 — security.txt. Lets researchers find a vulnerability
// reporting channel without guessing addresses. `Expires:` is required;
// we rebuild every 24h and stamp it one year out so the file stays
// fresh as long as the site is being served. The contact / encryption /
// policy fields all source from site settings — admins can configure
// them in /admin/settings → SEO without code edits.
export async function GET() {
  const [siteUrl, contact, encryption, policy, ack, lang, hiring] = await Promise.all([
    resolveSiteUrl(db()),
    getSetting<string>(db(), "security.contact"),
    getSetting<string>(db(), "security.encryption"),
    getSetting<string>(db(), "security.policy"),
    getSetting<string>(db(), "security.acknowledgments"),
    getSetting<string>(db(), "security.preferred_languages"),
    getSetting<string>(db(), "security.hiring"),
  ]);

  const expires = new Date();
  expires.setFullYear(expires.getFullYear() + 1);

  const fallbackContact = siteUrl
    ? `${siteUrl.replace(/\/$/, "")}/admin/login`
    : "https://example.com/admin/login";

  const lines = [
    `Contact: ${contact?.trim() || fallbackContact}`,
    `Expires: ${expires.toISOString()}`,
    siteUrl ? `Canonical: ${siteUrl.replace(/\/$/, "")}/.well-known/security.txt` : null,
    policy?.trim() ? `Policy: ${policy.trim()}` : null,
    ack?.trim() ? `Acknowledgments: ${ack.trim()}` : null,
    encryption?.trim() ? `Encryption: ${encryption.trim()}` : null,
    lang?.trim() ? `Preferred-Languages: ${lang.trim()}` : "Preferred-Languages: en",
    hiring?.trim() ? `Hiring: ${hiring.trim()}` : null,
  ].filter(Boolean);

  return new NextResponse(lines.join("\n") + "\n", {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=3600",
    },
  });
}
