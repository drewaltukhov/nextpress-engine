import { createClient } from "@libsql/client";

async function main() {
  const c = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN!,
  });

  const all = await c.execute(
    `SELECT id, theme_slug, kind, name, length(puck_data) AS len, updated_at
       FROM theme_data
      WHERE theme_slug = 'nextpresso' AND kind = 'template'
      ORDER BY name, id`,
  );
  console.log("All nextpresso TEMPLATE rows on Turso:");
  for (const r of all.rows) {
    console.log(`  id=${r.id}  name=${r.name}  len=${r.len}  updated=${r.updated_at}`);
  }

  console.log("\nHomepage template puck_data (id=1718):");
  const r = await c.execute(`SELECT puck_data FROM theme_data WHERE id = 1718`);
  const pd = String(r.rows[0]?.puck_data ?? "");
  console.log(pd);
}
main().catch((e) => { console.error(e); process.exit(1); });
