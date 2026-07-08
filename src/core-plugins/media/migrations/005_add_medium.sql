-- Add a 1280px-wide WebP medium variant column, generated on upload by sharp.
-- The carousel slide + future hero/featured-image surfaces use this; cards/
-- grids continue to use the 600px thumb. Existing rows get NULL — the route
-- handler falls back to the original when medium_data is absent.

ALTER TABLE `media` ADD COLUMN `medium_data` blob;
--> statement-breakpoint
ALTER TABLE `media` ADD COLUMN `medium_mime` text;
