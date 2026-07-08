-- Grant `topics.assign` so authors and editors can tag posts with
-- existing topics without being able to create new ones (which still
-- requires `topics.manage`).
--
-- Two separate guarded UPDATEs — same pattern as 003/006 — so the
-- migration is idempotent and preserves any other custom edits.

UPDATE roles
   SET permissions = json_insert(permissions, '$[#]', 'topics.assign')
 WHERE slug = 'editor'
   AND NOT EXISTS (
     SELECT 1 FROM json_each(roles.permissions) WHERE value = 'topics.assign'
   );
--> statement-breakpoint
UPDATE roles
   SET permissions = json_insert(permissions, '$[#]', 'topics.assign')
 WHERE slug = 'author'
   AND NOT EXISTS (
     SELECT 1 FROM json_each(roles.permissions) WHERE value = 'topics.assign'
   );
