-- Add `full_name` for the legal/full name (display_name remains the
-- public-facing handle). Optional; nullable for existing rows.

ALTER TABLE users ADD COLUMN full_name TEXT;
