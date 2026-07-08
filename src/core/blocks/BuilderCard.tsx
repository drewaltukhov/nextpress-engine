import type { ReactNode } from "react";
import { WidgetIcon } from "./widget-icons";

/**
 * Shared "what this block represents" card used by every theme/plugin
 * block when rendered in the theme builder's preview area
 * (`puck.isEditing === true`). Production renders never use it.
 *
 * Visual contract: 2px border, tinted background, uppercase 10px bold
 * title, slate-600 body paragraph, optional children rendered below.
 * The whole thing has `not-prose` and `mb-4` so it slots into the
 * prose-styled main column without the typography plugin distorting it.
 *
 * `tone` lets plugin authors distinguish their blocks visually in the
 * widget rail (e.g. orange for Crypto Beat) while keeping the same
 * card layout. Defaults to the brand-green palette used by core blocks.
 */
export type BuilderCardTone = "default" | "orange";

export interface BuilderCardProps {
  /** Short role label — "Page Content", "Post Title", etc. */
  title: string;
  /** One-line description of what the block shows on the public site. */
  description?: string;
  /** Optional preview material rendered under the description. */
  children?: ReactNode;
  /** Color palette. `"default"` = brand-green (core blocks).
   *  `"orange"` = subtle orange (plugin-shipped accent). */
  tone?: BuilderCardTone;
  /** The block's registered name (e.g. `"HeroTitle"`). When set, the
   *  card auto-resolves the matching Lucide icon via `WIDGET_ICONS`
   *  so the preview matches the icon in the widgets rail. Ignored
   *  when an explicit `icon` is also supplied. */
  name?: string;
  /** Explicit leading icon — overrides `name` lookup. Useful for
   *  plugin blocks that want to ship a non-Lucide icon. */
  icon?: ReactNode;
}

const TONE_CLASSES: Record<BuilderCardTone, { border: string; bg: string; title: string }> = {
  default: {
    border: "border-brand-green",
    bg: "bg-brand-light-green",
    title: "text-brand-navy",
  },
  orange: {
    border: "border-orange-400",
    bg: "bg-orange-50",
    title: "text-orange-900",
  },
};

export function BuilderCard({ title, description, children, tone = "default", name, icon }: BuilderCardProps) {
  const t = TONE_CLASSES[tone];
  // Resolve the leading icon: explicit `icon` wins, then look up by
  // block `name` in the shared `WIDGET_ICONS` map, then nothing.
  const resolvedIcon = icon ?? (name ? <WidgetIcon name={name} /> : null);
  return (
    <div className={`not-prose mb-4 border-2 ${t.border} ${t.bg} p-3`}>
      <div className="flex items-center gap-1.5">
        {resolvedIcon ? (
          <span className={`shrink-0 ${t.title}`} aria-hidden="true">
            {resolvedIcon}
          </span>
        ) : null}
        <p className={`text-[10px] font-bold uppercase tracking-wider ${t.title}`}>
          {title}
        </p>
      </div>
      {description ? (
        <p className="mt-1 text-sm text-slate-600">{description}</p>
      ) : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
