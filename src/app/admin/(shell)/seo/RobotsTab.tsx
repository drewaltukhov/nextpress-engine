"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { generateRobotsTxt } from "@core-plugins/seo/generators";
import { saveRobotsSettings, type RobotsSettings } from "./actions";

interface Props {
  initial: RobotsSettings;
  siteUrl: string;
  isStaging: boolean;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";
const cardCls = "rounded-xl bg-white border border-slate-200 p-5";

const DEFAULT_ROBOTS_HINT = `User-agent: *
Allow: /

Disallow: /admin/
Disallow: /api/

Sitemap: <site>/sitemap.xml`;

export function RobotsTab({ initial, siteUrl, isStaging }: Props) {
  const [discourageIndexing, setDiscourageIndexing] = useState(initial.discourageIndexing);
  const [discourageAiAgents, setDiscourageAiAgents] = useState(initial.discourageAiAgents);
  const [customContent, setCustomContent] = useState(initial.customContent);
  const [pending, startTransition] = useTransition();

  // Live preview — the same pure generator the /robots.txt route runs, so
  // the preview can't drift from the served file. Always rendered as the
  // production output; staging deployments serve a block-all instead (noted
  // under the preview when applicable).
  const preview = useMemo(
    () =>
      generateRobotsTxt({
        siteUrl,
        customContent: customContent.trim() || null,
        discourageIndexing,
        discourageAiAgents,
      }),
    [siteUrl, discourageIndexing, discourageAiAgents, customContent],
  );

  function handleReset() {
    setCustomContent("");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveRobotsSettings({
        discourageIndexing,
        discourageAiAgents,
        customContent,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Robots settings saved");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
      {discourageIndexing && (
        <div className="flex gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <AlertTriangle className="mt-0.5 size-5 shrink-0" />
          <div className="text-sm">
            <p className="font-semibold">Search engines are being told to stay away.</p>
            <p className="mt-1 leading-relaxed">
              Every public page emits <code>noindex</code>, robots.txt blocks all crawlers, and the
              sitemap returns 404. Use this on staging or while building. Forgetting to flip it off
              after launch is the #1 SEO mistake — your site will not appear in search results.
            </p>
          </div>
        </div>
      )}

      <div className={cardCls}>
        <div className="flex items-start justify-between gap-4 py-1">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900">Discourage search engines</div>
            <div className="text-xs text-slate-500">
              Master noindex toggle. Overrides the custom robots.txt below.
            </div>
          </div>
          <Switch
            checked={discourageIndexing}
            onCheckedChange={setDiscourageIndexing}
            aria-label="Discourage search engines"
          />
        </div>
      </div>

      <div className={cardCls}>
        <div className="flex items-start justify-between gap-4 py-1">
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-900">Discourage AI agents</div>
            <div className="text-xs text-slate-500">
              Ask AI crawlers (ChatGPT, Claude, Perplexity, etc.) not to access or train on your
              content, and hide <code>/llms.txt</code>. Advisory only — enforcement depends on each
              bot honoring robots.txt.
            </div>
          </div>
          <Switch
            checked={discourageAiAgents}
            onCheckedChange={setDiscourageAiAgents}
            disabled={discourageIndexing}
            aria-label="Discourage AI agents"
          />
        </div>
        {discourageIndexing && (
          <p className="mt-2 text-xs text-slate-400">
            Already covered — discouraging search engines blocks every crawler (AI agents
            included) and hides <code>/llms.txt</code>.
          </p>
        )}
      </div>

      <div className={cardCls}>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-900">Custom robots.txt</h3>
          <button
            type="button"
            onClick={handleReset}
            disabled={!customContent}
            className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw className="size-3.5" />
            Use default
          </button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Override the auto-generated robots.txt. Leave blank to use the default. Ignored when
          “Discourage search engines” is on.
        </p>
        <textarea
          rows={10}
          value={customContent}
          onChange={(e) => setCustomContent(e.target.value)}
          placeholder={DEFAULT_ROBOTS_HINT}
          disabled={discourageIndexing}
          className={`${inputCls} ${discourageIndexing ? "opacity-50" : ""}`}
        />
      </div>

      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Live preview</h3>
        <p className="text-xs text-slate-500 mb-3">
          The exact text /robots.txt serves in production with current settings. Changes take up
          to an hour to reach crawlers (CDN cache).
        </p>
        <pre className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-mono text-slate-700 whitespace-pre-wrap">
{preview}
        </pre>
        {isStaging && (
          <p className="mt-2 text-xs text-slate-400">
            This deployment is a preview/development environment — it serves a block-all
            robots.txt instead of the rules above.
          </p>
        )}
      </div>

      <div>
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
