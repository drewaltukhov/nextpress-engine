"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Globe } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { saveNewsTab, type GoogleNewsSettings } from "./actions";
import {
  COUNTRIES,
  COUNTRY_BY_CODE,
  LANGUAGES,
  LANGUAGE_AUTO,
  LANGUAGE_BY_CODE,
} from "@plugins/google-news/types";

interface Props {
  initial: GoogleNewsSettings;
}

const labelCls = "block text-sm font-medium text-slate-700 mb-1.5";
const cardCls = "rounded-xl bg-white border border-slate-200 p-5";

function CountryOption({ code }: { code: string }) {
  const c = COUNTRY_BY_CODE[code];
  if (!c) return <>{code}</>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-base leading-none">{c.flag}</span>
      <span>{c.label}</span>
    </span>
  );
}

function LanguageOption({ code, countryCode }: { code: string; countryCode: string }) {
  if (code === LANGUAGE_AUTO) {
    const c = COUNTRY_BY_CODE[countryCode];
    return (
      <span className="inline-flex items-center gap-2">
        <span className="text-slate-500">Auto</span>
        {c && <span className="text-xs text-slate-400">({c.hl})</span>}
      </span>
    );
  }
  const l = LANGUAGE_BY_CODE[code];
  if (!l) return <>{code}</>;
  return (
    <span className="inline-flex items-center gap-2">
      <span className="text-base leading-none">{l.flag}</span>
      <span>{l.label}</span>
    </span>
  );
}

// Select expects non-empty values, so use this sentinel for the Auto option.
const AUTO_VALUE = "__auto__";

export function NewsTab({ initial }: Props) {
  const [country, setCountry] = useState(initial.country);
  const [language, setLanguage] = useState(initial.language);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveNewsTab({ country, language });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("News settings updated");
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Country edition</h3>
          <p className="text-xs text-slate-500 mb-4">
            Picks the regional Google News feed.
          </p>

          <label className={labelCls}>Country</label>
          <Select value={country} onValueChange={(v) => { if (v) setCountry(v); }}>
            <SelectTrigger className="w-full">
              <SelectValue>
                <CountryOption code={country} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {COUNTRIES.map((c) => (
                <SelectItem key={c.code} value={c.code}>
                  <span className="inline-flex items-center gap-2">
                    <span className="text-base leading-none">{c.flag}</span>
                    <span>{c.label}</span>
                    <span className="text-xs text-slate-400 ml-1">({c.code})</span>
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-1">Language</h3>
          <p className="text-xs text-slate-500 mb-4">
            Override the headline language. Leave on <span className="font-medium">Auto</span> to use the country&apos;s default.
          </p>

          <label className={labelCls}>Headline language</label>
          <Select
            value={language === LANGUAGE_AUTO ? AUTO_VALUE : language}
            onValueChange={(v) => {
              if (!v) return;
              setLanguage(v === AUTO_VALUE ? LANGUAGE_AUTO : v);
            }}
          >
            <SelectTrigger className="w-full">
              <SelectValue>
                <LanguageOption code={language} countryCode={country} />
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={AUTO_VALUE}>
                <span className="inline-flex items-center gap-2">
                  <span className="text-slate-600 font-medium">Auto</span>
                  <span className="text-xs text-slate-400">— use country default</span>
                </span>
              </SelectItem>
              {LANGUAGES.map((l) => (
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

          <p className="mt-3 text-xs text-slate-400">
            Some country × language combinations may not exist in Google News;
            it falls back to the country&apos;s default in that case.
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-4">
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Saving..." : "Save"}
        </button>
        <p className="text-xs text-slate-400 inline-flex items-center gap-1.5">
          <Globe className="size-3" />
          Headlines load directly from Google News — no API key needed.
        </p>
      </div>
    </form>
  );
}
