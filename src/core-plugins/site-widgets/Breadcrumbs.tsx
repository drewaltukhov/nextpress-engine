import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import type { PageDetail } from "@core-plugins/pages";
import type { PostDetail } from "@core-plugins/posts";
import type { TopicListItem } from "@core-plugins/topics";
import type { AuthorProfile } from "@core-plugins/users";
import { BuilderCard } from "@core/blocks/BuilderCard";
import { blockSelectField } from "@core/blocks/BlockSelect";

/**
 * Auto-built breadcrumb trail for the current route. Reads the route
 * context off `puck.metadata` (set by render.tsx) and builds a
 * Home › … › Current chain.
 *
 * Multi-level safe: spike posts include their full ancestor chain via
 * `metadata.postAncestors` — render.tsx walks `parentId` root-ward so
 * any depth (Pillar → Spike → sub-spike → …) renders correctly today
 * and also when the data model adds deeper nesting later. The widget
 * itself doesn't care how many levels there are.
 *
 * For spike posts the user can pick:
 *   - `full`    → Home › Pillar › … › Current spike  (default)
 *   - `pillar`  → Home › Pillar  (link to root pillar; current title hidden)
 */

interface PostAncestorMd {
  title: string;
  slug: string;
  url: string;
}

interface PuckMetadataShape {
  page?: PageDetail;
  post?: PostDetail;
  postAncestors?: PostAncestorMd[];
  topic?: TopicListItem;
  author?: AuthorProfile;
  searchQuery?: string;
}

export type SpikeBreadcrumbMode = "full" | "pillar";

export interface BreadcrumbsProps {
  /** Separator rendered between crumbs. Plain text — anything goes. */
  delimiter: string;
  showOnHomepage: boolean;
  /** When the current post is a spike (i.e. has ancestors), the user
   *  can either show the full chain or stop at the first ancestor
   *  (the pillar / root) and hide everything beneath it. */
  spikeMode: SpikeBreadcrumbMode;
  homeLabel: string;
}

interface Crumb {
  label: string;
  /** Absolute URL or null for the current page (no link). */
  href: string | null;
}

function buildCrumbs(
  md: PuckMetadataShape,
  homeLabel: string,
  spikeMode: SpikeBreadcrumbMode,
): Crumb[] {
  const home: Crumb = { label: homeLabel, href: "/" };

  // Single post — pillar / standalone / spike. Ancestors come from
  // metadata.postAncestors (root → immediate parent), the current
  // post is appended at the end. spikeMode controls whether the
  // current spike title is included.
  if (md.post) {
    const post = md.post;
    const ancestors = md.postAncestors ?? [];
    if (ancestors.length === 0) {
      // Pillar or standalone — single crumb.
      return [home, { label: post.title, href: null }];
    }
    if (spikeMode === "pillar") {
      // Truncate to the root pillar — ignore any intermediate
      // ancestors and the current spike title.
      const root = ancestors[0];
      return [home, { label: root.title, href: null }];
    }
    // Full chain.
    const trail: Crumb[] = ancestors.map((a) => ({ label: a.title, href: a.url }));
    trail.unshift(home);
    trail.push({ label: post.title, href: null });
    return trail;
  }

  if (md.page) {
    return [home, { label: md.page.title, href: null }];
  }

  if (md.topic) {
    return [home, { label: md.topic.name, href: null }];
  }

  if (md.author) {
    return [
      home,
      { label: "Authors", href: null },
      { label: md.author.displayName, href: null },
    ];
  }

  if (md.searchQuery !== undefined) {
    const q = md.searchQuery.trim();
    return [
      home,
      { label: q ? `Search: ${q}` : "Search", href: null },
    ];
  }

  return [];
}

function renderCrumbsList(crumbs: Crumb[], delimiter: string) {
  return (
    <nav className="np-breadcrumbs not-prose mb-4 text-sm text-slate-500" aria-label="Breadcrumb">
      <ol className="m-0 flex flex-wrap items-center gap-x-1 gap-y-1 p-0 list-none">
        {crumbs.map((c, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={`${i}-${c.label}`} className="flex items-center gap-1">
              {i > 0 ? (
                <span aria-hidden="true" className="text-slate-300">
                  {delimiter}
                </span>
              ) : null}
              {c.href && !isLast ? (
                <a
                  href={c.href}
                  className="hover:text-brand-green transition-colors"
                >
                  {c.label}
                </a>
              ) : (
                <span
                  className={isLast ? "text-slate-900 font-medium" : "text-slate-700"}
                  aria-current={isLast ? "page" : undefined}
                >
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export const Breadcrumbs: ComponentConfig<BreadcrumbsProps> = {
  label: "Breadcrumbs",
  fields: {
    homeLabel: { type: "text", label: "Home label" },
    delimiter: { type: "text", label: "Delimiter (e.g. ›, /, →, •)" },
    showOnHomepage: {
      type: "radio",
      label: "Show on homepage",
      options: [
        { label: "No", value: false },
        { label: "Yes", value: true },
      ],
    },
    spikeMode: blockSelectField<SpikeBreadcrumbMode>({
      label: "For child posts (spikes)",
      options: [
        { label: "Show full path (Pillar › … › Spike)", value: "full" },
        { label: "Limit to root pillar", value: "pillar" },
      ],
    }),
  },
  defaultProps: {
    homeLabel: "Home",
    delimiter: "›",
    showOnHomepage: false,
    spikeMode: "full",
  },
  render: (props) => {
    if (props.puck?.isEditing) {
      return (
        <BuilderCard name="Breadcrumbs"
          title="Breadcrumbs"
          description={`Auto-built from the current route. Delimiter: "${props.delimiter ?? "›"}". Spikes: ${props.spikeMode === "pillar" ? "limit to pillar" : "full path"}.`}
        />
      );
    }

    const md = (props.puck?.metadata ?? {}) as PuckMetadataShape;
    const isHomepage =
      !md.post && !md.page && !md.topic && !md.author && md.searchQuery === undefined;

    if (isHomepage) {
      if (!props.showOnHomepage) return <></>;
      // Single Home crumb on the homepage — no link, since you're
      // already there.
      return renderCrumbsList(
        [{ label: props.homeLabel, href: null }],
        props.delimiter || "›",
      );
    }

    const crumbs = buildCrumbs(md, props.homeLabel, props.spikeMode ?? "full");
    if (crumbs.length === 0) return <></>;
    return renderCrumbsList(crumbs, props.delimiter || "›");
  },
};

export const BreadcrumbsBlock: Omit<RegisteredBlock, "source"> = {
  name: "Breadcrumbs",
  config: Breadcrumbs,
  // Useful in either rail (sidebar) or any inner template — it's
  // tiny and adapts to the route it lands on.
  surfaces: [
    "sidebar",
    "template-homepage",
    "template-single-page",
    "template-single-post",
    "template-single-pillar",
    "template-topic-archive",
    "template-search-results",
    "template-author",
    "template-not-found",
  ],
  category: "Template",
};
