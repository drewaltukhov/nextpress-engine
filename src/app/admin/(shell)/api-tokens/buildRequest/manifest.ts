/**
 * Static field manifest for the Build-a-Request composer.
 *
 * Posts and topics field shapes are stable engine contracts — we hand-curate
 * the manifest instead of introspecting Drizzle at runtime. Update this file
 * if a new field is added to `/api/v1/posts` or `/api/v1/topics`.
 */

export const RESOURCES = ["posts", "topics"] as const;
export type ResourceId = (typeof RESOURCES)[number];

export const METHODS = ["POST", "PATCH", "GET", "GET_BY_ID"] as const;
export type MethodId = (typeof METHODS)[number];

export type FieldType =
  | "string"
  | "string-multiline"
  | "number"
  | "boolean"
  | "string-array"
  | "number-array";

export type FieldGroup = "core" | "seo" | "relations";

export interface FieldDef {
  name: string;
  type: FieldType;
  group: FieldGroup;
  required: boolean;
  defaultChecked: boolean;
  placeholder: string;
}

export const FIELDS: Record<ResourceId, readonly FieldDef[]> = {
  posts: [
    { name: "title",            type: "string",            group: "core",      required: true,  defaultChecked: true,  placeholder: "{{title}}" },
    { name: "slug",             type: "string",            group: "core",      required: false, defaultChecked: false, placeholder: "{{slug}}" },
    { name: "status",           type: "string",            group: "core",      required: false, defaultChecked: true,  placeholder: "draft" },
    { name: "post_kind",        type: "string",            group: "core",      required: false, defaultChecked: true,  placeholder: "standalone" },
    { name: "parent_id",        type: "number",            group: "core",      required: false, defaultChecked: false, placeholder: "{{parent_id}}" },
    { name: "excerpt",          type: "string-multiline",  group: "core",      required: false, defaultChecked: false, placeholder: "{{excerpt}}" },
    { name: "content_json",     type: "string-multiline",  group: "core",      required: false, defaultChecked: true,  placeholder: "{{content_json_stringified_puck_tree}}" },
    { name: "featured_image",   type: "string",            group: "core",      required: false, defaultChecked: false, placeholder: "{{featured_image_url}}" },
    { name: "topic_ids",        type: "number-array",      group: "relations", required: false, defaultChecked: false, placeholder: "{{topic_ids}}" },
    { name: "schema_types",     type: "string-array",      group: "relations", required: false, defaultChecked: false, placeholder: "{{schema_types}}" },
    { name: "seo_title",        type: "string",            group: "seo",       required: false, defaultChecked: false, placeholder: "{{seo_title}}" },
    { name: "seo_description",  type: "string-multiline",  group: "seo",       required: false, defaultChecked: false, placeholder: "{{seo_description}}" },
    { name: "seo_og_image",     type: "string",            group: "seo",       required: false, defaultChecked: false, placeholder: "{{seo_og_image}}" },
    { name: "seo_canonical",    type: "string",            group: "seo",       required: false, defaultChecked: false, placeholder: "{{seo_canonical}}" },
    { name: "seo_robots",       type: "string",            group: "seo",       required: false, defaultChecked: false, placeholder: "index,follow" },
    { name: "seo_exclude_from_sitemap", type: "boolean",   group: "seo",       required: false, defaultChecked: false, placeholder: "false" },
  ],
  topics: [
    { name: "name",         type: "string",           group: "core", required: true,  defaultChecked: true,  placeholder: "{{name}}" },
    { name: "slug",         type: "string",           group: "core", required: false, defaultChecked: false, placeholder: "{{slug}}" },
    { name: "description",  type: "string-multiline", group: "core", required: false, defaultChecked: false, placeholder: "{{description}}" },
    { name: "template",     type: "string",           group: "core", required: false, defaultChecked: false, placeholder: "{{template}}" },
  ],
} as const;
