import type { ThemeDefaults } from "@core-plugins/themes";

/**
 * NextPresso default Puck data for every part and template. Applied:
 * - Once when the theme is activated for the first time (only-missing-or-empty mode)
 * - Per-row when the builder's Reset to defaults button is clicked
 *
 * Block ids are stable strings (`np-default-*`) so future patches can
 * reference them predictably. Each value must include `root: {}` —
 * Puck's Render asserts on `data.root`.
 */

export const THEME_DEFAULTS: ThemeDefaults = {
  parts: {
    // Single `header` part — same Layout-driven shape as the new
    // footer. Default content is one Layout block in the
    // 1/4 + 1/2 + 1/4 variant: SiteLogo on the left, primary NavMenu
    // in the middle, SearchBox on the right. Editors can switch the
    // variant, change alignment / padding, or swap the inner blocks
    // for anything in the registry.
    header: {
      content: [
        {
          type: "Layout",
          props: {
            id: "np-default-header-layout-1",
            variant: "quarter-half-quarter",
            col0: { h: "left",   v: "center" },
            col1: { h: "center", v: "center" },
            col2: { h: "right",  v: "center" },
            col3: { h: "left",   v: "top" },
            col0Padding: { top: 0, right: 0, bottom: 0, left: 0 },
            col1Padding: { top: 0, right: 0, bottom: 0, left: 0 },
            col2Padding: { top: 0, right: 0, bottom: 0, left: 0 },
            col3Padding: { top: 0, right: 0, bottom: 0, left: 0 },
            marginTopRem: 0,
            marginBottomRem: 0,
            // Collapse to a one-line bar below 768px: logo pinned left,
            // search + nav-hamburger hug the right edge. Desktop keeps
            // the 1/4 + 1/2 + 1/4 row unchanged.
            mobileMode: "bar",
          },
        },
      ],
      root: {},
      zones: {
        "np-default-header-layout-1:col-0": [
          {
            type: "SiteLogo",
            props: {
              id: "np-default-header-logo-1",
              imageUrl: "",
              alt: "Site logo",
              href: "/",
              height: 36,
            },
          },
        ],
        "np-default-header-layout-1:col-1": [
          {
            type: "NavMenu",
            props: {
              id: "np-default-header-nav-1",
              location: "primary",
              orientation: "horizontal",
              // Inline links on desktop; a hamburger + slide-down panel
              // below 768px so the header collapses cleanly on phones.
              mobileMode: "drawer",
            },
          },
        ],
        "np-default-header-layout-1:col-2": [
          {
            type: "SearchBox",
            props: {
              id: "np-default-header-search-1",
              placeholder: "Search…",
              display: "icon",
            },
          },
        ],
      },
    },
    // Single `footer` part — replaces the old footer-left / -center /
    // -right triad. The default content is one Layout block in the
    // 1/4 + 1/2 + 1/4 variant, with the previous defaults (copyright,
    // primary footer menu, social icons) dropped into its three columns
    // as nested zone content. The user can switch the variant, change
    // alignment / padding, or drop different blocks per column from
    // the theme builder — same flexibility the page editor's Layout
    // already gives.
    footer: {
      content: [
        {
          type: "Layout",
          props: {
            id: "np-default-footer-layout-1",
            variant: "quarter-half-quarter",
            col0: { h: "left",   v: "center" },
            col1: { h: "center", v: "center" },
            col2: { h: "right",  v: "center" },
            col0Padding: { top: 0, right: 0, bottom: 0, left: 0 },
            col1Padding: { top: 0, right: 0, bottom: 0, left: 0 },
            col2Padding: { top: 0, right: 0, bottom: 0, left: 0 },
            col3Padding: { top: 0, right: 0, bottom: 0, left: 0 },
            col3: { h: "left",   v: "top" },
            marginTopRem: 0,
            marginBottomRem: 0,
          },
        },
      ],
      root: {},
      zones: {
        "np-default-footer-layout-1:col-0": [
          {
            type: "Text",
            props: { id: "np-default-footer-copyright-1", text: "© [year]" },
          },
        ],
        "np-default-footer-layout-1:col-1": [
          {
            type: "NavMenu",
            props: { id: "np-default-footer-nav-1", location: "footer", orientation: "horizontal" },
          },
        ],
        "np-default-footer-layout-1:col-2": [
          {
            type: "SocialIcons",
            props: {
              id: "np-default-footer-social-1",
              links: {
                facebook: "",
                x: "",
                instagram: "",
                linkedin: "",
                youtube: "",
                tiktok: "",
                whatsapp: "",
                pinterest: "",
                reddit: "",
                github: "",
                discord: "",
                telegram: "",
                email: "",
              },
              align: "right",
            },
          },
        ],
      },
    },
    "left-sidebar": {
      content: [
        {
          type: "SearchBox",
          props: { id: "np-default-lsidebar-search-1", placeholder: "Search…", display: "input" },
        },
        {
          type: "NavMenu",
          props: { id: "np-default-lsidebar-menu-1", location: "sidebar", orientation: "vertical" },
        },
      ],
      root: {},
    },
    "right-sidebar": {
      content: [
        {
          type: "PostsGrid",
          props: {
            id: "np-default-rsidebar-posts-1",
            title: "Recent posts",
            layout: "list",
            limit: 5,
            topicSlug: "",
          },
        },
      ],
      root: {},
    },
  },
  templates: {
    homepage: {
      content: [
        {
          type: "HomepageMain",
          props: {
            id: "np-default-home-main-1",
          },
        },
      ],
      root: {},
    },
    "single-page": {
      content: [
        { type: "PageTitle", props: { id: "np-default-page-title-1" } },
        { type: "PageContent", props: { id: "np-default-page-content-1" } },
      ],
      root: {},
    },
    "single-post": {
      content: [
        { type: "PostFeaturedImage", props: { id: "np-default-post-featured-1", rounded: true, aspect: "original" } },
        { type: "PostTitle", props: { id: "np-default-post-title-1" } },
        {
          type: "PostMeta",
          props: {
            id: "np-default-post-meta-1",
            showAuthor: true,
            nameSource: "displayName",
            authorPrefix: "By",
            linkAuthor: true,
            showDate: true,
            showTopics: true,
          },
        },
        { type: "PostContent", props: { id: "np-default-post-content-1" } },
      ],
      root: {},
    },
    "single-pillar": {
      content: [
        { type: "PostFeaturedImage", props: { id: "np-default-pillar-featured-1", rounded: true, aspect: "original" } },
        { type: "PostTitle", props: { id: "np-default-pillar-title-1" } },
        {
          type: "PostMeta",
          props: {
            id: "np-default-pillar-meta-1",
            showAuthor: true,
            nameSource: "displayName",
            authorPrefix: "By",
            linkAuthor: true,
            showDate: true,
            showTopics: true,
          },
        },
        { type: "PostContent", props: { id: "np-default-pillar-content-1" } },
      ],
      root: {},
    },
    "topic-archive": {
      content: [
        {
          type: "TopicArchiveHeader",
          props: { id: "np-default-topic-header-1", showDescription: true },
        },
        {
          type: "PostsGrid",
          props: {
            id: "np-default-topic-posts-1",
            title: "",
            layout: "list",
            limit: 20,
            topicSlug: "",
          },
        },
      ],
      root: {},
    },
    "not-found": {
      content: [
        {
          type: "NotFoundMessage",
          props: {
            id: "np-default-404-1",
            title: "Page not found",
            body: "We couldn't find the page you're looking for.",
            ctaText: "Back to homepage",
            ctaHref: "/",
          },
        },
      ],
      root: {},
    },
    "search-results": {
      content: [
        {
          type: "SearchResults",
          props: {
            id: "np-default-search-results-1",
            resultsPerPage: 10,
            showThumbnails: true,
            paginationStyle: "numbered",
            paginationType: "buttons",
            paginationAlign: "center",
          },
        },
      ],
      root: {},
    },
    author: {
      content: [
        {
          type: "AuthorAvatar",
          props: { id: "np-default-author-avatar-1", shape: "circle", maxWidthRem: 8, align: "left" },
        },
        {
          type: "AuthorName",
          props: { id: "np-default-author-name-1", nameSource: "displayName", as: "h1", align: "left" },
        },
        { type: "AuthorBio", props: { id: "np-default-author-bio-1" } },
        { type: "AuthorLinks", props: { id: "np-default-author-links-1", align: "left" } },
      ],
      root: {},
    },
  },
};
