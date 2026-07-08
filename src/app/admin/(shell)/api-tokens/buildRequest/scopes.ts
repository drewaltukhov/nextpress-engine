import type { ResourceId, MethodId } from "./manifest";

export interface Operation {
  resource: ResourceId;
  method: MethodId;
}

const ALL_OPERATIONS: readonly Operation[] = [
  { resource: "posts", method: "POST" },
  { resource: "posts", method: "PATCH" },
  { resource: "posts", method: "GET" },
  { resource: "posts", method: "GET_BY_ID" },
  { resource: "topics", method: "POST" },
  { resource: "topics", method: "PATCH" },
  { resource: "topics", method: "GET" },
  { resource: "topics", method: "GET_BY_ID" },
] as const;

const SCOPE_GRANTS: Record<string, readonly Operation[]> = {
  "posts:read": [
    { resource: "posts", method: "GET" },
    { resource: "posts", method: "GET_BY_ID" },
  ],
  "posts:write": [
    { resource: "posts", method: "POST" },
    { resource: "posts", method: "PATCH" },
  ],
  "taxonomies:read": [
    { resource: "topics", method: "GET" },
    { resource: "topics", method: "GET_BY_ID" },
  ],
  "taxonomies:write": [
    { resource: "topics", method: "POST" },
    { resource: "topics", method: "PATCH" },
  ],
};

function keyOf(op: Operation): string {
  return `${op.resource}:${op.method}`;
}

export function allowedOperations(scopes: string[]): Operation[] {
  if (scopes.includes("*")) return [...ALL_OPERATIONS];

  const seen = new Set<string>();
  const out: Operation[] = [];
  for (const scope of scopes) {
    const grants = SCOPE_GRANTS[scope];
    if (!grants) continue;
    for (const op of grants) {
      const k = keyOf(op);
      if (!seen.has(k)) {
        seen.add(k);
        out.push(op);
      }
    }
  }
  return out;
}
