"use client";

import { useEffect } from "react";
import { toast } from "sonner";

const TOAST_ID = "smtp-not-configured";
const DISMISS_KEY = "np.warn.smtp.dismissed";

/**
 * Dashboard-mount toast warning users that email transport isn't configured.
 * Without SMTP, password resets / invites / verification emails will fail.
 *
 * Stays until the user clicks Discard (persisted in localStorage so it
 * doesn't re-show every visit). Auto-clears once SMTP is actually configured.
 */
export function SmtpWarning() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(DISMISS_KEY) === "1") return;

    toast.warning("Email is not configured", {
      id: TOAST_ID,
      description:
        "NextPress can't send password resets, invites, or verification emails until you set up SMTP in Settings.",
      duration: Infinity,
      style: {
        background: "var(--color-brand-light-green)",
        color: "var(--color-brand-navy)",
        border: "1px solid color-mix(in oklab, var(--color-brand-green) 35%, transparent)",
        gap: "0.875rem",
      },
      action: {
        label: "Configure",
        onClick: () => {
          window.location.assign("/admin/settings?tab=smtp");
        },
      },
      cancel: {
        label: "Discard",
        onClick: () => {
          window.localStorage.setItem(DISMISS_KEY, "1");
          toast.dismiss(TOAST_ID);
        },
      },
    });
  }, []);

  return null;
}
