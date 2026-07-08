/**
 * Root 404. Renders the active theme's `not-found` template; falls
 * back to a minimal centered message when no theme is active.
 *
 * Phase 7 of the themes-and-menus plan.
 */
import { renderActiveTheme } from "@core-plugins/themes";

export const dynamic = "force-dynamic";

export default async function NotFound() {
  const themed = await renderActiveTheme({ templateId: "not-found" });
  if (themed) {
    return (
      <>
        {themed.head}
        {themed.body}
      </>
    );
  }
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: "0.75rem",
        padding: "2rem",
        fontFamily: "system-ui",
        background: "#f8fafc",
      }}
    >
      <h1 style={{ fontSize: 32, color: "#2A3A5B" }}>Page not found</h1>
      <p style={{ color: "#64748b" }}>We couldn&rsquo;t find the page you were looking for.</p>
      <a href="/" style={{ color: "#2B944F", textDecoration: "none" }}>
        Back to homepage
      </a>
    </main>
  );
}
