"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Copy, Check, ExternalLink } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { saveSitemapSettings, type SitemapSettings } from "./actions";

interface Props {
  initial: SitemapSettings;
  sitemapUrl: string;
}

const cardCls = "rounded-xl bg-white border border-slate-200 p-5";

interface ContentTypeRow {
  key: keyof SitemapSettings["include"];
  label: string;
  description: string;
  shipped: boolean;
}

const CONTENT_TYPES: ContentTypeRow[] = [
  { key: "homepage", label: "Homepage", description: "Always-on root URL.", shipped: true },
  { key: "media", label: "Media", description: "Image library URLs.", shipped: true },
  { key: "pages", label: "Pages", description: "Static pages.", shipped: true },
  { key: "posts", label: "Posts", description: "Blog posts (pillars, spikes, standalone).", shipped: true },
  { key: "topics", label: "Topics", description: "Taxonomy archives at /topics/<slug>.", shipped: true },
];

export function SitemapTab({ initial, sitemapUrl }: Props) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [include, setInclude] = useState(initial.include);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function toggleType(key: keyof SitemapSettings["include"], value: boolean) {
    setInclude((prev) => ({ ...prev, [key]: value }));
  }

  function copySitemap() {
    void navigator.clipboard.writeText(sitemapUrl).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveSitemapSettings({ enabled, include });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Sitemap settings saved");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Sitemap</h3>
        <p className="text-xs text-slate-500 mb-4">
          Search engines crawl this XML file to discover your URLs. Submit it to{" "}
          <a
            href="https://search.google.com/search-console"
            target="_blank"
            rel="noreferrer"
            className="text-brand-green underline-offset-2 hover:underline"
          >
            Google Search Console
          </a>{" "}
          and Bing Webmaster Tools.
        </p>

        <div className="flex items-start justify-between gap-4 py-2 border-b border-slate-100">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900">Auto-generate sitemap</div>
            <div className="text-xs text-slate-500">When off, /sitemap.xml is no longer served to search engines.</div>
          </div>
          <Switch checked={enabled} onCheckedChange={setEnabled} />
        </div>

        <div className="mt-4">
          <div className="text-xs font-medium text-slate-700 mb-1.5">Sitemap URL</div>
          <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <code className="flex-1 truncate text-xs text-slate-700">{sitemapUrl}</code>
            <button
              type="button"
              onClick={copySitemap}
              className="text-slate-500 hover:text-slate-900 transition-colors"
              aria-label="Copy sitemap URL"
            >
              {copied ? <Check className="size-4 text-brand-green" /> : <Copy className="size-4" />}
            </button>
            <a
              href={sitemapUrl}
              target="_blank"
              rel="noreferrer"
              className="text-slate-500 hover:text-slate-900 transition-colors"
              aria-label="Open sitemap in a new tab"
            >
              <ExternalLink className="size-4" />
            </a>
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Include in sitemap</h3>
        <p className="text-xs text-slate-500 mb-4">
          Toggle which content types appear. Items marked “ships when X is built” stay queued
          until the matching plugin is live.
        </p>
        <div className="space-y-3">
          {CONTENT_TYPES.map((row) => (
            <div
              key={row.key}
              className={`flex items-start justify-between gap-4 py-2 ${row.shipped ? "" : "opacity-60"}`}
            >
              <div className="min-w-0">
                <div className="text-sm font-medium text-slate-900">
                  {row.label}
                  {!row.shipped && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">
                      ships when {row.label.toLowerCase()} is built
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">{row.description}</div>
              </div>
              <Switch
                checked={include[row.key]}
                onCheckedChange={(v) => toggleType(row.key, v)}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="lg:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Saving…" : "Save settings"}
        </button>
      </div>
    </form>
  );
}
