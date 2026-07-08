-- Mobile-responsive header (2026-05-19).
--
-- Brings the seeded `header` part up to the mobile-aware layout:
--   * the Layout block collapses to a one-line bar below 768px
--     (`mobileMode: "bar"`) — logo left, search + nav-hamburger right;
--   * the NavMenu becomes a left-edge slide-in drawer on mobile
--     (`mobileMode: "drawer"`).
-- Desktop (>= 768px) is unchanged — the quarter-half-quarter row.
--
-- `001_seed_defaults.sql` is an applied, checksum-locked migration and
-- must not be edited, so this follow-up carries the change. The puck_data
-- below mirrors the `header` part of `THEME_DEFAULTS` in
-- `themes/nextpresso/defaults.tsx` — keep the two in sync.
--
-- The `NOT LIKE '%"mobileMode"%'` guard skips any header that already
-- carries a mobile setting (already migrated, or hand-tuned in the
-- builder) so this never clobbers later edits.
UPDATE theme_data
SET puck_data = '{"content":[{"type":"Layout","props":{"id":"np-default-header-layout-1","variant":"quarter-half-quarter","col0":{"h":"left","v":"center"},"col1":{"h":"center","v":"center"},"col2":{"h":"right","v":"center"},"col3":{"h":"left","v":"top"},"col0Padding":{"top":0,"right":0,"bottom":0,"left":0},"col1Padding":{"top":0,"right":0,"bottom":0,"left":0},"col2Padding":{"top":0,"right":0,"bottom":0,"left":0},"col3Padding":{"top":0,"right":0,"bottom":0,"left":0},"marginTopRem":0,"marginBottomRem":0,"mobileMode":"bar"}}],"root":{},"zones":{"np-default-header-layout-1:col-0":[{"type":"SiteLogo","props":{"id":"np-default-header-logo-1","imageUrl":"","alt":"Site logo","href":"/","height":36}}],"np-default-header-layout-1:col-1":[{"type":"NavMenu","props":{"id":"np-default-header-nav-1","location":"primary","orientation":"horizontal","mobileMode":"drawer"}}],"np-default-header-layout-1:col-2":[{"type":"SearchBox","props":{"id":"np-default-header-search-1","placeholder":"Search…","display":"icon"}}]}}'
WHERE theme_slug = 'nextpresso'
  AND kind = 'part'
  AND name = 'header'
  AND puck_data NOT LIKE '%"mobileMode"%';
