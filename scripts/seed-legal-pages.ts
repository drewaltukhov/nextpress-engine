/**
 * One-shot dev seed: creates the /privacy and /security pages as real
 * Page records inside the CMS so they appear in /admin/pages and the
 * site owner can edit them like any other page. Also links both pages
 * into the existing `footer` menu so they're discoverable by visitors.
 *
 * Idempotent — re-running upserts on slug and skips menu items that
 * already reference the page. We never write directly to the pages
 * table; everything goes through the pages plugin's service functions
 * so cache invalidation + slug validation + SEO writes stay consistent
 * with what the admin UI does.
 *
 * Run: npm run seed:legal-pages
 */
import { createDbClient } from "../src/core/db/client";
import { readEnv } from "../src/core/env";
import {
  createPage,
  getPublishedPageBySlug,
  updatePage,
  updatePageSeo,
} from "../src/core-plugins/pages";
import { addMenuItem, getMenu, getMenuByLocation } from "../src/core-plugins/menus/service";

const TENANT_ID = 1;

interface SeedSpec {
  slug: string;
  title: string;
  description: string;
  bodyHtml: string;
}

const SEEDS: SeedSpec[] = [
  {
    slug: "privacy",
    title: "Privacy",
    description:
      "How this NextPress site handles personal information, cookies, analytics, and visitor data.",
    bodyHtml: `<p class="lead">How this site handles your information. This is a generic
starting point — the site owner should swap the placeholder copy for the
legally-correct policy for their jurisdiction. Nothing here is legal advice.</p>

<h2>What we collect</h2>
<ul>
  <li><strong>Server logs</strong> — every request leaves a short-lived
  record (IP address, requested URL, timestamp, user-agent) used to keep the
  site running and to investigate abuse.</li>
  <li><strong>Session cookies</strong> — when you sign in to the admin area
  we set <code>HttpOnly</code> cookies that identify your authenticated
  session. These are strictly necessary; without them there's no way to keep
  you signed in.</li>
  <li><strong>Account details</strong> — for admin users, the email address
  and (hashed) password you registered with.</li>
  <li><strong>Content you publish</strong> — posts, pages, media, and
  comments you create through the admin area are public by design.</li>
</ul>

<h2>What we do not collect</h2>
<ul>
  <li>No third-party advertising trackers.</li>
  <li>No cross-site tracking pixels.</li>
  <li>No analytics in the default install. The site owner may add
  privacy-respecting analytics later; if so, this page will be updated.</li>
</ul>

<h2>Cookies</h2>
<p>The only cookies set by default are session / auth cookies for signed-in
admin users (issued by NextAuth). They are <code>HttpOnly</code>,
<code>SameSite=Lax</code>, and scoped to this domain.</p>

<h2>Your rights</h2>
<p>You can request a copy of, or deletion of, any personal data we hold about
you by contacting the site owner. Account holders can change their own
password from the admin area.</p>

<h2>Security reporting</h2>
<p>If you believe you've found a security issue, please follow the
instructions at <a href="/.well-known/security.txt">/.well-known/security.txt</a>
or read the <a href="/security">security reporting policy</a>.</p>

<h2>Changes</h2>
<p>This document may change. Material updates will be announced on the site
front page.</p>`,
  },
  {
    slug: "security",
    title: "Security",
    description:
      "Security reporting policy, supported reporting channels, and what to expect after disclosing.",
    bodyHtml: `<p class="lead">How to report a vulnerability and what to expect after
you do. The machine-readable companion to this page lives at
<a href="/.well-known/security.txt">/.well-known/security.txt</a>.</p>

<h2>Found something?</h2>
<p>Please report it before sharing it publicly. The fastest path is the
contact channel listed in our <a href="/.well-known/security.txt">security.txt</a>.</p>

<h2>What's in scope</h2>
<ul>
  <li>The public site and all pages it serves.</li>
  <li>The <code>/admin</code> area and authentication flow.</li>
  <li>The JSON API under <code>/api/v1</code>.</li>
  <li>The media subsystem under <code>/media</code>.</li>
</ul>

<h2>What's out of scope</h2>
<ul>
  <li>Denial-of-service findings that require flooding production traffic.
  We trust our infrastructure provider's DDoS defences for that layer.</li>
  <li>Self-XSS, clickjacking on pages with no sensitive actions, or findings
  that require physical access to a signed-in admin's machine.</li>
  <li>Missing security headers on third-party assets the site does not
  control.</li>
</ul>

<h2>What to expect</h2>
<ol>
  <li>Acknowledgement within a few business days.</li>
  <li>A triage decision (accepted / duplicate / out-of-scope).</li>
  <li>A fix and disclosure timeline if accepted.</li>
</ol>

<h2>Coordinated disclosure</h2>
<p>We ask for a reasonable window — typically 90 days — between report and
public disclosure, so users have time to update. If the issue is being
actively exploited we'll move faster and coordinate with you on the
announcement.</p>

<h2>Hall of fame</h2>
<p>With your permission we'll credit you in our acknowledgements. We don't
currently offer monetary bounties.</p>`,
  },
];

