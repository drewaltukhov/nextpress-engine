import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sha256 } from "./checksum";

export interface DiscoveredMigration {
  pluginSlug: string;
  fileName: string;
  fullPath: string;
  sql: string;
  checksum: string;
}

export interface DiscoverArgs {
  pluginSlug: string;
  dir: string;
}

export function discoverPluginMigrations(args: DiscoverArgs): DiscoveredMigration[] {
  if (!existsSync(args.dir)) return [];

  const entries = readdirSync(args.dir).filter((name) => name.toLowerCase().endsWith(".sql")).sort();

  return entries.map((fileName) => {
    const fullPath = join(args.dir, fileName);
    const sql = readFileSync(fullPath, "utf8");
    return {
      pluginSlug: args.pluginSlug,
      fileName,
      fullPath,
      sql,
      checksum: sha256(sql)
    };
  });
}
