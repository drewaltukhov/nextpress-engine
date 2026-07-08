import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Access denied",
  // Don't let crawlers index the 403 surface — the URL itself isn't gone,
  // just gated. `noindex` prevents bot-discovered "Access denied" pages
  // from showing up in search results.
  robots: { index: false, follow: false },
};

/**
 * 403 Forbidden — rendered when `forbidden()` is called from a server
 * component (see `assertPublicAccess` in `@core/access/public-access`).
 *
 * Inline styles keep this self-contained: a forbidden visitor must not
 * trigger app-wide CSS bundles (and a misconfigured stylesheet shouldn't
 * leave the page styleless). Same approach as the inline maintenance
 * fallback in `src/app/page.tsx`.
 */
export default function Forbidden() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        background: "#f8fafc",
        color: "#0f172a",
      }}
    >
      <div
        style={{
          maxWidth: 480,
          textAlign: "center",
          padding: "2.5rem",
          background: "white",
          border: "1px solid #e2e8f0",
          borderRadius: 12,
          boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
        }}
      >
        <div
          aria-hidden
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "#fee2e2",
            color: "#dc2626",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 1.25rem",
          }}
        >
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
            <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </div>
        <h1 style={{ fontSize: 24, marginBottom: 8, color: "#2A3A5B" }}>
          Access denied
        </h1>
        <p style={{ color: "#64748b", lineHeight: 1.6, fontSize: 14 }}>
          403 Forbidden — your request was blocked by the site administrator.
        </p>
      </div>
    </main>
  );
}
