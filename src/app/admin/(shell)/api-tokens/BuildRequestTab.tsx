'use client';

import { useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Copy, Loader2, Play } from 'lucide-react';
import { toast } from 'sonner';
import type { TokenListItem } from '@core-plugins/api';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { RESOURCES, FIELDS } from './buildRequest/manifest';
import type { ResourceId, MethodId, FieldDef, FieldType } from './buildRequest/manifest';
import { allowedOperations } from './buildRequest/scopes';
import { buildSnippet, buildRequestParts } from './buildRequest/snippet';
import type {
  SnippetFormat,
  SnippetSelectedField,
  RequestParts,
} from './buildRequest/snippet';
import type {
  PillarOption,
  TopicOption,
  SchemaTypeOption,
} from './ApiTokensPageClient';

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  tokens: TokenListItem[];
  baseUrl: string;
  pillars: PillarOption[];
  topics: TopicOption[];
  schemaTypes: SchemaTypeOption[];
}

// Options for the post_kind dropdown — mirrors the engine's POST_KINDS enum.
const POST_KIND_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'standalone', label: 'standalone' },
  { value: 'pillar', label: 'pillar' },
  { value: 'spike', label: 'spike' },
];

// Options for the status dropdown — mirrors the engine's POST_STATUSES enum.
const STATUS_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'draft', label: 'draft' },
  { value: 'published', label: 'published' },
];

// ── Pure helpers ───────────────────────────────────────────────────────────

function filterActiveTokens(tokens: TokenListItem[], now: number): TokenListItem[] {
  return tokens.filter(
    (t) => t.expiresAt == null || new Date(t.expiresAt).getTime() > now,
  );
}

