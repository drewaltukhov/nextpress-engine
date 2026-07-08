// Pure catalog used by both server actions and client components.
// MUST stay free of "use server" — sync constants/functions only.

export interface PermissionGrade {
  id: string;
  label: string;
  description: string;
}

export interface RoleEntity {
  id: string;
  label: string;
  grades: ReadonlyArray<PermissionGrade>;
}

export const ROLE_ENTITIES: ReadonlyArray<RoleEntity> = [
  {
    id: "posts",
    label: "Posts",
    grades: [
      { id: "new", label: "New", description: "Create published posts, publish drafts, delete" },
      { id: "draft", label: "Drafts", description: "Create and edit drafts" },
    ],
  },
  {
    id: "pages",
    label: "Pages",
    grades: [
      { id: "new", label: "New", description: "Create published pages, publish drafts, delete" },
      { id: "draft", label: "Drafts", description: "Create and edit drafts" },
    ],
  },
  {
    id: "media",
    label: "Media",
    grades: [
      { id: "add", label: "Add", description: "Upload media" },
      { id: "delete", label: "Delete", description: "Delete media" },
    ],
  },
  {
    id: "topics",
    label: "Topics",
    grades: [
      { id: "manage", label: "Manage", description: "Create, edit, and delete topics" },
      { id: "assign", label: "Assign", description: "Tag posts with existing topics" },
    ],
  },
  {
    id: "galleries",
    label: "Galleries",
    grades: [
      { id: "manage", label: "Manage", description: "Create, edit, and delete galleries" },
    ],
  },
];

// Seed roles in display order — admin first, then descending capability.
// Custom roles render after this list (alphabetical among themselves).
export const SYSTEM_ROLE_ORDER: ReadonlyArray<string> = ["admin", "editor", "author"];

export const SYSTEM_ROLE_SLUGS: ReadonlySet<string> = new Set(SYSTEM_ROLE_ORDER);

export function isSystemRole(slug: string): boolean {
  return SYSTEM_ROLE_SLUGS.has(slug);
}

export function roleSortKey(slug: string): string {
  const idx = SYSTEM_ROLE_ORDER.indexOf(slug);
  if (idx >= 0) return `0:${idx}`;
  return `1:${slug}`;
}

export function permissionFor(entityId: string, gradeId: string): string {
  return `${entityId}.${gradeId}`;
}

export function isKnownPermission(perm: string): boolean {
  for (const e of ROLE_ENTITIES) {
    for (const g of e.grades) {
      if (perm === permissionFor(e.id, g.id)) return true;
    }
  }
  return false;
}

// Treats `*` as full access and `${entity}.*` (legacy wildcard from earlier
// in the project history) as granting every grade for that entity.
export function hasGrade(
  permissions: readonly string[],
  entityId: string,
  gradeId: string
): boolean {
  if (permissions.includes("*")) return true;
  if (permissions.includes(`${entityId}.*`)) return true;
  return permissions.includes(permissionFor(entityId, gradeId));
}

// Slugify a role label for use as the primary key.
export function slugifyRoleLabel(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}
