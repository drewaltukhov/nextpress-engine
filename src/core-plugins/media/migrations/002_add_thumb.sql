-- Add a 600px-wide WebP thumbnail column, generated on upload by sharp.
-- Existing rows get NULL — the route handler falls back to the original
-- when thumb_data is absent.

ALTER TABLE `media` ADD COLUMN `thumb_data` blob;
--> statement-breakpoint
ALTER TABLE `media` ADD COLUMN `thumb_mime` text;
