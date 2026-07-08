"use client";

import { useState } from "react";

/**
 * Shared user-avatar circle. Shows the uploaded `url` when present;
 * otherwise (or after a load error) falls back to first-letter initials
 * on a brand-light-green chip.
 *
 * The `url` is treated as opaque — could be `/media/<id>`, a Vercel
 * Blob URL, or a Gravatar fallback. The component does not validate it;
 * onError just flips to the initials path so a 404 / dead link doesn't
 * leave a broken-image icon in the chrome.
 */
interface Props {
  /** Display name — drives the initials fallback. */
  name: string;
  /** Optional email — used as the second source of an initial when name
   *  is empty (covers the "User has only an email, no display name yet"
   *  case). */
  email?: string;
  /** Avatar image URL. Empty / null / undefined renders the initials. */
  url?: string | null;
  /** Pixel size — sets both width and height. Default matches the size-8
   *  (32px) used by the admin user list. */
  size?: number;
  /** Extra classes for the outer wrapper (e.g. `shrink-0`, font tweaks). */
  className?: string;
  /** Optional title attribute. Defaults to the display name. */
  title?: string;
}

function initialsFor(name: string, email: string): string {
  const source = name?.trim() || email?.trim() || "";
  if (!source) return "?";
  return (
    source
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export function UserAvatar({
  name,
  email = "",
  url,
  size = 32,
  className = "",
  title,
}: Props) {
  const [imageBroken, setImageBroken] = useState(false);
  const trimmed = url?.trim();
  const showImage = trimmed && !imageBroken;
  const initials = initialsFor(name, email);

  // Inline width/height match the size prop exactly so any caller can
  // override the default 32px without writing a Tailwind class for the
  // size. We still pass `rounded-full` + brand classes via the wrapper
  // for the initials variant; for the image variant, the same wrapper
  // becomes the clipping mask.
  const sizeStyle = { width: size, height: size };

  if (showImage) {
    return (
      // Avatar URLs come from an arbitrary host (Vercel Blob / library
      // media URL); next/image's domain allowlist would 404 unconfigured
      // hosts.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={trimmed}
        alt=""
        title={title ?? name}
        style={sizeStyle}
        onError={() => setImageBroken(true)}
        className={`rounded-full object-cover bg-slate-100 shrink-0 ${className}`}
        loading="lazy"
      />
    );
  }

  return (
    <span
      style={sizeStyle}
      title={title ?? name}
      className={`inline-flex items-center justify-center rounded-full bg-brand-light-green text-brand-navy font-bold shrink-0 ${className}`}
    >
      {initials}
    </span>
  );
}