function buildContentJson(slug: string, html: string): string {
  // Same shape the Puck editor saves — single RichText block with the
  // page body as inline HTML. RichText.tsx renders this via the public
  // sanitiser, so links / lists / headings render the same way the
  // editor preview shows them.
  return JSON.stringify({
    root: { props: {} },
    content: [
      {
        type: "RichText",
        props: { id: `rt-${slug}`, html: html.trim() },
      },
    ],
  });
}

async function adminUserId(db: ReturnType<typeof createDbClient>): Promise<string | null> {
  // Prefer a real human admin if one exists; fall back to the seeded
  // admin@nextpress.local user. createdBy may be null on a fresh install
  // — pages still write successfully in that case (the admin UI shows
  // "Unknown author" until an editor saves over it).
  const r = await db.execute({
    sql: `SELECT u.id FROM users u
          INNER JOIN user_roles ur ON ur.user_id = u.id
          WHERE u.tenant_id = ? AND ur.role_slug = 'admin' AND u.status = 'active'
          ORDER BY u.created_at ASC LIMIT 1`,
    args: [TENANT_ID],
  });
  return r.rows[0]?.id ? String(r.rows[0].id) : null;
}

async function seedOne(
  db: ReturnType<typeof createDbClient>,
  spec: SeedSpec,
  createdBy: string | null,
): Promise<void> {
  const existing = await getPublishedPageBySlug(db, spec.slug);

  if (existing) {
    await updatePage(db, existing.id, {
      title: spec.title,
      contentJson: buildContentJson(spec.slug, spec.bodyHtml),
    });
    await updatePageSeo(db, existing.id, {
      seoDescription: spec.description,
    });
    console.log(`  updated /${spec.slug} (id=${existing.id})`);
    return;
  }

  const id = await createPage(db, {
    title: spec.title,
    slug: spec.slug,
    status: "published",
    createdBy,
  });
  await updatePage(db, id, {
    contentJson: buildContentJson(spec.slug, spec.bodyHtml),
  });
  await updatePageSeo(db, id, {
    seoDescription: spec.description,
  });
  console.log(`  created /${spec.slug} (id=${id})`);
}

async function linkFooterMenu(
  db: ReturnType<typeof createDbClient>,
  pageIds: { slug: string; title: string; id: number }[],
): Promise<void> {
  // `footer` is the canonical location for the secondary nav; the
  // default install seeds a "Footer Menu" pointing at it. If a site
  // owner has renamed or deleted that menu we just skip — the page
  // records still ship, owner can wire them up by hand later.
  const footer = await getMenuByLocation(db, "footer");
  if (!footer) {
    console.log("  no footer menu found — skipping menu link");
    return;
  }
  const detail = await getMenu(db, footer.id);
  if (!detail) return;

  const existingPageRefs = new Set(
    detail.items.filter((it) => it.itemType === "page").map((it) => it.referenceId),
  );
  for (const p of pageIds) {
    if (existingPageRefs.has(p.id)) {
      console.log(`  /${p.slug} already linked in footer menu`);
      continue;
    }
    const itemId = await addMenuItem(db, footer.id, {
      label: p.title,
      itemType: "page",
      referenceId: p.id,
    });
    console.log(`  linked /${p.slug} into footer menu (item id=${itemId})`);
  }
}

async function main() {
  const env = readEnv();
  const db = createDbClient({ databaseUrl: env.databaseUrl, authToken: env.authToken });
  const createdBy = await adminUserId(db);
  console.log(`Seeding legal pages (createdBy=${createdBy ?? "null"})…`);

  const seeded: { slug: string; title: string; id: number }[] = [];
  for (const spec of SEEDS) {
    await seedOne(db, spec, createdBy);
    const row = await getPublishedPageBySlug(db, spec.slug);
    if (row) seeded.push({ slug: spec.slug, title: spec.title, id: row.id });
  }

  await linkFooterMenu(db, seeded);
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
