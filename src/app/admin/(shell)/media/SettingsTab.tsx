"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { saveSettings } from "./actions";
import { MigrationCard } from "./MigrationCard";
import type { MediaSettings } from "@core-plugins/media/service";
import type { MigrationStats } from "@core-plugins/media/migrate";

interface Props {
  initial: MediaSettings;
  r2Available: boolean;
  initialMigrationStats: MigrationStats;
}

const KNOWN_TYPES = [
  { mime: "image/jpeg", label: "JPEG (.jpg, .jpeg)" },
  { mime: "image/png", label: "PNG (.png)" },
  { mime: "image/webp", label: "WebP (.webp)" },
  { mime: "image/gif", label: "GIF (.gif)" },
  { mime: "image/svg+xml", label: "SVG (.svg)" },
];

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";
const labelCls = "block text-sm font-medium text-slate-700 mb-1.5";
const cardCls = "rounded-xl bg-white border border-slate-200 p-5";

export function SettingsTab({ initial, r2Available, initialMigrationStats }: Props) {
  const [allowed, setAllowed] = useState<string[]>(initial.allowedMimeTypes);
  const [maxMb, setMaxMb] = useState<number>(initial.maxFileSizeMb);
  const [convertToWebp, setConvertToWebp] = useState<boolean>(initial.convertToWebp);
  const [storageBackend, setStorageBackend] = useState<"db" | "r2">(initial.storageBackend);
  const [pending, startTransition] = useTransition();

  function toggleType(mime: string) {
    setAllowed((prev) =>
      prev.includes(mime) ? prev.filter((m) => m !== mime) : [...prev, mime]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (allowed.length === 0) {
      toast.error("At least one type must be allowed");
      return;
    }
    if (storageBackend === "r2" && !r2Available) {
      toast.error("R2 credentials are not configured — cannot enable R2 storage.");
      return;
    }
    startTransition(async () => {
      const result = await saveSettings({
        allowedMimeTypes: allowed,
        maxFileSizeMb: maxMb,
        convertToWebp,
        storageBackend,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Media settings saved");
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Storage backend</h3>
          <p className="text-xs text-slate-500 mb-4">
            Where new uploads are persisted. Existing files keep their current backend regardless of this setting.
          </p>
          <div className="space-y-2.5">
            <label className="flex items-start gap-2.5 cursor-pointer text-sm">
              <input
                type="radio"
                name="storageBackend"
                value="db"
                checked={storageBackend === "db"}
                onChange={() => setStorageBackend("db")}
                className="mt-0.5 size-4 border-slate-300 text-brand-green focus:ring-brand-green/30"
              />
              <span>
                <span className="font-medium text-slate-900">Database</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Bytes live in the <code>media</code> table. Always available; the default.
                </span>
              </span>
            </label>

            <label
              className={`flex items-start gap-2.5 text-sm ${
                r2Available ? "cursor-pointer" : "cursor-not-allowed opacity-60"
              }`}
            >
              <input
                type="radio"
                name="storageBackend"
                value="r2"
                checked={storageBackend === "r2"}
                disabled={!r2Available}
                onChange={() => setStorageBackend("r2")}
                className="mt-0.5 size-4 border-slate-300 text-brand-green focus:ring-brand-green/30 disabled:cursor-not-allowed"
              />
              <span>
                <span className={`font-medium ${r2Available ? "text-slate-900" : "text-slate-500"}`}>
                  Cloudflare R2
                </span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  {r2Available
                    ? "Uploads stream directly to your R2 bucket. Public URLs are served via NEXT_PUBLIC_R2_PUBLIC_URL."
                    : "R2 credentials are not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, and NEXT_PUBLIC_R2_PUBLIC_URL in your environment, then redeploy/restart to enable."}
                </span>
              </span>
            </label>
          </div>
        </div>

        <MigrationCard r2Available={r2Available} initialStats={initialMigrationStats} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Allowed image types</h3>
          <p className="text-xs text-slate-500 mb-4">
            Files outside the allowed list are rejected at upload time.
          </p>
          <ul className="space-y-2">
            {KNOWN_TYPES.map((t) => {
              const checked = allowed.includes(t.mime);
              return (
                <li key={t.mime}>
                  <label className="flex items-center gap-2.5 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleType(t.mime)}
                      className="size-4 rounded border-slate-300 text-brand-green focus:ring-brand-green/30"
                    />
                    <span className={checked ? "text-slate-900" : "text-slate-500"}>{t.label}</span>
                    <span className="ml-auto text-xs text-slate-400 font-mono">{t.mime}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>

        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-3">Maximum file size</h3>
          <label className={labelCls}>Limit (MB)</label>
          <input
            type="number"
            min={1}
            max={100}
            value={maxMb}
            onChange={(e) => setMaxMb(Number(e.target.value) || 5)}
            className={inputCls}
          />
          <p className="mt-2 text-xs text-slate-400">
            Bigger files put more pressure on the database. 5 MB suits most photos and featured
            images.
          </p>

          <div className="mt-5 pt-5 border-t border-slate-100">
            <label className="flex items-start gap-2.5 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={convertToWebp}
                onChange={(e) => setConvertToWebp(e.target.checked)}
                className="mt-0.5 size-4 rounded border-slate-300 text-brand-green focus:ring-brand-green/30"
              />
              <span>
                <span className="font-medium text-slate-900">Auto-convert JPEG/BMP to WebP</span>
                <span className="block text-xs text-slate-500 mt-0.5">
                  Re-encodes incoming JPEG and BMP uploads as WebP at quality 90 before storage.
                  Requires WebP in the allowed types list.
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>

      <div className="mt-5">
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Saving..." : "Save settings"}
        </button>
      </div>
    </form>
  );
}
