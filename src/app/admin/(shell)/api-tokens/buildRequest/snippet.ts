import type { ResourceId, MethodId } from "./manifest";

export interface SnippetSelectedField {
  name: string;
  value: string;
  // When true, `value` is emitted verbatim instead of JSON-stringified.
  // Used for numbers, booleans, and arrays once the user picks concrete
  // values via the rich pickers (e.g. `[1, 2, 3]` instead of `"[1, 2, 3]"`).
  raw?: boolean;
}

export interface SnippetInput {
  resource: ResourceId;
  method: MethodId;
  tokenPrefix: string;
  baseUrl: string;
  selectedFields: SnippetSelectedField[];
  id?: string;
}

export type SnippetFormat = "curl" | "http" | "json";

const NO_BODY_METHODS = new Set<MethodId>(["GET", "GET_BY_ID"]);

function pathFor(input: SnippetInput): string {
  const base = `/api/v1/${input.resource}`;
  if (input.method === "PATCH" || input.method === "GET_BY_ID") {
    return `${base}/${input.id ?? "{{id}}"}`;
  }
  return base;
}

function httpMethodOf(method: MethodId): "GET" | "POST" | "PATCH" {
  if (method === "POST") return "POST";
  if (method === "PATCH") return "PATCH";
  return "GET";
}

function jsonBody(input: SnippetInput): string {
  if (NO_BODY_METHODS.has(input.method)) return "";
  if (input.selectedFields.length === 0) return "{}";
  const lines = input.selectedFields.map((f, i) => {
    const valueStr = f.raw ? f.value : JSON.stringify(f.value);
    const comma = i < input.selectedFields.length - 1 ? "," : "";
    return `  ${JSON.stringify(f.name)}: ${valueStr}${comma}`;
  });
  return `{\n${lines.join("\n")}\n}`;
}

function authHeader(tokenPrefix: string): string {
  return `Authorization: Bearer ${tokenPrefix}xxxxxxxx…`;
}

function curlSnippet(input: SnippetInput): string {
  const method = httpMethodOf(input.method);
  const url = `${input.baseUrl}${pathFor(input)}`;
  const lines: string[] = [`curl -X ${method} '${url}' \\`, `  -H '${authHeader(input.tokenPrefix)}'`];

  if (!NO_BODY_METHODS.has(input.method)) {
    lines[lines.length - 1] += " \\";
    lines.push(`  -H 'Content-Type: application/json' \\`);
    const body = jsonBody(input);
    lines.push(`  -d '${body.replace(/'/g, "'\\''")}'`);
  }
  return lines.join("\n");
}

function httpSnippet(input: SnippetInput): string {
  const method = httpMethodOf(input.method);
  const host = new URL(input.baseUrl).host;
  const lines: string[] = [
    `${method} ${pathFor(input)} HTTP/1.1`,
    `Host: ${host}`,
    authHeader(input.tokenPrefix),
  ];
  if (!NO_BODY_METHODS.has(input.method)) {
    lines.push("Content-Type: application/json");
    lines.push("");
    lines.push(jsonBody(input));
  }
  return lines.join("\n");
}

function jsonOnlySnippet(input: SnippetInput): string {
  if (NO_BODY_METHODS.has(input.method)) return "// GET requests have no body";
  return jsonBody(input);
}

export function buildSnippet(input: SnippetInput, format: SnippetFormat): string {
  if (format === "curl") return curlSnippet(input);
  if (format === "http") return httpSnippet(input);
  return jsonOnlySnippet(input);
}

// ── Request parts (consumed by Preview modal) ─────────────────────────────

export interface RequestParts {
  url: string;
  method: "GET" | "POST" | "PATCH";
  body: string | null; // JSON string; null for GET / GET_BY_ID
}

export function buildRequestParts(input: SnippetInput): RequestParts {
  const method = httpMethodOf(input.method);
  const url = `${input.baseUrl}${pathFor(input)}`;
  const body = NO_BODY_METHODS.has(input.method) ? null : jsonBody(input);
  return { url, method, body };
}
