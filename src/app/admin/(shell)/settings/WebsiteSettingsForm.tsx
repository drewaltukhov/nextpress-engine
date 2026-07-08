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
import { saveWebsiteSettings, type WebsiteSettings } from "./website-actions";
import { DATE_FORMAT_OPTIONS, TIME_FORMAT_OPTIONS } from "./website-formats";

interface Props {
  initial: WebsiteSettings;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";
const labelCls = "block text-sm font-medium text-slate-700 mb-1.5";
const cardCls = "rounded-xl bg-white border border-slate-200 p-5";

export function WebsiteSettingsForm({ initial }: Props) {
  const [title, setTitle] = useState(initial.title);
  const [tagline, setTagline] = useState(initial.tagline);
  const [url, setUrl] = useState(initial.url);
  const [timezone, setTimezone] = useState(initial.timezone);
  const [dateFormat, setDateFormat] = useState(initial.dateFormat);
  const [timeFormat, setTimeFormat] = useState(initial.timeFormat);
  const [pending, startTransition] = useTransition();

  const timezones =
    typeof Intl !== "undefined" && Intl.supportedValuesOf
      ? Intl.supportedValuesOf("timeZone")
      : ["UTC"];

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveWebsiteSettings({ title, tagline, url, timezone, dateFormat, timeFormat });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Website settings saved");
    });
  }

  return (
    <form onSubmit={handleSave}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Site identity ────────────────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Site Identity</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="ws-title" className={labelCls}>Site title *</label>
              <input
                id="ws-title"
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="ws-tagline" className={labelCls}>Tagline</label>
              <input
                id="ws-tagline"
                type="text"
                placeholder="A short description of your site"
                value={tagline}
                onChange={(e) => setTagline(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <label htmlFor="ws-url" className={labelCls}>Site URL</label>
              <input
                id="ws-url"
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>
        </div>

        {/* ── Date & time ──────────────────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Date & Time</h3>
          <div className="space-y-4">
            <div>
              <label htmlFor="ws-tz" className={labelCls}>Timezone</label>
              <Select value={timezone} onValueChange={(v) => setTimezone(v ?? timezone)}>
                <SelectTrigger id="ws-tz" className="h-10 text-sm">
                  <SelectValue placeholder="Select timezone" />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {timezones.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="ws-date-format" className={labelCls}>Date format</label>
              <Select value={dateFormat} onValueChange={(v) => setDateFormat(v ?? dateFormat)}>
                <SelectTrigger id="ws-date-format" className="h-10 text-sm">
                  <SelectValue placeholder="Pick a date format" />
                </SelectTrigger>
                <SelectContent>
                  {DATE_FORMAT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label htmlFor="ws-time-format" className={labelCls}>Time format</label>
              <Select value={timeFormat} onValueChange={(v) => setTimeFormat(v ?? timeFormat)}>
                <SelectTrigger id="ws-time-format" className="h-10 text-sm">
                  <SelectValue placeholder="Pick a time format" />
                </SelectTrigger>
                <SelectContent>
                  {TIME_FORMAT_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

      </div>

      <div className="mt-5">
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Saving…" : "Save"}
        </button>
      </div>
    </form>
  );
}
