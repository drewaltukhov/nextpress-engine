import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { RootProvider } from "fumadocs-ui/provider/next";
import type { ReactNode } from "react";
import { source } from "@/app/source";
// Docs-scoped polish — tables, inline code, list density, h2 rule.
// Scoped to `.fd-content` inside the file so it can't leak onto
// admin or public template surfaces.
import "./docs.css";

// `RootProvider` lives here (not in the root layout) so its bundled
// next-themes inline-script doesn't trigger React 19's script-tag
// warning on admin + public routes that don't need it. Search, theme,
// and other Fumadocs primitives only matter inside /docs anyway.
export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider>
      <DocsLayout
        tree={source.pageTree}
        nav={{
          title: "NextPress Docs",
        }}
      >
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
