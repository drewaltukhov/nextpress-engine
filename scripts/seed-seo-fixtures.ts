import { db } from "../src/core/db/instance";
import { SCHEMA_CATALOG } from "../src/core-plugins/seo/schema-catalog";

const TITLE_PREFIX = "SEO Fixture: ";
const PILLAR_NAMES = ["Coffee Equipment", "Brewing Methods", "Bean Origins", "Cafe Culture"];
const SPIKE_TITLES_PER_PILLAR = 3;
const STANDALONE_COUNT = 2;
const PAGE_COUNT = 5;

// Mulberry32 deterministic RNG — identical fixture content across machines.
function makeRng(seed: number): () => number {
  let s = seed;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickN<T>(rng: () => number, arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  const out: T[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(rng() * copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

const LOREM =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";

function buildBody(_rng: () => number): string {
  const paragraphs: string[] = [];
  for (let i = 0; i < 5; i++) paragraphs.push(`<p>${LOREM}</p>`);
  return paragraphs.join("\n");
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function deleteFixtures(): Promise<void> {
  const client = db();
  await client.execute({
    sql: "DELETE FROM posts WHERE tenant_id=1 AND title LIKE 'SEO Fixture: %'",
    args: [],
  });
  await client.execute({
    sql: "DELETE FROM pages WHERE tenant_id=1 AND title LIKE 'SEO Fixture: %'",
    args: [],
  });
  console.log("[seed] deleted existing SEO fixtures");
}

async function loadTopicIds(): Promise<number[]> {
  const r = await db().execute({
    sql: "SELECT id FROM topics WHERE tenant_id=1",
    args: [],
  });
  return r.rows.map((row) => Number(row.id));
}

async function loadMediaIds(): Promise<string[]> {
  // media.id is TEXT (UUID), not integer — public URLs are /media/<uuid>.
  const r = await db().execute({ sql: "SELECT id FROM media", args: [] });
  return r.rows.map((row) => String(row.id));
}

async function ensureAllCatalogSchemasEnabled(): Promise<void> {
  // Anything not in seo.enabled_schemas is hidden from authors AND from
  // the schema-emission pipeline. The audit needs every catalog type
  // visible so it can validate them on fixture posts. Union the catalog
  // into the existing setting (preserve any user-added types we don't
  // know about).
  const catalog = SCHEMA_CATALOG.map((c) => c.type);
  const r = await db().execute({
    sql: "SELECT value FROM site_settings WHERE key='seo.enabled_schemas' LIMIT 1",
    args: [],
  });
  let existing: string[] = [];
  if (r.rows[0] != null) {
    const raw = String(r.rows[0].value);
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) existing = parsed.filter((x): x is string => typeof x === "string");
    } catch {
      // fall through — replace whatever was there
    }
  }
  const merged = Array.from(new Set([...existing, ...catalog]));
  const valueJson = JSON.stringify(merged);
  if (r.rows[0] != null) {
    await db().execute({
      sql: "UPDATE site_settings SET value=?, updated_at=CURRENT_TIMESTAMP WHERE key='seo.enabled_schemas'",
      args: [valueJson],
    });
  } else {
    await db().execute({
      sql: `INSERT INTO site_settings (key, value, autoload, scope, encrypted, updated_at)
            VALUES ('seo.enabled_schemas', ?, 1, 'global', 0, CURRENT_TIMESTAMP)`,
      args: [valueJson],
    });
  }
  console.log(`[seed] seo.enabled_schemas now lists ${merged.length} types`);
}

async function fixtureExists(title: string, tableName: "posts" | "pages"): Promise<boolean> {
  const r = await db().execute({
    sql: `SELECT 1 FROM ${tableName} WHERE tenant_id=1 AND title=? LIMIT 1`,
    args: [title],
  });
  return r.rows.length > 0;
}

interface InsertPostArgs {
  title: string;
  slug: string;
  body: string;
  postKind: "pillar" | "spike" | "standalone";
  parentId: number | null;
  schemaTypes: string[];
  seoTitle: string | null;
  seoDescription: string | null;
  featuredImage: string | null;
}

async function insertPost(args: InsertPostArgs): Promise<number> {
  const r = await db().execute({
    sql: `INSERT INTO posts
            (tenant_id, title, slug, content_json, excerpt, status, published_at,
             post_kind, parent_id, featured_image,
             seo_title, seo_description, schema_types)
          VALUES (1, ?, ?, ?, ?, 'published', CURRENT_TIMESTAMP,
                  ?, ?, ?, ?, ?, ?)`,
    args: [
      args.title,
      args.slug,
      JSON.stringify({
        root: {},
        content: [{ type: "RichText", props: { html: args.body } }],
        zones: {},
      }),
      args.body.replace(/<[^>]+>/g, "").slice(0, 200),
      args.postKind,
      args.parentId,
      args.featuredImage,
      args.seoTitle,
      args.seoDescription,
      JSON.stringify(args.schemaTypes),
    ],
  });
  return Number(r.lastInsertRowid);
}

interface InsertPageArgs {
  title: string;
  slug: string;
  body: string;
  schemaTypes: string[];
  seoTitle: string | null;
  seoDescription: string | null;
}

async function insertPage(args: InsertPageArgs): Promise<number> {
  const r = await db().execute({
    sql: `INSERT INTO pages
            (tenant_id, title, slug, content_json, excerpt, status, published_at,
             seo_title, seo_description, schema_types)
          VALUES (1, ?, ?, ?, ?, 'published', CURRENT_TIMESTAMP, ?, ?, ?)`,
    args: [
      args.title,
      args.slug,
      JSON.stringify({
        root: {},
        content: [{ type: "RichText", props: { html: args.body } }],
        zones: {},
      }),
      args.body.replace(/<[^>]+>/g, "").slice(0, 200),
      args.seoTitle,
      args.seoDescription,
      JSON.stringify(args.schemaTypes),
    ],
  });
  return Number(r.lastInsertRowid);
}

async function attachTopics(postId: number, topicIds: number[]): Promise<void> {
  for (const tid of topicIds) {
    await db().execute({
      sql: "INSERT OR IGNORE INTO posts_topics (post_id, topic_id) VALUES (?, ?)",
      args: [postId, tid],
    });
  }
}

async function seed(): Promise<void> {
  const rng = makeRng(0xc0ffee);
  await ensureAllCatalogSchemasEnabled();
  const topicIds = await loadTopicIds();
  const mediaIds = await loadMediaIds();
  if (mediaIds.length === 0) {
    console.warn("[seed] WARNING: no media rows — fixtures will have no featured_image");
  }
  const allSchemaTypes = SCHEMA_CATALOG.map((c) => c.type);

  // Round-robin queue ensures every catalog entry gets covered at least once.
  const schemaQueue = [...allSchemaTypes];
  const nextSchema = (n: number): string[] => {
    const types: string[] = [];
    for (let i = 0; i < n; i++) {
      if (schemaQueue.length === 0) types.push(pick(rng, allSchemaTypes));
      else types.push(schemaQueue.shift() as string);
    }
    return types;
  };

  let pillarIdx = 0;
  for (const pillarName of PILLAR_NAMES) {
    const title = `${TITLE_PREFIX}${pillarName}`;
    const slug = slugify(`${TITLE_PREFIX}${pillarName}`);
    if (await fixtureExists(title, "posts")) {
      console.log(`[seed] skip (exists): ${title}`);
      pillarIdx++;
      continue;
    }
    const seoTitle = rng() < 0.33 ? `${pillarName} — The Complete Guide` : null;
    const seoDescription =
      rng() < 0.33 ? `Everything about ${pillarName.toLowerCase()}.` : null;
    const featured = mediaIds.length > 0 ? `/media/${pick(rng, mediaIds)}` : null;
    const pillarId = await insertPost({
      title,
      slug,
      body: buildBody(rng),
      postKind: "pillar",
      parentId: null,
      schemaTypes: nextSchema(1 + Math.floor(rng() * 2)),
      seoTitle,
      seoDescription,
      featuredImage: featured,
    });
    if (topicIds.length > 0) {
      await attachTopics(pillarId, pickN(rng, topicIds, 1 + Math.floor(rng() * 3)));
    }
    console.log(`[seed] +pillar #${pillarId}: ${title}`);

    for (let i = 0; i < SPIKE_TITLES_PER_PILLAR; i++) {
      const spikeName = `${pillarName} Deep Dive ${i + 1}`;
      const spikeTitle = `${TITLE_PREFIX}${spikeName}`;
      const spikeSlug = slugify(`${TITLE_PREFIX}${spikeName}-${pillarIdx}-${i}`);
      if (await fixtureExists(spikeTitle, "posts")) {
        console.log(`[seed] skip (exists): ${spikeTitle}`);
        continue;
      }
      const spikeSeoTitle = rng() < 0.33 ? `${spikeName} (SEO Override)` : null;
      const spikeSeoDescription =
        rng() < 0.33 ? `Spike description for ${spikeName.toLowerCase()}.` : null;
      const spikeFeatured = mediaIds.length > 0 ? `/media/${pick(rng, mediaIds)}` : null;
      const spikeId = await insertPost({
        title: spikeTitle,
        slug: spikeSlug,
        body: buildBody(rng),
        postKind: "spike",
        parentId: pillarId,
        schemaTypes: nextSchema(1 + Math.floor(rng() * 2)),
        seoTitle: spikeSeoTitle,
        seoDescription: spikeSeoDescription,
        featuredImage: spikeFeatured,
      });
      if (topicIds.length > 0) {
        await attachTopics(spikeId, pickN(rng, topicIds, 1 + Math.floor(rng() * 3)));
      }
      console.log(`[seed] +spike #${spikeId}: ${spikeTitle}`);
    }
    pillarIdx++;
  }

  for (let i = 0; i < STANDALONE_COUNT; i++) {
    const name = `Standalone Article ${i + 1}`;
    const title = `${TITLE_PREFIX}${name}`;
    const slug = slugify(`${TITLE_PREFIX}${name}`);
    if (await fixtureExists(title, "posts")) {
      console.log(`[seed] skip (exists): ${title}`);
      continue;
    }
    const id = await insertPost({
      title,
      slug,
      body: buildBody(rng),
      postKind: "standalone",
      parentId: null,
      schemaTypes: nextSchema(1),
      seoTitle: rng() < 0.33 ? `${name} (SEO)` : null,
      seoDescription: rng() < 0.33 ? `Standalone description ${i + 1}.` : null,
      featuredImage: mediaIds.length > 0 ? `/media/${pick(rng, mediaIds)}` : null,
    });
    if (topicIds.length > 0) {
      await attachTopics(id, pickN(rng, topicIds, 1 + Math.floor(rng() * 3)));
    }
    console.log(`[seed] +standalone #${id}: ${title}`);
  }

  for (let i = 0; i < PAGE_COUNT; i++) {
    const name = `Sample Page ${i + 1}`;
    const title = `${TITLE_PREFIX}${name}`;
    const slug = slugify(`${TITLE_PREFIX}${name}`);
    if (await fixtureExists(title, "pages")) {
      console.log(`[seed] skip (exists): ${title}`);
      continue;
    }
    const id = await insertPage({
      title,
      slug,
      body: buildBody(rng),
      schemaTypes: nextSchema(1),
      seoTitle: rng() < 0.33 ? `${name} — Featured` : null,
      seoDescription: rng() < 0.33 ? `Sample page description ${i + 1}.` : null,
    });
    console.log(`[seed] +page #${id}: ${title}`);
  }

  console.log("[seed] SEO fixtures seeded");
}

async function main(): Promise<void> {
  const reset = process.argv.includes("--reset");
  if (reset) {
    await deleteFixtures();
  }
  await seed();
  process.exit(0);
}

main().catch((err) => {
  console.error("[seed] failed:", err);
  process.exit(1);
});
