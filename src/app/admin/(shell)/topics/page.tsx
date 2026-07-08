import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { getEffectivePermissions, hasPermission } from "@core-plugins/users/permissions";
import { getActiveThemeSlug, listTemplates } from "@core-plugins/themes/service";
import { getTopics } from "./actions";
import { TopicsPageClient } from "./TopicsPageClient";

export const metadata: Metadata = { title: "Topics" };

export default async function TopicsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin");
  const perms = await getEffectivePermissions(db(), session.user.roles ?? []);
  if (!hasPermission(perms, "topics.manage")) redirect("/admin");

  const [topics, activeThemeSlug] = await Promise.all([
    getTopics(),
    getActiveThemeSlug(db()),
  ]);

  // Custom Topic Archive templates for the active theme. When no theme
  // is active or the theme has no customs, the dialog/list show only
  // the built-in default option.
  const customTopicTemplates: { slug: string; displayName: string }[] = [];
  if (activeThemeSlug) {
    const { customsByParent } = await listTemplates(db(), activeThemeSlug);
    for (const row of customsByParent["topic-archive"] ?? []) {
      customTopicTemplates.push({ slug: row.slug, displayName: row.displayName });
    }
  }

  return (
    <TopicsPageClient
      initial={topics}
      customTopicTemplates={customTopicTemplates}
    />
  );
}
