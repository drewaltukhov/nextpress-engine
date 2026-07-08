import { defineDocs, defineConfig } from "fumadocs-mdx/config";

export const docs = defineDocs({
  dir: "docs",
});

export default defineConfig({
  mdxOptions: {
    // Use default MDX options from Fumadocs
  },
});
