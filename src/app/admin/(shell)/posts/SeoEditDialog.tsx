"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Share2, Braces, ChevronRight } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { MediaPickerInput } from "@core/components/MediaPicker";
import type { PostDetail, PostRobots } from "@core-plugins/posts";
import {
  getPostDetail,
  getPostSchemaPreview,
  updatePostSeoAction,
  type PostSchemaPreview,
} from "./actions";

interface Props {
  /** When set, the dialog opens loading the given post's SEO state. */
  postId: number | null;
  onClose: () => void;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

const ROBOTS_OPTIONS: { value: PostRobots; label: string; hint: string }[] = [
  { value: "index,follow", label: "Index, follow", hint: "Default — indexable, links followed" },
  { value: "noindex,follow", label: "No index, follow", hint: "Hidden from search; links still followed" },
  { value: "index,nofollow", label: "Index, no follow", hint: "Indexable; outbound links not endorsed" },
  { value: "noindex,nofollow", label: "No index, no follow", hint: "Fully blocked from search" },
];

export function SeoEditDialog({ postId, onClose }: Props) {
  const open = postId !== null;
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>SEO settings</DialogTitle>
          <DialogDescription>
            Quick edit for search and social-share metadata. The full editor lives on the post edit screen.
          </DialogDescription>
        </DialogHeader>
        {open && postId !== null ? (
          <SeoEditForm key={postId} postId={postId} onClose={onClose} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function SeoEditForm({ postId, onClose }: { postId: number; onClose: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<PostDetail | null>(null);
  const [pending, startTransition] = useTransition();

  const [seoTitle, setSeoTitle] = useState("");
  const [seoDescription, setSeoDescription] = useState("");
  const [seoCanonical, setSeoCanonical] = useState("");
  const [seoRobots, setSeoRobots] = useState<PostRobots>("index,follow");
  const [seoOgImage, setSeoOgImage] = useState("");
  const [seoExcludeFromSitemap, setSeoExcludeFromSitemap] = useState(false);

  // Schema preview is fetched on demand when the user first opens the
  // Schema Checkup tab. Saves a Puck-data parse + a few setting reads on
  // the common case where the admin only edits title/description.
  const [activeTab, setActiveTab] = useState("search");
  const [schemaPreview, setSchemaPreview] = useState<PostSchemaPreview | null>(null);
  const [schemaLoading, setSchemaLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const detail = await getPostDetail(postId);
      if (cancelled) return;
      setPost(detail);
      if (detail) {
        setSeoTitle(detail.seoTitle ?? "");
        setSeoDescription(detail.seoDescription ?? "");
        setSeoCanonical(detail.seoCanonical ?? "");
        setSeoRobots(detail.seoRobots);
        setSeoOgImage(detail.seoOgImage ?? "");
        setSeoExcludeFromSitemap(detail.seoExcludeFromSitemap);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [postId]);

  // `setSchemaLoading(true)` synchronously before the fetch is the
  // cleanest way to surface the spinner; a derived-render approach
  // would need a second piece of state to track "fetch was kicked off
  // but hasn't resolved" which is identical in shape to the loading
  // flag we already maintain. Disabling the rule for this single case.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (activeTab !== "schema") return;
    if (schemaPreview !== null) return;
    let cancelled = false;
    setSchemaLoading(true);
    (async () => {
      const preview = await getPostSchemaPreview(postId);
      if (cancelled) return;
      setSchemaPreview(preview);
      setSchemaLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [activeTab, postId, schemaPreview]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!post) return;
    startTransition(async () => {
      const result = await updatePostSeoAction(post.id, {
        seoTitle: seoTitle || null,
        seoDescription: seoDescription || null,
        seoCanonical: seoCanonical || null,
        seoRobots,
        seoOgImage: seoOgImage || null,
        seoExcludeFromSitemap,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("SEO settings saved");
      onClose();
      router.refresh();
    });
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-500">
        Loading…
      </div>
    );
  }

  if (!post) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center">
        <p className="text-sm font-medium text-slate-900">Post not found</p>
        <p className="mt-1 text-sm text-slate-500">
          It may have been deleted or you don&apos;t have permission to view it.
        </p>
      </div>
    );
  }

  // Slug shown in the canonical placeholder — for spikes, prepend the
  // pillar slug so the suggestion matches the public URL the post will
  // actually live at.
  const slugPath =
    post.postKind === "spike" && post.parentSlug
      ? `${post.parentSlug}/${post.slug}`
      : post.slug;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Editing SEO for <span className="font-medium text-slate-700">{post.title}</span>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col">
        {/* `flex flex-col` is required because the base Tabs root's
            `data-horizontal:flex-col` variant doesn't actually match
            base-ui's `data-orientation="horizontal"` attribute — without
            this, the list and content render side-by-side instead of
            stacked. AdminSection has the same workaround. */}
        <div className="mb-4 border-b border-brand-light-green overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
          <TabsList className="!inline-flex !w-auto flex-nowrap gap-1 bg-transparent p-0 mb-0">
            <TabsTrigger
              value="search"
              className="!flex-initial !rounded-none !border-0 !shadow-none px-4 py-2 text-sm font-medium whitespace-nowrap text-slate-500 transition-colors hover:text-slate-700 data-[active]:bg-brand-light-green/50 data-[active]:text-brand-navy data-[active]:font-semibold"
            >
              <Search className="size-4 mr-1.5" />
              Search
            </TabsTrigger>
            <TabsTrigger
              value="social"
              className="!flex-initial !rounded-none !border-0 !shadow-none px-4 py-2 text-sm font-medium whitespace-nowrap text-slate-500 transition-colors hover:text-slate-700 data-[active]:bg-brand-light-green/50 data-[active]:text-brand-navy data-[active]:font-semibold"
            >
              <Share2 className="size-4 mr-1.5" />
              Social
            </TabsTrigger>
            <TabsTrigger
              value="schema"
              className="!flex-initial !rounded-none !border-0 !shadow-none px-4 py-2 text-sm font-medium whitespace-nowrap text-slate-500 transition-colors hover:text-slate-700 data-[active]:bg-brand-light-green/50 data-[active]:text-brand-navy data-[active]:font-semibold"
            >
              <Braces className="size-4 mr-1.5" />
              Schema Checkup
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="search" className="space-y-4">
          <div>
            <label htmlFor="seo-title" className="block text-sm font-medium text-slate-700 mb-1.5">
              SEO title <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              id="seo-title"
              type="text"
              maxLength={200}
              placeholder={`Falls back to the post title (${post.title})`}
              value={seoTitle}
              onChange={(e) => setSeoTitle(e.target.value)}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-slate-500">
              Shown as the clickable headline in Google. Aim for ~60 characters.
            </p>
          </div>

          <div>
            <label htmlFor="seo-description" className="block text-sm font-medium text-slate-700 mb-1.5">
              Meta description <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <textarea
              id="seo-description"
              rows={6}
              maxLength={500}
              placeholder="One or two sentences about this post."
              value={seoDescription}
              onChange={(e) => setSeoDescription(e.target.value)}
              className={inputCls}
            />
            <p className="mt-1 text-xs text-slate-500">
              Shown as the search-result snippet. Aim for ~155 characters.
            </p>
          </div>

          <div>
            <label htmlFor="seo-canonical" className="block text-sm font-medium text-slate-700 mb-1.5">
              Canonical URL <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <input
              id="seo-canonical"
              type="url"
              maxLength={500}
              placeholder={`https://yoursite.example/${slugPath}`}
              value={seoCanonical}
              onChange={(e) => setSeoCanonical(e.target.value)}
              className={`${inputCls} font-mono text-xs`}
            />
            <p className="mt-1 text-xs text-slate-500">
              Set this only when content is duplicated elsewhere — leave blank otherwise.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Robots directive</label>
            <Select value={seoRobots} onValueChange={(v) => setSeoRobots(v as PostRobots)}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: string) => {
                    const opt = ROBOTS_OPTIONS.find((o) => o.value === value);
                    return opt ? opt.label : value;
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ROBOTS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex flex-col">
                      <span>{opt.label}</span>
                      <span className="text-xs text-slate-500">{opt.hint}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-start justify-between gap-4 pt-2 border-t border-slate-100">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900">Exclude from sitemap</div>
              <div className="text-xs text-slate-500">
                Per-post override. Drops this post from <code className="font-mono">/sitemap.xml</code>{" "}
                even when the site-wide Posts toggle is on.
              </div>
            </div>
            <Switch
              checked={seoExcludeFromSitemap}
              onCheckedChange={setSeoExcludeFromSitemap}
            />
          </div>
        </TabsContent>

        <TabsContent value="social" className="space-y-4">
          <div>
            <label htmlFor="seo-og-image" className="block text-sm font-medium text-slate-700 mb-1.5">
              Open Graph image <span className="text-slate-400 font-normal">(optional)</span>
            </label>
            <MediaPickerInput
              id="seo-og-image"
              value={seoOgImage}
              onChange={setSeoOgImage}
              placeholder="https://… or pick from your library"
            />
            <p className="mt-1 text-xs text-slate-500">
              Shown when this post is shared on Facebook, LinkedIn, Slack, etc. Recommended: 1200×630.
              Falls back to the post&apos;s featured image when empty.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="schema" className="space-y-3">
          <SchemaCheckup loading={schemaLoading} preview={schemaPreview} />
        </TabsContent>
      </Tabs>

      <DialogFooter>
        <button
          type="button"
          onClick={onClose}
          className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Saving…" : "Save SEO"}
        </button>
      </DialogFooter>
    </form>
  );
}

// ─── Schema Checkup ─────────────────────────────────────────────────────
//
// Renders the JSON-LD nodes the public route would emit for this post,
// shaped as collapsible groups (one per @type). Source of truth is
// `getPostSchemaPreview` which calls the same `buildPostJsonLdNodes`
// the public renderer uses, so what you see here = what crawlers see.

function SchemaCheckup({
  loading,
  preview,
}: {
  loading: boolean;
  preview: PostSchemaPreview | null;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-500">
        Loading schema preview…
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
        <p className="text-sm text-slate-500">Couldn&apos;t load schema preview.</p>
      </div>
    );
  }

  const { nodes, suppressionReason, canonical } = preview;

  return (
    <div className="space-y-3">
      <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
        Canonical URL:{" "}
        <code className="font-mono text-slate-700 break-all">{canonical}</code>
      </div>

      {suppressionReason === "discourage_indexing" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-slate-700">
          <span className="font-semibold text-amber-700">Suppressed.</span> The
          site is set to discourage search engines (SEO → Robots), so no
          JSON-LD is emitted on any page.
        </div>
      )}
      {suppressionReason === "noindex" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-slate-700">
          <span className="font-semibold text-amber-700">Suppressed.</span>{" "}
          This post is set to <code className="font-mono">noindex</code>, so
          JSON-LD is suppressed even though crawlers couldn&apos;t use it.
        </div>
      )}

      {nodes.length === 0 && suppressionReason === null && (
        <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-sm font-medium text-slate-900">No schemas to emit</p>
          <p className="mt-1 text-xs text-slate-500">
            This post has no FAQ blocks, no Article schema selected, and no
            site-wide breadcrumb context. Pick a schema in the post&apos;s
            Schemas card or add an FAQ block to surface one here.
          </p>
        </div>
      )}

      {nodes.map((node, i) => (
        <SchemaNode key={i} node={node} index={i} />
      ))}
    </div>
  );
}

function SchemaNode({ node, index }: { node: object; index: number }) {
  const typeLabel = readType(node) ?? `Node ${index + 1}`;
  // First node opens by default; later ones collapsed so the dialog
  // doesn't explode vertically on a post with five schema types.
  return (
    <details
      open={index === 0}
      className="group rounded-lg border border-slate-200 bg-white"
    >
      <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm font-medium text-slate-900 select-none list-none [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-slate-400 transition-transform group-open:rotate-90" />
        <span className="font-mono text-brand-green">@type</span>
        <span className="text-slate-400">·</span>
        <span>{typeLabel}</span>
      </summary>
      <div className="border-t border-slate-100 px-3 py-2">
        <JsonNode value={node} depth={0} />
      </div>
    </details>
  );
}

function readType(node: unknown): string | null {
  if (node && typeof node === "object" && "@type" in node) {
    const v = (node as Record<string, unknown>)["@type"];
    if (typeof v === "string") return v;
    if (Array.isArray(v)) return v.filter((x) => typeof x === "string").join(", ");
  }
  return null;
}

/**
 * Recursive JSON renderer. Primitive values render inline; objects/arrays
 * indent and (when deep enough) collapse behind a `<details>`. The depth
 * threshold for auto-collapse keeps the top-level object readable while
 * preventing a deeply nested FAQPage.mainEntity[].acceptedAnswer.text
 * tower from blowing the dialog out.
 */
function JsonNode({ value, depth }: { value: unknown; depth: number }) {
  if (value === null) return <span className="text-slate-400">null</span>;
  if (value === undefined) return <span className="text-slate-400">undefined</span>;
  if (typeof value === "string") {
    return <span className="text-slate-700 break-words">{value}</span>;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return <span className="font-mono text-slate-700">{String(value)}</span>;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-slate-400">[]</span>;
    }
    return (
      <ol className="space-y-1 list-none">
        {value.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-mono text-xs text-slate-400 min-w-[1.5rem] pt-0.5">
              [{i}]
            </span>
            <div className="flex-1 min-w-0">
              <JsonNode value={item} depth={depth + 1} />
            </div>
          </li>
        ))}
      </ol>
    );
  }

  // Object. Render as a definition list of key:value pairs. Nested
  // objects beyond depth 1 fold into their own <details> so a sprawling
  // mainEntity → Question → acceptedAnswer chain stays scannable.
  const entries = Object.entries(value as Record<string, unknown>);
  if (entries.length === 0) {
    return <span className="text-slate-400">{"{}"}</span>;
  }
  return (
    <dl className="space-y-1.5">
      {entries.map(([key, v]) => (
        <div key={key} className="flex gap-2 text-xs leading-relaxed">
          <dt className="font-mono text-brand-green min-w-[120px] flex-shrink-0">
            {key}
          </dt>
          <dd className="flex-1 min-w-0 text-slate-700">
            {isComplex(v) && depth >= 1 ? (
              <details className="group/inner">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-700 select-none list-none [&::-webkit-details-marker]:hidden inline-flex items-center gap-1">
                  <ChevronRight className="size-3 transition-transform group-open/inner:rotate-90" />
                  {Array.isArray(v) ? `${v.length} item${v.length === 1 ? "" : "s"}` : "object"}
                </summary>
                <div className="mt-1 pl-3 border-l border-slate-100">
                  <JsonNode value={v} depth={depth + 1} />
                </div>
              </details>
            ) : (
              <JsonNode value={v} depth={depth + 1} />
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function isComplex(v: unknown): boolean {
  return v !== null && typeof v === "object";
}
