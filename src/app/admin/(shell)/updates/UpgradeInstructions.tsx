"use client";

import { useState } from "react";
import { Copy, Check, ExternalLink, Terminal } from "lucide-react";

interface Props {
  /** Latest tag from the update check (e.g. "v0.3.0-admin-login") — used in the heading. */
  latest: string;
  /** GitHub release URL — link target for "What changed". */
  releaseUrl: string | null;
}

const COMMANDS: { label: string; cmd: string }[] = [
  { label: "Pull the latest code", cmd: "git pull origin main" },
  { label: "Update dependencies", cmd: "npm install --legacy-peer-deps" },
  { label: "Apply any new migrations", cmd: "npm run migrate apply" }
];

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Some browsers in non-secure contexts reject clipboard writes —
      // user can still select+copy from the visible text.
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="size-7 rounded-md flex items-center justify-center text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
      aria-label={label}
    >
      {copied ? <Check className="size-3.5" strokeWidth={3} /> : <Copy className="size-3.5" />}
    </button>
  );
}

function CommandRow({ index, label, cmd }: { index: number; label: string; cmd: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="size-5 rounded-full bg-slate-100 text-slate-500 text-[11px] font-bold flex items-center justify-center">
          {index}
        </span>
        <span className="text-xs uppercase tracking-wider text-slate-400 font-bold">
          {label}
        </span>
      </div>
      <div className="flex items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 font-mono text-sm text-slate-100">
        <Terminal className="size-3.5 text-slate-400 shrink-0" />
        <code className="flex-1 select-all">{cmd}</code>
        <CopyButton value={cmd} label={`Copy: ${cmd}`} />
      </div>
    </div>
  );
}

export function UpgradeInstructions({ latest, releaseUrl }: Props) {
  const allCommands = COMMANDS.map((c) => c.cmd).join("\n");

  return (
    <div className="rounded-xl bg-white border border-slate-200 p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-1.5">
            Upgrade to {latest}
          </div>
          <p className="text-sm text-slate-500">
            NextPress doesn&apos;t auto-update yet. Run these three commands in
            your project directory, then restart{" "}
            <code className="text-xs px-1 py-0.5 rounded bg-slate-100 text-slate-700">npm run dev</code>{" "}
            (or push to your Vercel deploy).
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {releaseUrl && (
            <a
              href={releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-brand-green font-semibold hover:underline whitespace-nowrap"
            >
              What changed <ExternalLink className="size-3.5" />
            </a>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {COMMANDS.map((c, i) => (
          <CommandRow key={c.cmd} index={i + 1} {...c} />
        ))}
      </div>

      <div className="mt-4 flex items-center justify-end gap-2">
        <CopyAll value={allCommands} />
      </div>
    </div>
  );
}

function CopyAll({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fall back to manual copy
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50"
    >
      {copied ? <Check className="size-3.5 text-brand-green" strokeWidth={3} /> : <Copy className="size-3.5" />}
      {copied ? "Copied all" : "Copy all"}
    </button>
  );
}