// Heuristic — should this value be emitted verbatim (not JSON-stringified)?
// Booleans, plain numbers, and JSON-parseable arrays are emitted raw.
// Mustache placeholders (e.g. "{{title}}") always stay as JSON strings.
function isRawValue(type: FieldType, value: string): boolean {
  if (type === 'boolean') return value === 'true' || value === 'false';
  if (type === 'number') return /^-?\d+(\.\d+)?$/.test(value.trim());
  if (type === 'number-array' || type === 'string-array') {
    const trimmed = value.trim();
    if (!trimmed.startsWith('[') || !trimmed.endsWith(']')) return false;
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

// ── Constants ──────────────────────────────────────────────────────────────

const RESOURCE_LABELS: Record<ResourceId, string> = {
  posts: 'Posts',
  topics: 'Topics',
};

const METHOD_LABELS: Record<MethodId, string> = {
  POST: 'POST — Create',
  PATCH: 'PATCH — Update',
  GET: 'GET — List',
  GET_BY_ID: 'GET — By ID',
};

const NEEDS_ID_METHODS: ReadonlySet<MethodId> = new Set(['PATCH', 'GET_BY_ID']);
const NO_BODY_METHODS: ReadonlySet<MethodId> = new Set(['GET', 'GET_BY_ID']);

// ── Per-tab copy state ─────────────────────────────────────────────────────

type CopiedState = Record<SnippetFormat, boolean>;
const INITIAL_COPIED: CopiedState = { curl: false, http: false, json: false };

// ── Main component ─────────────────────────────────────────────────────────

export function BuildRequestTab({ tokens, baseUrl, pillars, topics, schemaTypes }: Props) {
  // useState initializer runs once at mount — safe place for Date.now()
  const [activeTokens] = useState<TokenListItem[]>(() =>
    filterActiveTokens(tokens, Date.now()),
  );

  if (activeTokens.length === 0) {
    return (
      <div className="text-center py-12 rounded-lg border border-dashed border-slate-200 bg-white">
        <p className="text-sm text-slate-500">
          You don&apos;t have any active tokens yet. Generate one in the My Tokens tab first.
        </p>
      </div>
    );
  }

  return (
    <ComposerForm
      tokens={activeTokens}
      baseUrl={baseUrl}
      pillars={pillars}
      topics={topics}
      schemaTypes={schemaTypes}
    />
  );
}

// ── Composer form (only rendered when tokens exist) ────────────────────────

interface ComposerFormProps {
  tokens: TokenListItem[];
  baseUrl: string;
  pillars: PillarOption[];
  topics: TopicOption[];
  schemaTypes: SchemaTypeOption[];
}

function ComposerForm({ tokens, baseUrl, pillars, topics, schemaTypes }: ComposerFormProps) {
  // Token selection
  const [selectedTokenId, setSelectedTokenId] = useState<number>(tokens[0].id);
  const selectedToken = tokens.find((t) => t.id === selectedTokenId) ?? tokens[0];

  // Allowed operations for the selected token
  const allowed = allowedOperations(selectedToken.scopes);

  // Resources that have at least one allowed method
  const allowedResources = RESOURCES.filter((r) =>
    allowed.some((op) => op.resource === r),
  );

  // Resource selection — default to first allowed resource
  const [selectedResource, setSelectedResource] = useState<ResourceId>(
    allowedResources[0] ?? 'posts',
  );

  // When token changes, recalculate valid resource
  function handleTokenChange(tokenIdStr: string) {
    const id = Number(tokenIdStr);
    setSelectedTokenId(id);
    const token = tokens.find((t) => t.id === id) ?? tokens[0];
    const ops = allowedOperations(token.scopes);
    const resources = RESOURCES.filter((r) => ops.some((op) => op.resource === r));
    const newResource = resources.includes(selectedResource)
      ? selectedResource
      : (resources[0] ?? 'posts');
    setSelectedResource(newResource);
    // Reset method within new context
    const methodsForResource = ops
      .filter((op) => op.resource === newResource)
      .map((op) => op.method);
    if (!methodsForResource.includes(selectedMethod)) {
      setSelectedMethod(methodsForResource[0] ?? 'POST');
    }
  }

  // Methods allowed for the selected resource
  const allowedMethods = allowed
    .filter((op) => op.resource === selectedResource)
    .map((op) => op.method);

  // Method selection
  const [selectedMethod, setSelectedMethod] = useState<MethodId>(
    allowedMethods[0] ?? 'POST',
  );

  function handleResourceChange(r: ResourceId) {
    setSelectedResource(r);
    const methodsForNew = allowed
      .filter((op) => op.resource === r)
      .map((op) => op.method);
    if (!methodsForNew.includes(selectedMethod)) {
      setSelectedMethod(methodsForNew[0] ?? 'POST');
    }
  }

  function handleMethodChange(m: MethodId) {
    setSelectedMethod(m);
  }

  // Field state
  const fields = FIELDS[selectedResource];
  const [checkedFields, setCheckedFields] = useState<Record<string, boolean>>(
    () => Object.fromEntries(fields.map((f) => [f.name, f.defaultChecked])),
  );
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(
    () => Object.fromEntries(fields.map((f) => [f.name, f.placeholder])),
  );

  // Reset fields when resource changes
  function handleResourceChangeWithFieldReset(r: ResourceId) {
    handleResourceChange(r);
    const newFields = FIELDS[r];
    setCheckedFields(Object.fromEntries(newFields.map((f) => [f.name, f.defaultChecked])));
    setFieldValues(Object.fromEntries(newFields.map((f) => [f.name, f.placeholder])));
  }

  // Resource ID for PATCH / GET_BY_ID
  const [resourceId, setResourceId] = useState('{{id}}');

  // Build snippet input
  const selectedFields: SnippetSelectedField[] = fields
    .filter((f) => checkedFields[f.name])
    .map((f) => {
      const value = fieldValues[f.name] ?? f.placeholder;
      const raw = isRawValue(f.type, value);
      return raw ? { name: f.name, value, raw: true } : { name: f.name, value };
    });

  const snippetInput = {
    resource: selectedResource,
    method: selectedMethod,
    tokenPrefix: selectedToken.prefix,
    baseUrl,
    selectedFields,
    id: NEEDS_ID_METHODS.has(selectedMethod) ? resourceId : undefined,
  };

  // Snippet format tabs
  const [activeFormat, setActiveFormat] = useState<SnippetFormat>('curl');
  const [copied, setCopied] = useState<CopiedState>({ ...INITIAL_COPIED });

  // Preview modal
  const [previewOpen, setPreviewOpen] = useState(false);

  async function handleCopy(format: SnippetFormat) {
    const snippet = buildSnippet(snippetInput, format);
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied((prev) => ({ ...prev, [format]: true }));
      setTimeout(() => setCopied((prev) => ({ ...prev, [format]: false })), 2000);
    } catch {
      toast.error("Couldn't copy — copy it manually from the box above");
    }
  }

  const hasNoOps = allowed.length === 0;

  if (hasNoOps) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
        This token has no allowed operations. Assign scopes to this token to use the
        request builder.
      </div>
    );
  }

  // ── post_kind spike warning ────────────────────────────────────────────

  const postKindValue = fieldValues['post_kind'] ?? '';
  const showSpikeHint =
    selectedResource === 'posts' &&
    checkedFields['post_kind'] === true &&
    postKindValue === 'spike';

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* ── Left pane: composer ───────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-5">
        {/* Token picker */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Token</label>
          <Select
            value={String(selectedToken.id)}
            onValueChange={(v) => handleTokenChange(v ?? String(selectedToken.id))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select token">{selectedToken.name}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {tokens.map((t) => (
                <SelectItem key={t.id} value={String(t.id)}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Resource picker — only show resources with allowed methods */}
        {allowedResources.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Resource</label>
            <Select
              value={selectedResource}
              onValueChange={(v) =>
                handleResourceChangeWithFieldReset((v ?? selectedResource) as ResourceId)
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Select resource">
                  {RESOURCE_LABELS[selectedResource]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {allowedResources.map((r) => (
                  <SelectItem key={r} value={r}>
                    {RESOURCE_LABELS[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Method picker */}
        {allowedMethods.length > 0 && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Method</label>
            <Select
              value={selectedMethod}
              onValueChange={(v) => handleMethodChange((v ?? selectedMethod) as MethodId)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select method">
                  {METHOD_LABELS[selectedMethod]}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {allowedMethods.map((m) => (
                  <SelectItem key={m} value={m}>
                    {METHOD_LABELS[m]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Resource ID input for PATCH / GET_BY_ID */}
        {NEEDS_ID_METHODS.has(selectedMethod) && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Resource ID
            </label>
            <input
              type="text"
              value={resourceId}
              onChange={(e) => setResourceId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition"
              placeholder="{{id}}"
            />
          </div>
        )}

        {/* Field checklist — only meaningful for write methods (POST / PATCH) */}
        {NO_BODY_METHODS.has(selectedMethod) ? (
          <p className="text-xs text-slate-500 italic">
            {selectedMethod === 'GET'
              ? `GET ${selectedResource} returns a list — no body or fields needed.`
              : `GET by ID returns one ${selectedResource.replace(/s$/, '')} — no body or fields needed.`}
          </p>
        ) : (
          <FieldChecklist
            fields={fields}
            checkedFields={checkedFields}
            fieldValues={fieldValues}
            resource={selectedResource}
            showSpikeHint={showSpikeHint}
            pillars={pillars}
            topics={topics}
            schemaTypes={schemaTypes}
            onCheckedChange={(name, checked) =>
              setCheckedFields((prev) => ({ ...prev, [name]: checked }))
            }
            onValueChange={(name, value) =>
              setFieldValues((prev) => ({ ...prev, [name]: value }))
            }
          />
        )}
      </div>

      {/* ── Right pane: output ────────────────────────────────────────── */}
      <div className="bg-white rounded-lg border border-slate-200 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            Replace <code className="font-mono">npp_xxxxxxxx…</code> with the token you saved
            when you created it.
          </p>
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-brand-green text-white text-xs font-medium shadow-sm transition-colors hover:bg-brand-green/90"
          >
            <Play className="size-3.5" />
            Preview
          </button>
        </div>

        <Tabs
          value={activeFormat}
          onValueChange={(v) => setActiveFormat((v ?? activeFormat) as SnippetFormat)}
          className="flex flex-col"
        >
          <TabsList className="!h-auto bg-slate-50 p-1 gap-1">
            <TabsTrigger
              value="curl"
              className="!h-auto px-4 py-2 text-sm font-medium data-active:!bg-brand-light-green/60 data-active:!text-brand-navy data-active:!shadow-sm rounded-md"
            >
              cURL
            </TabsTrigger>
            <TabsTrigger
              value="http"
              className="!h-auto px-4 py-2 text-sm font-medium data-active:!bg-brand-light-green/60 data-active:!text-brand-navy data-active:!shadow-sm rounded-md"
            >
              Raw HTTP
            </TabsTrigger>
            <TabsTrigger
              value="json"
              className="!h-auto px-4 py-2 text-sm font-medium data-active:!bg-brand-light-green/60 data-active:!text-brand-navy data-active:!shadow-sm rounded-md"
            >
              JSON body
            </TabsTrigger>
          </TabsList>

          {(['curl', 'http', 'json'] as const).map((format) => {
            const snippet = buildSnippet(snippetInput, format);
            return (
              <TabsContent key={format} value={format} className="relative mt-2">
                <button
                  type="button"
                  onClick={() => handleCopy(format)}
                  aria-label="Copy snippet"
                  className="absolute right-2 top-2 inline-flex items-center justify-center size-8 rounded-md border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50 z-10"
                >
                  {copied[format] ? (
                    <Check className="size-4 text-emerald-600" />
                  ) : (
                    <Copy className="size-4" />
                  )}
                </button>
                <pre className="font-mono text-xs whitespace-pre-wrap break-all bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-96 overflow-y-auto pr-10">
                  {snippet}
                </pre>
              </TabsContent>
            );
          })}
        </Tabs>
      </div>

      {/* ── Preview modal ─────────────────────────────────────────────── */}
      <PreviewModal
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        tokenPrefix={selectedToken.prefix}
        request={buildRequestParts(snippetInput)}
      />
    </div>
  );
}

// ── Field checklist ────────────────────────────────────────────────────────

interface FieldChecklistProps {
  fields: readonly FieldDef[];
  checkedFields: Record<string, boolean>;
  fieldValues: Record<string, string>;
  resource: ResourceId;
  showSpikeHint: boolean;
  pillars: PillarOption[];
  topics: TopicOption[];
  schemaTypes: SchemaTypeOption[];
  onCheckedChange: (name: string, checked: boolean) => void;
  onValueChange: (name: string, value: string) => void;
}

function FieldChecklist({
  fields,
  checkedFields,
  fieldValues,
  resource,
  showSpikeHint,
  pillars,
  topics,
  schemaTypes,
  onCheckedChange,
  onValueChange,
}: FieldChecklistProps) {
  const coreFields = fields.filter((f) => f.group === 'core');
  const seoFields = fields.filter((f) => f.group === 'seo');
  const relationsFields = fields.filter((f) => f.group === 'relations');
  const hasAdvanced = seoFields.length > 0 || relationsFields.length > 0;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-700">Fields</p>

      {/* Core fields — always inline */}
      <div className="space-y-2">
        {coreFields.map((field) => (
          <FieldRow
            key={field.name}
            field={field}
            checked={checkedFields[field.name] ?? false}
            value={fieldValues[field.name] ?? field.placeholder}
            resource={resource}
            showSpikeHint={showSpikeHint}
            pillars={pillars}
            topics={topics}
            schemaTypes={schemaTypes}
            onCheckedChange={onCheckedChange}
            onValueChange={onValueChange}
          />
        ))}
      </div>

      {/* SEO + Relations in Advanced expander (posts only) */}
      {hasAdvanced && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-medium text-slate-500 hover:text-slate-700 select-none list-none flex items-center gap-1.5">
            <span className="transition-transform group-open:rotate-90">▶</span>
            Advanced
          </summary>
          <div className="mt-2 space-y-2 pl-1">
            {seoFields.length > 0 && (
              <>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide">
                  SEO
                </p>
                {seoFields.map((field) => (
                  <FieldRow
                    key={field.name}
                    field={field}
                    checked={checkedFields[field.name] ?? false}
                    value={fieldValues[field.name] ?? field.placeholder}
                    resource={resource}
                    showSpikeHint={showSpikeHint}
                    pillars={pillars}
                    topics={topics}
                    schemaTypes={schemaTypes}
                    onCheckedChange={onCheckedChange}
                    onValueChange={onValueChange}
                  />
                ))}
              </>
            )}
            {relationsFields.length > 0 && (
              <>
                <p className="text-xs font-medium text-slate-400 uppercase tracking-wide mt-3">
                  Relations
                </p>
                {relationsFields.map((field) => (
                  <FieldRow
                    key={field.name}
                    field={field}
                    checked={checkedFields[field.name] ?? false}
                    value={fieldValues[field.name] ?? field.placeholder}
                    resource={resource}
                    showSpikeHint={showSpikeHint}
                    pillars={pillars}
                    topics={topics}
                    schemaTypes={schemaTypes}
                    onCheckedChange={onCheckedChange}
                    onValueChange={onValueChange}
                  />
                ))}
              </>
            )}
          </div>
        </details>
      )}
    </div>
  );
}

// ── Field row ──────────────────────────────────────────────────────────────

interface FieldRowProps {
  field: FieldDef;
  checked: boolean;
  value: string;
  resource: ResourceId;
  showSpikeHint: boolean;
  pillars: PillarOption[];
  topics: TopicOption[];
  schemaTypes: SchemaTypeOption[];
  onCheckedChange: (name: string, checked: boolean) => void;
  onValueChange: (name: string, value: string) => void;
}

function FieldRow({
  field,
  checked,
  value,
  resource,
  showSpikeHint,
  pillars,
  topics,
  schemaTypes,
  onCheckedChange,
  onValueChange,
}: FieldRowProps) {
  const isParentIdRow = resource === 'posts' && field.name === 'parent_id';
  const isContentJsonRow = resource === 'posts' && field.name === 'content_json';

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2">
        {/* Checkbox */}
        <input
          type="checkbox"
          id={`field-${field.name}`}
          checked={checked}
          onChange={(e) => onCheckedChange(field.name, e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-green focus:ring-brand-green/30 cursor-pointer shrink-0"
        />

        {/* Label: name + type hint */}
        <label
          htmlFor={`field-${field.name}`}
          className="flex items-center gap-2 cursor-pointer min-w-0 flex-1"
        >
          <span className="font-mono text-sm text-slate-900 shrink-0">{field.name}</span>
          <span className="text-xs text-slate-400 shrink-0">{field.type}</span>
          {field.required && (
            <span className="text-xs text-red-400 shrink-0">required</span>
          )}
        </label>
      </div>

      {/* Value editor (shown only when checked) */}
      {checked && (
        <div className="ml-6">
          <FieldValueEditor
            field={field}
            value={value}
            resource={resource}
            pillars={pillars}
            topics={topics}
            schemaTypes={schemaTypes}
            onChange={(v) => onValueChange(field.name, v)}
          />
          {isContentJsonRow && (
            <p className="mt-1 text-xs text-slate-400">
              Send the stringified Puck tree from the editor&apos;s{' '}
              <code className="font-mono">content_json</code> column.
            </p>
          )}
        </div>
      )}

      {/* Spike parent_id hint — shown whenever post_kind=spike regardless of parent_id checked state */}
      {isParentIdRow && showSpikeHint && (
        <div className="ml-6 flex items-start gap-1.5 rounded-md bg-amber-50 border border-amber-200 px-2 py-1.5 text-xs text-amber-800">
          <span>
            <code className="font-mono">parent_id</code> is required when{' '}
            <code className="font-mono">post_kind</code> is{' '}
            <code className="font-mono">spike</code> — the API will reject the request
            otherwise.
          </span>
        </div>
      )}
    </div>
  );
}

// ── Field value editor ─────────────────────────────────────────────────────

interface FieldValueEditorProps {
  field: FieldDef;
  value: string;
  resource: ResourceId;
  pillars: PillarOption[];
  topics: TopicOption[];
  schemaTypes: SchemaTypeOption[];
  onChange: (value: string) => void;
}

const inputCls =
  'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition';

function FieldValueEditor({
  field,
  value,
  resource,
  pillars,
  topics,
  schemaTypes,
  onChange,
}: FieldValueEditorProps) {
  // ── Smart pickers for known posts fields ────────────────────────────────
  if (resource === 'posts' && field.name === 'status') {
    return <EnumPicker value={value} options={STATUS_OPTIONS} placeholder="Select status" onChange={onChange} />;
  }
  if (resource === 'posts' && field.name === 'post_kind') {
    return <EnumPicker value={value} options={POST_KIND_OPTIONS} placeholder="Select post kind" onChange={onChange} />;
  }
  if (resource === 'posts' && field.name === 'parent_id') {
    return <ParentIdPicker value={value} pillars={pillars} onChange={onChange} />;
  }
  if (resource === 'posts' && field.name === 'topic_ids') {
    return <TopicIdsPicker value={value} topics={topics} onChange={onChange} />;
  }
  if (resource === 'posts' && field.name === 'schema_types') {
    return <SchemaTypesPicker value={value} schemaTypes={schemaTypes} onChange={onChange} />;
  }

  // ── Fallback by FieldType ──────────────────────────────────────────────
  if (field.type === 'boolean') {
    const isOn = value === 'true';
    return (
      <div className="flex items-center gap-2">
        <Switch
          checked={isOn}
          onCheckedChange={(checked) => onChange(checked ? 'true' : 'false')}
        />
        <span className="text-xs text-slate-500">{isOn ? 'true' : 'false'}</span>
      </div>
    );
  }

  if (field.type === 'string-multiline') {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        rows={3}
        className={`${inputCls} resize-y`}
      />
    );
  }

  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.placeholder}
      className={inputCls}
    />
  );
}

// ── Generic enum picker (used for status + post_kind) ────────────────────

interface EnumPickerOption {
  value: string;
  label: string;
}

function EnumPicker({
  value,
  options,
  placeholder,
  onChange,
}: {
  value: string;
  options: ReadonlyArray<EnumPickerOption>;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  const knownOption = options.find((o) => o.value === value);
  const displayLabel = knownOption?.label ?? value;
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? value)}>
      <SelectTrigger>
        <SelectValue placeholder={placeholder}>{displayLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── parent_id picker ──────────────────────────────────────────────────────

function ParentIdPicker({
  value,
  pillars,
  onChange,
}: {
  value: string;
  pillars: PillarOption[];
  onChange: (v: string) => void;
}) {
  if (pillars.length === 0) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="{{parent_id}}"
        className={inputCls}
      />
    );
  }
  const selected = pillars.find((p) => String(p.id) === value);
  const displayLabel = selected ? `#${selected.id} — ${selected.title}` : value;
  return (
    <Select value={value} onValueChange={(v) => onChange(v ?? value)}>
      <SelectTrigger>
        <SelectValue placeholder="Select pillar">{displayLabel}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {pillars.map((p) => (
          <SelectItem key={p.id} value={String(p.id)}>
            #{p.id} — {p.title}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ── topic_ids picker (multi-select) ───────────────────────────────────────

function TopicIdsPicker({
  value,
  topics,
  onChange,
}: {
  value: string;
  topics: TopicOption[];
  onChange: (v: string) => void;
}) {
  const selectedIds = parseIdArray(value);

  function toggle(id: number) {
    const next = selectedIds.includes(id)
      ? selectedIds.filter((x) => x !== id)
      : [...selectedIds, id];
    onChange(next.length === 0 ? '{{topic_ids}}' : JSON.stringify(next));
  }

  return (
    <MultiCheckboxPicker
      placeholder="{{topic_ids}}"
      selectedCount={selectedIds.length}
      summary={
        selectedIds.length === 0
          ? '{{topic_ids}}'
          : `${selectedIds.length} topic${selectedIds.length === 1 ? '' : 's'} selected`
      }
      empty={topics.length === 0 ? "You don't have any topics yet." : undefined}
    >
      {topics.map((t) => {
        const checked = selectedIds.includes(t.id);
        return (
          <CheckboxRow
            key={t.id}
            checked={checked}
            label={t.name}
            sub={`#${t.id}`}
            onToggle={() => toggle(t.id)}
          />
        );
      })}
    </MultiCheckboxPicker>
  );
}

// ── schema_types picker (multi-select) ────────────────────────────────────

function SchemaTypesPicker({
  value,
  schemaTypes,
  onChange,
}: {
  value: string;
  schemaTypes: SchemaTypeOption[];
  onChange: (v: string) => void;
}) {
  const selected = parseStringArray(value);

  function toggle(type: string) {
    const next = selected.includes(type)
      ? selected.filter((x) => x !== type)
      : [...selected, type];
    onChange(next.length === 0 ? '{{schema_types}}' : JSON.stringify(next));
  }

  return (
    <MultiCheckboxPicker
      placeholder="{{schema_types}}"
      selectedCount={selected.length}
      summary={
        selected.length === 0
          ? '{{schema_types}}'
          : selected.length <= 2
          ? selected.join(', ')
          : `${selected.length} schema types selected`
      }
      empty={schemaTypes.length === 0 ? 'No schema types available.' : undefined}
    >
      {schemaTypes.map((s) => {
        const checked = selected.includes(s.type);
        return (
          <CheckboxRow
            key={s.type}
            checked={checked}
            label={s.name}
            sub={s.type}
            onToggle={() => toggle(s.type)}
          />
        );
      })}
    </MultiCheckboxPicker>
  );
}

// ── Multi-select popover primitive ────────────────────────────────────────

interface MultiCheckboxPickerProps {
  placeholder: string;
  selectedCount: number;
  summary: string;
  empty?: string;
  children: React.ReactNode;
}

function MultiCheckboxPicker({
  selectedCount,
  summary,
  empty,
  children,
}: MultiCheckboxPickerProps) {
  return (
    <Popover>
      <PopoverTrigger
        className={`${inputCls} text-left flex items-center justify-between gap-2 cursor-pointer hover:border-slate-300`}
      >
        <span
          className={
            selectedCount === 0 ? 'text-slate-400 font-mono text-xs' : 'text-slate-900'
          }
        >
          {summary}
        </span>
        <ChevronDown className="size-4 text-slate-400 shrink-0" />
      </PopoverTrigger>
      <PopoverContent className="w-72 max-h-72 overflow-y-auto p-1">
        {empty ? (
          <p className="text-xs text-slate-500 py-2 px-2">{empty}</p>
        ) : (
          <div className="space-y-0.5">{children}</div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function CheckboxRow({
  checked,
  label,
  sub,
  onToggle,
}: {
  checked: boolean;
  label: string;
  sub: string;
  onToggle: () => void;
}) {
  return (
    <label className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        className="h-4 w-4 rounded border-slate-300 text-brand-green focus:ring-brand-green/30 cursor-pointer shrink-0"
      />
      <span className="flex-1 text-sm text-slate-900 truncate">{label}</span>
      <span className="text-xs text-slate-400 font-mono">{sub}</span>
    </label>
  );
}

// ── Array value parsers ───────────────────────────────────────────────────

function parseIdArray(value: string): number[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[')) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is number => typeof x === 'number');
  } catch {
    return [];
  }
}

function parseStringArray(value: string): string[] {
  const trimmed = value.trim();
  if (!trimmed.startsWith('[')) return [];
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string');
  } catch {
    return [];
  }
}

// ── Preview modal ──────────────────────────────────────────────────────────

interface PreviewResult {
  status: number;
  statusText: string;
  durationMs: number;
  body: string;
  isJson: boolean;
  networkError?: boolean;
}

interface PreviewModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tokenPrefix: string;
  request: RequestParts;
}

function previewTokenKey(prefix: string): string {
  return `nextpress:preview-token:${prefix}`;
}

function PreviewModal({ open, onOpenChange, tokenPrefix, request }: PreviewModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview request</DialogTitle>
        </DialogHeader>
        {/* Key on tokenPrefix so switching tokens resets the body state cleanly.
            Gating on `open` means the useState initializers only run when the
            modal opens — no need for a useEffect-driven state reset. */}
        {open && (
          <PreviewModalBody key={tokenPrefix} tokenPrefix={tokenPrefix} request={request} />
        )}
      </DialogContent>
    </Dialog>
  );
}

interface PreviewModalBodyProps {
  tokenPrefix: string;
  request: RequestParts;
}

function PreviewModalBody({ tokenPrefix, request }: PreviewModalBodyProps) {
  const [token, setToken] = useState<string>(() => {
    try {
      return sessionStorage.getItem(previewTokenKey(tokenPrefix)) ?? '';
    } catch {
      return '';
    }
  });
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedResult, setCopiedResult] = useState(false);

  function persistToken(t: string) {
    setToken(t);
    try {
      if (t) sessionStorage.setItem(previewTokenKey(tokenPrefix), t);
      else sessionStorage.removeItem(previewTokenKey(tokenPrefix));
    } catch {
      // ignore
    }
  }

  async function runRequest() {
    setBusy(true);
    setResult(null);
    setCopiedResult(false);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };
    const init: RequestInit = { method: request.method, headers };
    if (request.body != null) {
      headers['Content-Type'] = 'application/json';
      init.body = request.body;
    }

    const start = performance.now();
    try {
      const res = await fetch(request.url, init);
      const text = await res.text();
      let isJson = false;
      let displayBody = text;
      try {
        const parsed = JSON.parse(text);
        displayBody = JSON.stringify(parsed, null, 2);
        isJson = true;
      } catch {
        // Non-JSON body — show raw text.
      }
      setResult({
        status: res.status,
        statusText: res.statusText,
        durationMs: Math.round(performance.now() - start),
        body: displayBody,
        isJson,
      });
    } catch (err) {
      setResult({
        status: 0,
        statusText: 'Network error',
        durationMs: Math.round(performance.now() - start),
        body: err instanceof Error ? err.message : String(err),
        isJson: false,
        networkError: true,
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleCopyResult() {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.body);
      setCopiedResult(true);
      setTimeout(() => setCopiedResult(false), 2000);
    } catch {
      toast.error("Couldn't copy — copy it manually from the box");
    }
  }

  const tokenMatchesPrefix = token.length === 0 || token.startsWith(tokenPrefix);
  const canRun = token.length > 0 && tokenMatchesPrefix && !busy;
  const isWriteMethod = request.method === 'POST' || request.method === 'PATCH';

  return (
    <div className="space-y-4">
          {/* Request summary */}
          <div>
            <div className="text-xs font-medium uppercase tracking-wide text-slate-500 mb-1">
              Request
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              <code className="font-mono text-xs break-all">
                <span className="font-semibold text-brand-navy">{request.method}</span>{' '}
                {request.url}
              </code>
            </div>
          </div>

          {/* Write-method warning */}
          {isWriteMethod && (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>
                This is a real <strong>{request.method}</strong>. It will create or modify
                data in your database.
              </span>
            </div>
          )}

          {/* Token input */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Bearer token (plaintext)
            </label>
            <input
              type="password"
              value={token}
              onChange={(e) => persistToken(e.target.value)}
              placeholder={`${tokenPrefix}…`}
              className={`${inputCls} font-mono text-xs`}
              autoComplete="off"
              spellCheck={false}
            />
            {token.length > 0 && !tokenMatchesPrefix && (
              <p className="mt-1 text-xs text-red-600">
                This token doesn&apos;t start with the selected token&apos;s prefix (
                <code className="font-mono">{tokenPrefix}</code>). The request will fail.
              </p>
            )}
            <p className="mt-1 text-xs text-slate-400">
              Saved in this browser tab&apos;s sessionStorage per prefix. Cleared when you close
              the tab.
            </p>
          </div>

          {/* Run button */}
          <button
            type="button"
            onClick={runRequest}
            disabled={!canRun}
            className="inline-flex items-center gap-2 h-10 px-4 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {busy ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Running…
              </>
            ) : (
              <>
                <Play className="size-4" />
                Run request
              </>
            )}
          </button>

      {/* Result */}
      {result && <PreviewResultPanel result={result} onCopy={handleCopyResult} copied={copiedResult} />}
    </div>
  );
}

function PreviewResultPanel({
  result,
  onCopy,
  copied,
}: {
  result: PreviewResult;
  onCopy: () => void;
  copied: boolean;
}) {
  const statusClass = statusToneClass(result.status, result.networkError);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <span
            className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ${statusClass}`}
          >
            {result.networkError ? 'NETWORK ERROR' : `${result.status} ${result.statusText}`}
          </span>
          <span className="text-xs text-slate-500">{result.durationMs} ms</span>
          {result.isJson && (
            <span className="text-xs text-slate-400 font-mono">application/json</span>
          )}
        </div>
        <button
          type="button"
          onClick={onCopy}
          aria-label="Copy response"
          className="inline-flex items-center justify-center size-8 rounded-md border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50"
        >
          {copied ? (
            <Check className="size-4 text-emerald-600" />
          ) : (
            <Copy className="size-4" />
          )}
        </button>
      </div>
      <pre className="font-mono text-xs whitespace-pre-wrap break-all bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-80 overflow-y-auto">
        {result.body || '(empty body)'}
      </pre>
    </div>
  );
}

function statusToneClass(status: number, networkError?: boolean): string {
  if (networkError) return 'bg-red-100 text-red-800';
  if (status >= 200 && status < 300) return 'bg-emerald-100 text-emerald-800';
  if (status >= 400 && status < 500) return 'bg-amber-100 text-amber-900';
  if (status >= 500) return 'bg-red-100 text-red-800';
  return 'bg-slate-100 text-slate-700';
}
