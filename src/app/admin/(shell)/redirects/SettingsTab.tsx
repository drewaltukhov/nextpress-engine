"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { saveRedirectsSettings, type RedirectsSettings } from "./actions";

interface Props {
  initial: RedirectsSettings;
}

const DEFAULT_STATUS_OPTIONS = [
  { value: "301", label: "301 — Moved Permanently" },
  { value: "302", label: "302 — Found (Temporary)" },
  { value: "307", label: "307 — Temporary Redirect" },
  { value: "308", label: "308 — Permanent Redirect" },
];

const cardCls = "rounded-xl bg-white border border-slate-200 p-5";

export function SettingsTab({ initial }: Props) {
  const [defaultStatus, setDefaultStatus] = useState(String(initial.defaultStatus));
  const [autoOnSlugChange, setAutoOnSlugChange] = useState(initial.autoOnSlugChange);
  const [autoOnPermalinkChange, setAutoOnPermalinkChange] = useState(initial.autoOnPermalinkChange);
  const [autoOnMediaRename, setAutoOnMediaRename] = useState(initial.autoOnMediaRename);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveRedirectsSettings({
        defaultStatus: Number(defaultStatus),
        autoOnSlugChange,
        autoOnPermalinkChange,
        autoOnMediaRename,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Redirect settings saved");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Default redirect status</h3>
        <p className="text-xs text-slate-500 mb-4">
          Used by auto-created redirects and pre-selected on the create form.
        </p>
        <Select
          value={defaultStatus}
          onValueChange={(v) => { if (v) setDefaultStatus(v); }}
        >
          <SelectTrigger className="w-full">
            <SelectValue>
              {DEFAULT_STATUS_OPTIONS.find((o) => o.value === defaultStatus)?.label}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {DEFAULT_STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-3 text-xs text-slate-400">
          410 (Gone) isn&apos;t offered here — it requires per-redirect intent
          and stays available on the Create form.
        </p>
      </div>

      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Auto-create redirects</h3>
        <p className="text-xs text-slate-500 mb-4">
          When a URL changes, automatically create a redirect from the old path
          to the new one. Toggles take effect once Posts, Pages, and Media wire
          up the corresponding hooks.
        </p>
        <div className="space-y-3">
          <ToggleRow
            label="Slug change"
            description="When a post or page slug changes."
            checked={autoOnSlugChange}
            onCheckedChange={setAutoOnSlugChange}
          />
          <ToggleRow
            label="Permalink change"
            description="When the site-wide permalink structure changes."
            checked={autoOnPermalinkChange}
            onCheckedChange={setAutoOnPermalinkChange}
          />
          <ToggleRow
            label="Media rename"
            description="When a media file is renamed."
            checked={autoOnMediaRename}
            onCheckedChange={setAutoOnMediaRename}
          />
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

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}

function ToggleRow({ label, description, checked, onCheckedChange }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-900">{label}</div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
