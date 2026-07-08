-- Drop the now-dormant `deleted_at` column and rebuild the partial indexes
-- as plain indexes. Policy change: media deletes are hard deletes (see
-- src/core-plugins/media/service.ts deleteMedia). Nothing writes deleted_at
-- anymore, so the column + the partial-index WHERE filters are dead weight.

DROP INDEX IF EXISTS `media_tenant_uploaded_idx`;
--> statement-breakpoint
DROP INDEX IF EXISTS `media_uploaded_by_idx`;
--> statement-breakpoint
ALTER TABLE `media` DROP COLUMN `deleted_at`;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_tenant_uploaded_idx` ON `media` (`tenant_id`, `uploaded_at` DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `media_uploaded_by_idx` ON `media` (`uploaded_by`);
