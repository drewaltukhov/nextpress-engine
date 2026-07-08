-- Grant the editor role permission to manage galleries.
--
-- Idempotent in the same shape as 003_grant_editor_topics_manage.sql:
-- json_insert with an existence guard so re-runs and pre-applied state
-- don't double-add or fail.

UPDATE roles
   SET permissions = json_insert(permissions, '$[#]', 'galleries.manage')
 WHERE slug = 'editor'
   AND NOT EXISTS (
     SELECT 1 FROM json_each(roles.permissions) WHERE value = 'galleries.manage'
   );
