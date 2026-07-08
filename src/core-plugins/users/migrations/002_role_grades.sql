-- Reshape role permissions from per-entity wildcards to per-grade permissions.
-- New permission strings: posts.new, posts.draft, pages.new, pages.draft,
-- media.add, media.delete. Admin keeps "*" (full access).
--
-- Drops the contributor role — Author now covers the draft-only use case.

DELETE FROM user_roles WHERE role_slug = 'contributor';
--> statement-breakpoint

DELETE FROM roles WHERE slug = 'contributor';
--> statement-breakpoint

UPDATE roles
   SET permissions = '["posts.new","posts.draft","pages.new","pages.draft","media.add","media.delete"]'
 WHERE slug = 'editor';
--> statement-breakpoint

UPDATE roles
   SET permissions = '["posts.draft","pages.draft","media.add"]'
 WHERE slug = 'author';
