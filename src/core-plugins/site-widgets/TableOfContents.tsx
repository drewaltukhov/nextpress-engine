import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import { BuilderCard } from "@core/blocks/BuilderCard";

/**
 * Auto-generated Table of Contents for single-page / single-post.
 * Walks the rendered DOM (default scope: `.np-main`) for h2 / h3 / h4
 * once on mount, slugifies any heading without an id, and renders an
 * indented anchor list. Clicks smooth-scroll to the heading with a
 * configurable top offset so the destination doesn't kiss the
 * viewport edge.
 *
 * Settings come straight from issue #39:
 *   - per-level toggles (showH2, showH3, showH4)
 *   - vertical gap when scrolling (scrollOffsetPx)
 *   - smooth-scroll toggle
 *   - optional title above the list
 *   - advanced: scope selector (defaults to `.np-main`)
 *
 * Why the block render is a plain placeholder div (no client
 * component): the widget needs hooks (useState / useEffect) to
 * scrape the rendered DOM. Mounting a hooks-using component
 * through Puck's RSC `<Render>` is unreliable — the client-
 * reference boundary doesn't survive Puck's `jsx(Component.render,
 * props)` call path consistently, so React-server (or the SSR pass
 * downstream of it) ends up invoking the function with a null
 * dispatcher and `useState` crashes the page.
 *
 * Instead, the block emits a static `<div data-np-toc>` carrying
 * the widget's settings as `data-toc-*` attributes, and a separate
 * vanilla-JS bootstrapper (`TableOfContentsMounter`, mounted once
 * per route) scans for those placeholders on the client and
 * builds the TOC via direct DOM manipulation. No hooks, no
 * Puck/RSC boundary issues.
 */
export interface TableOfContentsProps {
  title: string;
  showH2: boolean;
  showH3: boolean;
  showH4: boolean;
  scrollOffsetPx: number;
  smoothScroll: boolean;
  scopeSelector: string;
}

export const TableOfContents: ComponentConfig<TableOfContentsProps> = {
  label: "Table of Contents",
  fields: {
    title: {
      type: "text",
      label: "Title",
    },
    showH2: {
      type: "radio",
      label: "Include H2",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    showH3: {
      type: "radio",
      label: "Include H3",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    showH4: {
      type: "radio",
      label: "Include H4",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
    scrollOffsetPx: {
      type: "number",
      label: "Scroll offset (px)",
      min: 0,
      max: 400,
      step: 8,
    },
    smoothScroll: {
      type: "radio",
      label: "Smooth scroll",
      options: [
        { label: "On", value: true },
        { label: "Off", value: false },
      ],
    },
    scopeSelector: {
      type: "text",
      label: "Content selector (advanced)",
    },
  },
  defaultProps: {
    title: "Contents",
    showH2: true,
    showH3: true,
    showH4: false,
    scrollOffsetPx: 80,
    smoothScroll: true,
    scopeSelector: ".np-main",
  },
  render: (props) => {
    if (props.puck?.isEditing) {
      const levels = [
        props.showH2 ? "H2" : null,
        props.showH3 ? "H3" : null,
        props.showH4 ? "H4" : null,
      ]
        .filter(Boolean)
        .join(" / ");
      return (
        <BuilderCard name="TableOfContents"
          title="Table of Contents"
          description={`Auto-generated from ${levels || "selected"} headings on the rendered page. Offset ${props.scrollOffsetPx ?? 80}px.`}
        />
      );
    }
    // Static placeholder. The page-level bootstrapper finds this
    // via `[data-np-toc]` and replaces its contents with the
    // generated list. We render no chrome here — the bootstrapper
    // emits the `<nav>` wrapper itself, and hides the placeholder
    // entirely if no matching headings are found.
    return (
      <div
        className="np-toc not-prose mb-4"
        data-np-toc=""
        data-toc-title={props.title ?? ""}
        data-toc-scope={props.scopeSelector || ".np-main"}
        data-toc-h2={props.showH2 ? "1" : "0"}
        data-toc-h3={props.showH3 ? "1" : "0"}
        data-toc-h4={props.showH4 ? "1" : "0"}
        data-toc-offset={String(props.scrollOffsetPx ?? 80)}
        data-toc-smooth={props.smoothScroll ? "1" : "0"}
      />
    );
  },
};

export const TableOfContentsBlock: Omit<RegisteredBlock, "source"> = {
  name: "TableOfContents",
  config: TableOfContents,
  // Sidebar is the natural home (and the StickyContainer pairs with
  // it). `template-single-post` / `template-single-page` are listed so
  // the widget can be dropped directly into the body if a layout
  // wants an inline TOC.
  surfaces: [
    "sidebar",
    "template-single-post",
    "template-single-pillar",
    "template-single-page",
  ],
  category: "Template",
};
