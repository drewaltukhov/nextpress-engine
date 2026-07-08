-- Per-page schema.org type assignments. Stored as a JSON array of @type
-- strings (e.g., '["Article","FAQPage"]'). Subset of the globally
-- installed types in `seo.enabled_schemas`. The actual JSON-LD render
-- consumes this list when the public-page render route ships.

ALTER TABLE pages ADD COLUMN schema_types TEXT NOT NULL DEFAULT '[]';
