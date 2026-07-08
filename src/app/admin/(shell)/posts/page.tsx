import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { listActiveCustomsForParent } from "@core-plugins/themes";
import {
  getPostsList,
  getPostsAuthors,
  getPostsPermissions,
  getPillarOptions,
  getTopicFilterOptions,
} from "./actions";
import { PostsPageClient } from "./PostsPageClient";

export const metadata: Metadata = { title: "Posts" };

export default async function PostsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");

  const permissions = await getPostsPermissions();
  if (!permissions.userId) redirect("/admin");

  const [initialBundle, authors, pillars, topics, postTemplates, pillarTemplates] = await Promise.all([
    getPostsList(),
    getPostsAuthors(),
    getPillarOptions(),
    getTopicFilterOptions(),
    listActiveCustomsForParent(db(), "single-post"),
    listActiveCustomsForParent(db(), "single-pillar"),
  ]);

  return (
    <PostsPageClient
      permissions={permissions}
      initial={initialBundle}
      authors={authors}
      pillars={pillars}
      topics={topics}
      postTemplates={postTemplates}
      pillarTemplates={pillarTemplates}
    />
  );
}
