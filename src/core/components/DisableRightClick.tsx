"use client";

import { useEffect } from "react";

/**
 * Soft deterrent — suppresses the browser context menu site-wide while
 * mounted. Renders nothing. Mounted by the public page renderers when the
 * `content.disable_right_click` setting is true; admin routes never mount it.
 *
 * This is *not* a security control. Visitors can still copy text via
 * keyboard shortcuts, view source, or open DevTools. The intent matches
 * the WordPress plugin most authors expect: stop casual right-click-save
 * on images for sites that care, without breaking accessibility tooling.
 */
export function DisableRightClick(): null {
  useEffect(() => {
    function handler(e: MouseEvent) {
      e.preventDefault();
    }
    document.addEventListener("contextmenu", handler);
    return () => {
      document.removeEventListener("contextmenu", handler);
    };
  }, []);
  return null;
}
