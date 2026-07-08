import type { Metadata } from "next";
import { db } from "@core/db/instance";
import { BackupPageClient } from "./BackupPageClient";

export const metadata: Metadata = { title: "Backup & Restore" };

async function getMediaStats(): Promise<{ count: number; totalBytes: number }> {
  const res = await db().execute({
    sql: `SELECT COUNT(*) AS n, COALESCE(SUM(size_bytes), 0) AS total
          FROM media
          WHERE tenant_id = 1 AND storage_backend = 'db'`,
    args: [],
  });
  const row = res.rows[0];
  return {
    count: Number(row?.n ?? 0),
    totalBytes: Number(row?.total ?? 0),
  };
}

export default async function BackupPage() {
  const mediaStats = await getMediaStats();
  return <BackupPageClient mediaStats={mediaStats} />;
}
