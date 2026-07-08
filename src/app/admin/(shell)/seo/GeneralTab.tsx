"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { MediaPickerInput } from "@core/components/MediaPicker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveGeneralSettings, type GeneralSettings } from "./actions";

interface Props {
  initial: GeneralSettings;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";
const labelCls = "block text-sm font-medium text-slate-700 mb-1.5";
const cardCls = "rounded-xl bg-white border border-slate-200 p-5";
const helpCls = "mt-1 text-xs text-slate-500";

interface SiteLanguage {
  code: string;
  label: string;
  flag: string;
}
// BCP-47 codes for the <html lang> attribute and og:locale. Kept inline
// rather than importing from a plugin to avoid cross-plugin coupling.
const SITE_LANGUAGES: SiteLanguage[] = [
  { code: "ar",      label: "Arabic",                 flag: "🇸🇦" },
  { code: "zh-Hans", label: "Chinese (Simplified)",   flag: "🇨🇳" },
  { code: "zh-Hant", label: "Chinese (Traditional)",  flag: "🇹🇼" },
  { code: "nl",      label: "Dutch",                  flag: "🇳🇱" },
  { code: "en",      label: "English",                flag: "🇬🇧" },
  { code: "fr",      label: "French",                 flag: "🇫🇷" },
  { code: "de",      label: "German",                 flag: "🇩🇪" },
  { code: "he",      label: "Hebrew",                 flag: "🇮🇱" },
  { code: "hi",      label: "Hindi",                  flag: "🇮🇳" },
  { code: "id",      label: "Indonesian",             flag: "🇮🇩" },
  { code: "it",      label: "Italian",                flag: "🇮🇹" },
  { code: "ja",      label: "Japanese",               flag: "🇯🇵" },
  { code: "ko",      label: "Korean",                 flag: "🇰🇷" },
  { code: "pl",      label: "Polish",                 flag: "🇵🇱" },
  { code: "pt-BR",   label: "Portuguese (Brazil)",    flag: "🇧🇷" },
  { code: "pt-PT",   label: "Portuguese (Portugal)",  flag: "🇵🇹" },
  { code: "ru",      label: "Russian",                flag: "🇷🇺" },
  { code: "es",      label: "Spanish",                flag: "🇪🇸" },
  { code: "es-419",  label: "Spanish (Latin America)",flag: "🇲🇽" },
  { code: "th",      label: "Thai",                   flag: "🇹🇭" },
  { code: "tr",      label: "Turkish",                flag: "🇹🇷" },
  { code: "uk",      label: "Ukrainian",              flag: "🇺🇦" },
  { code: "vi",      label: "Vietnamese",             flag: "🇻🇳" },
];
const SITE_LANGUAGE_BY_CODE: Record<string, SiteLanguage> = Object.fromEntries(
  SITE_LANGUAGES.map((l) => [l.code, l])
);

function LanguageOption({ code }: { code: string }) {
  const lang = SITE_LANGUAGE_BY_CODE[code];
  if (!lang) {
    return (
      <span className="inline-flex items-center gap-2 text-slate-500">
        <span className="text-xs font-mono">{code || "—"}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-base leading-none">{lang.flag}</span>
      <span>{lang.label}</span>
      <span className="text-xs text-slate-400 ml-1">({lang.code})</span>
    </span>
  );
}

const SAMPLE_TITLE = "About us";
const SAMPLE_SITE = "Acme Corp";
const SAMPLE_TAGLINE = "Tools for builders";

function renderTitlePreview(format: string): string {
  return format
    .replaceAll("%title%", SAMPLE_TITLE)
    .replaceAll("%site%", SAMPLE_SITE)
    .replaceAll("%tagline%", SAMPLE_TAGLINE)
    .replaceAll("%sep%", "—");
}

export function GeneralTab({ initial }: Props) {
  const [titleFormat, setTitleFormat] = useState(initial.titleFormat);
  const [defaultDescription, setDefaultDescription] = useState(initial.defaultDescription);
  const [language, setLanguage] = useState(initial.language);
  const [defaultOgImage, setDefaultOgImage] = useState(initial.defaultOgImage);
  const [ogSiteName, setOgSiteName] = useState(initial.ogSiteName);
  const [twitterHandle, setTwitterHandle] = useState(initial.twitterHandle);
  const [pending, startTransition] = useTransition();

  const preview = useMemo(() => renderTitlePreview(titleFormat), [titleFormat]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveGeneralSettings({
        titleFormat,
        defaultDescription,
        language,
        defaultOgImage,
        ogSiteName,
        twitterHandle,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("SEO general settings saved");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Title & description</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="seo-title-format" className={labelCls}>Title format</label>
            <input
              id="seo-title-format"
              type="text"
              value={titleFormat}
              onChange={(e) => setTitleFormat(e.target.value)}
              className={inputCls}
            />
            <p className={helpCls}>
              Tokens: <code>%title%</code>, <code>%site%</code>, <code>%tagline%</code>, <code>%sep%</code>.
              Preview: <span className="text-slate-700 font-medium">{preview}</span>
            </p>
          </div>
          <div>
            <label htmlFor="seo-default-description" className={labelCls}>Default meta description</label>
            <textarea
              id="seo-default-description"
              rows={3}
              value={defaultDescription}
              onChange={(e) => setDefaultDescription(e.target.value)}
              placeholder="A short description used on the homepage and as a fallback for pages without one."
              className={inputCls}
            />
            <p className={helpCls}>{defaultDescription.length} / 500 chars · ideal 50–160</p>
          </div>
          <div>
            <label htmlFor="seo-language" className={labelCls}>Site language</label>
            <Select value={language || "en"} onValueChange={(v) => { if (v) setLanguage(v); }}>
              <SelectTrigger id="seo-language" className="w-full">
                <SelectValue>
                  <LanguageOption code={language || "en"} />
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {SITE_LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>
                    <span className="inline-flex items-center gap-2">
                      <span className="text-base leading-none">{l.flag}</span>
                      <span>{l.label}</span>
                      <span className="text-xs text-slate-400 ml-1">({l.code})</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className={helpCls}>BCP-47 code — drives <code>&lt;html lang&gt;</code> and og:locale.</p>
          </div>
        </div>
      </div>

      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Social sharing</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="seo-og-image" className={labelCls}>Default social image</label>
            <MediaPickerInput
              id="seo-og-image"
              value={defaultOgImage}
              onChange={setDefaultOgImage}
              placeholder="https://… or pick from your library"
            />
            <p className={helpCls}>
              Fallback image when content has no featured image. Recommended 1200×630.
            </p>
          </div>
          <div>
            <label htmlFor="seo-og-site-name" className={labelCls}>OG site name</label>
            <input
              id="seo-og-site-name"
              type="text"
              value={ogSiteName}
              onChange={(e) => setOgSiteName(e.target.value)}
              placeholder="Leave blank to use site title"
              className={inputCls}
            />
            <p className={helpCls}>Used for og:site_name. Most sites can leave this blank.</p>
          </div>
          <div>
            <label htmlFor="seo-twitter" className={labelCls}>Twitter handle</label>
            <input
              id="seo-twitter"
              type="text"
              value={twitterHandle}
              onChange={(e) => setTwitterHandle(e.target.value)}
              placeholder="@yourhandle"
              className={inputCls}
            />
            <p className={helpCls}>Used for twitter:site and twitter:creator.</p>
          </div>
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
