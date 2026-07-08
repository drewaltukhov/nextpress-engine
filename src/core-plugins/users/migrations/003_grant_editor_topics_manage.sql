-- Grant the editor role permission to manage topics.
--
-- Uses json_insert with an existence guard so this is safe even if an
-- operator pre-added the permission manually, and so it preserves any
-- other customizations made to the editor role since 002.

UPDATE roles
   SET permissions = json_insert(permissions, '$[#]', 'topics.manage')
 WHERE slug = 'editor'
   AND NOT EXISTS (
     SELECT 1 FROM json_each(roles.permissions) WHERE value = 'topics.manage'
   );
