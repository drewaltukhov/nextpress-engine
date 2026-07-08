"use client";

import { useEffect, useState, useTransition as reactUseTransition } from "react";
import { Loader2 } from "lucide-react";

/**
 * Global processing indicator — shows a floating pill when any
 * server action or tracked transition is in flight.
 *
 * Two ways to trigger:
 * 1. useTrackedTransition() — drop-in for useTransition, auto-tracks
 * 2. Automatic fetch interception — detects Next.js server action
 *    POST requests (x-action header) without any code changes
 */

let pendingCount = 0;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export function startProcessing(): () => void {
  pendingCount++;
  notify();
  return () => {
    pendingCount--;
    notify();
  };
}

/**
 * Drop-in replacement for React's useTransition that auto-tracks
 * the pending state in the global processing indicator.
 */
export function useTrackedTransition(): [boolean, (fn: () => Promise<void>) => void] {
  const [pending, rawStart] = reactUseTransition();

  function start(fn: () => Promise<void>) {
    const done = startProcessing();
    rawStart(async () => {
      try {
        await fn();
      } finally {
        done();
      }
    });
  }

  return [pending, start];
}

/**
 * Floating indicator component — render once in the shell layout.
 * Also installs a fetch interceptor to detect server actions automatically.
 */
export function ProcessingIndicator() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const update = () => setVisible(pendingCount > 0);
    listeners.add(update);

    // Intercept fetch to detect Next.js server action calls.
    // Server actions use POST with specific headers.
    const originalFetch = window.fetch;
    window.fetch = async function (...args: Parameters<typeof fetch>) {
      const [input, init] = args;
      const isServerAction =
        init?.method?.toUpperCase() === "POST" &&
        (init?.headers as Record<string, string>)?.["Next-Action"] != null;

      // Also detect FormData POSTs to the same origin (server action form submissions)
      const isFormAction =
        init?.method?.toUpperCase() === "POST" &&
        typeof input === "string" &&
        !input.startsWith("http");

      if (isServerAction || isFormAction) {
        const done = startProcessing();
        try {
          return await originalFetch.apply(this, args);
        } finally {
          done();
        }
      }
      return originalFetch.apply(this, args);
    };

    return () => {
      listeners.delete(update);
      window.fetch = originalFetch;
    };
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-brand-light-green/90 backdrop-blur-sm border border-brand-green/20 shadow-lg">
        <Loader2 className="size-4 text-brand-green animate-spin" />
        <span className="text-sm font-medium text-brand-navy">Processing</span>
      </div>
    </div>
  );
}
