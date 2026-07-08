import type { ReactNode } from "react";

/**
 * Shared dashed-border placeholder for blocks that have no content yet
 * (e.g. an Image with no URL set, a Gallery with no gallery picked).
 * Keeps the empty-state look consistent across the block library.
 *
 * `mb-4` matches the default-block-spacing convention all custom (non-
 * prose) blocks honor: 1rem bottom margin so blocks visually separate
 * inside the article. Themes override the cascading margin if needed.
 */
export function BlockPlaceholder({ children }: { children: ReactNode }) {
  return (
    <div
      className="mb-4"
      style={{
        padding: "2rem",
        border: "1px dashed #cbd5e1",
        borderRadius: 8,
        textAlign: "center",
        color: "#94a3b8",
        fontSize: 14,
      }}
    >
      {children}
    </div>
  );
}
