"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveVerificationSettings, type VerificationSettings } from "./actions";

interface Props {
  initial: VerificationSettings;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";
const labelCls = "block text-sm font-medium text-slate-700 mb-1";
const cardCls = "rounded-xl bg-white border border-slate-200 p-5";
const helpCls = "mt-1 text-xs text-slate-500";

export function VerificationTab({ initial }: Props) {
  const [google, setGoogle] = useState(initial.google);
  const [bing, setBing] = useState(initial.bing);
  const [yandex, setYandex] = useState(initial.yandex);
  const [pinterest, setPinterest] = useState(initial.pinterest);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveVerificationSettings({ google, bing, yandex, pinterest });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Verification tokens saved");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Search-engine verification</h3>
        <p className="text-xs text-slate-500 mb-4">
          Each token lands as a <code>&lt;meta&gt;</code> tag in the homepage <code>&lt;head&gt;</code>.
          Paste only the content value — we wrap it for you.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="ver-google" className={labelCls}>Google Search Console</label>
            <input
              id="ver-google"
              type="text"
              value={google}
              onChange={(e) => setGoogle(e.target.value)}
              placeholder="abc123…"
              className={inputCls}
            />
            <p className={helpCls}>
              Emits <code>&lt;meta name=&quot;google-site-verification&quot; …&gt;</code>
            </p>
          </div>

          <div>
            <label htmlFor="ver-bing" className={labelCls}>Bing Webmaster</label>
            <input
              id="ver-bing"
              type="text"
              value={bing}
              onChange={(e) => setBing(e.target.value)}
              placeholder="abc123…"
              className={inputCls}
            />
            <p className={helpCls}>
              Emits <code>&lt;meta name=&quot;msvalidate.01&quot; …&gt;</code>
            </p>
          </div>

          <div>
            <label htmlFor="ver-yandex" className={labelCls}>Yandex</label>
            <input
              id="ver-yandex"
              type="text"
              value={yandex}
              onChange={(e) => setYandex(e.target.value)}
              placeholder="abc123…"
              className={inputCls}
            />
            <p className={helpCls}>
              Emits <code>&lt;meta name=&quot;yandex-verification&quot; …&gt;</code>
            </p>
          </div>

          <div>
            <label htmlFor="ver-pinterest" className={labelCls}>Pinterest</label>
            <input
              id="ver-pinterest"
              type="text"
              value={pinterest}
              onChange={(e) => setPinterest(e.target.value)}
              placeholder="abc123…"
              className={inputCls}
            />
            <p className={helpCls}>
              Emits <code>&lt;meta name=&quot;p:domain_verify&quot; …&gt;</code>
            </p>
          </div>
        </div>
      </div>

      <div>
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Saving…" : "Save tokens"}
        </button>
      </div>
    </form>
  );
}
