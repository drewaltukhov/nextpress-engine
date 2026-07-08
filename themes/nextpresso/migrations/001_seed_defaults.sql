-- NextPresso default Puck data for the four shared parts and every
-- template inner zone. Consolidated final-state seed — this theme
-- ships as the platform default.
--
-- INSERT OR IGNORE keeps it idempotent: re-running boot won't blow
-- away edits made via the theme builder.
--
-- The puck_data JSON mirrors `THEME_DEFAULTS` in
-- `themes/nextpresso/defaults.tsx` exactly. If you change one,
-- change the other.

-- Header part.
INSERT OR IGNORE INTO theme_data (theme_slug, kind, name, puck_data) VALUES (
  'nextpresso', 'part', 'header',
  '{"content":[{"type":"Layout","props":{"id":"np-default-header-layout-1","variant":"quarter-half-quarter","col0":{"h":"left","v":"center"},"col1":{"h":"center","v":"center"},"col2":{"h":"right","v":"center"},"col3":{"h":"left","v":"top"},"col0Padding":{"top":0,"right":0,"bottom":0,"left":0},"col1Padding":{"top":0,"right":0,"bottom":0,"left":0},"col2Padding":{"top":0,"right":0,"bottom":0,"left":0},"col3Padding":{"top":0,"right":0,"bottom":0,"left":0},"marginTopRem":0,"marginBottomRem":0}}],"root":{},"zones":{"np-default-header-layout-1:col-0":[{"type":"SiteLogo","props":{"id":"np-default-header-logo-1","imageUrl":"","alt":"Site logo","href":"/","height":36}}],"np-default-header-layout-1:col-1":[{"type":"NavMenu","props":{"id":"np-default-header-nav-1","location":"primary","orientation":"horizontal"}}],"np-default-header-layout-1:col-2":[{"type":"SearchBox","props":{"id":"np-default-header-search-1","placeholder":"Search…","display":"icon"}}]}}'
);

-- Footer part.
INSERT OR IGNORE INTO theme_data (theme_slug, kind, name, puck_data) VALUES (
  'nextpresso', 'part', 'footer',
  '{"content":[{"type":"Layout","props":{"id":"np-default-footer-layout-1","variant":"quarter-half-quarter","col0":{"h":"left","v":"center"},"col1":{"h":"center","v":"center"},"col2":{"h":"right","v":"center"},"col3":{"h":"left","v":"top"},"col0Padding":{"top":0,"right":0,"bottom":0,"left":0},"col1Padding":{"top":0,"right":0,"bottom":0,"left":0},"col2Padding":{"top":0,"right":0,"bottom":0,"left":0},"col3Padding":{"top":0,"right":0,"bottom":0,"left":0},"marginTopRem":0,"marginBottomRem":0}}],"root":{},"zones":{"np-default-footer-layout-1:col-0":[{"type":"Text","props":{"id":"np-default-footer-copyright-1","text":"© [year]"}}],"np-default-footer-layout-1:col-1":[{"type":"NavMenu","props":{"id":"np-default-footer-nav-1","location":"footer","orientation":"horizontal"}}],"np-default-footer-layout-1:col-2":[{"type":"SocialIcons","props":{"id":"np-default-footer-social-1","links":{"facebook":"","x":"","instagram":"","linkedin":"","youtube":"","tiktok":"","whatsapp":"","pinterest":"","reddit":"","github":"","discord":"","telegram":"","email":""},"align":"right"}}]}}'
);

-- Left sidebar.
INSERT OR IGNORE INTO theme_data (theme_slug, kind, name, puck_data) VALUES (
  'nextpresso', 'part', 'left-sidebar',
  '{"content":[{"type":"SearchBox","props":{"id":"np-default-lsidebar-search-1","placeholder":"Search…","display":"input"}},{"type":"NavMenu","props":{"id":"np-default-lsidebar-menu-1","location":"sidebar","orientation":"vertical"}}],"root":{}}'
);

-- Right sidebar.
INSERT OR IGNORE INTO theme_data (theme_slug, kind, name, puck_data) VALUES (
  'nextpresso', 'part', 'right-sidebar',
  '{"content":[{"type":"PostsGrid","props":{"id":"np-default-rsidebar-posts-1","title":"Recent posts","layout":"list","limit":5,"topicSlug":""}}],"root":{}}'
);

-- Homepage.
INSERT OR IGNORE INTO theme_data (theme_slug, kind, name, puck_data) VALUES (
  'nextpresso', 'template', 'homepage',
  '{"content":[{"type":"HomepageMain","props":{"id":"np-default-home-main-1"}}],"root":{}}'
);

-- Single page.
INSERT OR IGNORE INTO theme_data (theme_slug, kind, name, puck_data) VALUES (
  'nextpresso', 'template', 'single-page',
  '{"content":[{"type":"PageTitle","props":{"id":"np-default-page-title-1"}},{"type":"PageContent","props":{"id":"np-default-page-content-1"}}],"root":{}}'
);

-- Single post.
INSERT OR IGNORE INTO theme_data (theme_slug, kind, name, puck_data) VALUES (
  'nextpresso', 'template', 'single-post',
  '{"content":[{"type":"PostFeaturedImage","props":{"id":"np-default-post-featured-1","rounded":true,"aspect":"original"}},{"type":"PostTitle","props":{"id":"np-default-post-title-1"}},{"type":"PostMeta","props":{"id":"np-default-post-meta-1","showAuthor":true,"nameSource":"displayName","authorPrefix":"By","linkAuthor":true,"showDate":true,"showTopics":true}},{"type":"PostContent","props":{"id":"np-default-post-content-1"}}],"root":{}}'
);

-- Topic archive.
INSERT OR IGNORE INTO theme_data (theme_slug, kind, name, puck_data) VALUES (
  'nextpresso', 'template', 'topic-archive',
  '{"content":[{"type":"TopicArchiveHeader","props":{"id":"np-default-topic-header-1","showDescription":true}},{"type":"PostsGrid","props":{"id":"np-default-topic-posts-1","title":"","layout":"list","limit":20,"topicSlug":""}}],"root":{}}'
);

-- Search results.
INSERT OR IGNORE INTO theme_data (theme_slug, kind, name, puck_data) VALUES (
  'nextpresso', 'template', 'search-results',
  '{"content":[{"type":"SearchResults","props":{"id":"np-default-search-results-1","resultsPerPage":10,"showThumbnails":true,"paginationStyle":"numbered","paginationType":"buttons","paginationAlign":"center"}}],"root":{}}'
);

-- 404.
INSERT OR IGNORE INTO theme_data (theme_slug, kind, name, puck_data) VALUES (
  'nextpresso', 'template', 'not-found',
  '{"content":[{"type":"NotFoundMessage","props":{"id":"np-default-404-1","title":"Page not found","body":"We couldn''t find the page you''re looking for.","ctaText":"Back to homepage","ctaHref":"/"}}],"root":{}}'
);
