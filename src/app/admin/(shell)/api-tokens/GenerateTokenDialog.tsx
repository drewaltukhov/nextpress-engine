"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { VALID_SCOPES } from "@core-plugins/api/scopes";
import { generateTokenAction } from "./actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTtlDays: number;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

export function GenerateTokenDialog({ open, onOpenChange, defaultTtlDays }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {open ? (
          <DialogBody
            key={String(open)}
            defaultTtlDays={defaultTtlDays}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface BodyProps {
  defaultTtlDays: number;
  onClose: () => void;
}

function DialogBody({ defaultTtlDays, onClose }: BodyProps) {
  const [reveal, setReveal] = useState<{ plaintext: string; prefix: string; expiresAt: string | null } | null>(null);

  if (reveal) {
    return (
      <RevealStep
        plaintext={reveal.plaintext}
        prefix={reveal.prefix}
        expiresAt={reveal.expiresAt}
        onDone={onClose}
      />
    );
  }

  return (
    <FormStep
      defaultTtlDays={defaultTtlDays}
      onCancel={onClose}
      onCreated={(r) => setReveal(r)}
    />
  );
}

// ── Step 1: form ────────────────────────────────────────────────────────

interface FormStepProps {
  defaultTtlDays: number;
  onCancel: () => void;
  onCreated: (result: { plaintext: string; prefix: string; expiresAt: string | null }) => void;
}

function FormStep({ defaultTtlDays, onCancel, onCreated }: FormStepProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Set<string>>(new Set());

  function toggleScope(scope: string) {
    setScopes((prev) => {
      const next = new Set(prev);
      if (next.has(scope)) next.delete(scope);
      else next.add(scope);
      return next;
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await generateTokenAction({
        name,
        scopes: Array.from(scopes),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      onCreated({
        plaintext: result.plaintext,
        prefix: result.prefix,
        expiresAt: result.expiresAt,
      });
      router.refresh();
    });
  }

  const ttlHelp =
    defaultTtlDays > 0
      ? `Expires in ${defaultTtlDays} day${defaultTtlDays === 1 ? "" : "s"} by default. Change in Settings.`
      : "Tokens never expire by default. Change in Settings.";

  return (
    <>
      <DialogHeader>
        <DialogTitle>Generate API token</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="tk-name" className="block text-sm font-medium text-slate-700 mb-1.5">
            Name
          </label>
          <input
            id="tk-name"
            type="text"
            required
            autoFocus
            placeholder="e.g. CI deploy bot"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputCls}
          />
          <p className="mt-1 text-xs text-slate-500">{ttlHelp}</p>
        </div>

        <div>
          <span className="block text-sm font-medium text-slate-700 mb-1.5">
            Scopes
          </span>
          <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-1.5 max-h-56 overflow-y-auto">
            {VALID_SCOPES.map((scope) => (
              <label
                key={scope}
                className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer hover:bg-slate-50 rounded px-1.5 py-1 -mx-1.5"
              >
                <input
                  type="checkbox"
                  checked={scopes.has(scope)}
                  onChange={() => toggleScope(scope)}
                  className="size-4 rounded border-slate-300 text-brand-green focus:ring-brand-green/30"
                />
                <span className={scope === "*" ? "font-mono text-red-700" : "font-mono"}>
                  {scope}
                </span>
                {scope === "*" && (
                  <span className="text-xs text-red-600">(grants all permissions)</span>
                )}
              </label>
            ))}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Pick at least one. The token can only do what its scopes allow.
          </p>
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onCancel}
            className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={pending}
            className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? "Generating…" : "Generate"}
          </button>
        </DialogFooter>
      </form>
    </>
  );
}

// ── Step 2: one-time reveal ────────────────────────────────────────────

interface RevealStepProps {
  plaintext: string;
  prefix: string;
  expiresAt: string | null;
  onDone: () => void;
}

function RevealStep({ plaintext, prefix, expiresAt, onDone }: RevealStepProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(plaintext);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — copy it manually from the box above");
    }
  }

  function handleDownload() {
    const blob = new Blob([plaintext], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${prefix}-token.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Token generated</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-sm text-amber-800">
          <AlertTriangle className="size-4 shrink-0 mt-0.5" />
          <span>
            <strong>Copy this token now.</strong> It won&apos;t be shown again —
            only the SHA-256 hash is stored.
          </span>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Token
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={plaintext}
              onFocus={(e) => e.currentTarget.select()}
              className={`${inputCls} font-mono text-xs`}
            />
            <button
              type="button"
              onClick={handleCopy}
              aria-label="Copy token"
              className="shrink-0 inline-flex items-center justify-center size-10 rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50"
            >
              {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
            </button>
            <button
              type="button"
              onClick={handleDownload}
              aria-label="Download as .txt"
              className="shrink-0 inline-flex items-center justify-center size-10 rounded-lg border border-slate-200 bg-white text-slate-700 transition-colors hover:bg-slate-50"
            >
              <Download className="size-4" />
            </button>
          </div>
          {expiresAt && (
            <p className="mt-1.5 text-xs text-slate-500">
              Expires {new Date(expiresAt).toLocaleString()}
            </p>
          )}
        </div>

        <div className="rounded-lg bg-slate-50 border border-slate-200 px-3 py-2 text-xs text-slate-600">
          Send it as <code className="font-mono">Authorization: Bearer {prefix}…</code> on requests
          to <code className="font-mono">/api/v1/*</code>.
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={onDone}
            className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90"
          >
            I&apos;ve saved it
          </button>
        </DialogFooter>
      </div>
    </>
  );
}
