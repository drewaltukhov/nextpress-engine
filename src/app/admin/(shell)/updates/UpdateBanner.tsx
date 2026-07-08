"use client";

import { useState } from "react";
import { AlertTriangle, ArrowUpCircle, ChevronDown } from "lucide-react";
import { UpgradeInstructions } from "./UpgradeInstructions";

interface Props {
  issues: string[];
  updateAvailable: boolean;
  latestVersion: string | null;
  releaseUrl: string | null;
}

/**
 * Amber hero block for the Updates page. Lifted out of page.tsx as a
 * client component so the "How to update?" link inside the hero can
 * toggle a sibling UpgradeInstructions card below — both pieces share
 * the same `open` state.
 *
 * Only used for the issue-bearing variant (failing plugins / recent
 * errors / update available). The green and slate hero variants stay
 * server-rendered in the page itself.
 */
export function UpdateBanner({ issues, updateAvailable, latestVersion, releaseUrl }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="mt-8 rounded-2xl bg-amber-50 border border-amber-200 p-6 flex items-start gap-4">
        <div className="size-12 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
          {updateAvailable && issues.length === 1 ? (
            <ArrowUpCircle className="size-6" strokeWidth={2.5} />
          ) : (
            <AlertTriangle className="size-6" strokeWidth={2.5} />
          )}
        </div>
        <div className="flex-1">
          <div className="text-2xl font-semibold text-amber-900">
            {updateAvailable && issues.length === 1
              ? `Update available: ${latestVersion}`
              : `${issues.length} thing${issues.length === 1 ? "" : "s"} need${issues.length === 1 ? "s" : ""} attention`}
          </div>
          <ul className="mt-2 text-sm text-amber-900/90 space-y-1">
            {issues.map((m) => (
              <li key={m} className="flex items-center gap-2">
                <span className="size-1.5 rounded-full bg-amber-500" />
                {m}
              </li>
            ))}
          </ul>
          {updateAvailable && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700"
            >
              How to update?
              <ChevronDown
                className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                strokeWidth={2.5}
              />
            </button>
          )}
        </div>
      </div>

      {updateAvailable && open && latestVersion && (
        <div className="mt-4">
          <UpgradeInstructions latest={latestVersion} releaseUrl={releaseUrl} />
        </div>
      )}
    </>
  );
}
