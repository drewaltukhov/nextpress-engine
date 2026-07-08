"use client";

import { usePathname } from "next/navigation";

const SEGMENT_LABELS: Record<string, string> = {
  posts: "Posts",
  pages: "Pages",
  history: "History",
  edit: "Edit",
  settings: "Settings",
  users: "Users",
  themes: "Themes",
  plugins: "Plugins",
  media: "Media",
  "api-tokens": "API Tokens",
  seo: "SEO",
  builder: "Builder",
  new: "New",
};

function isNumericId(seg: string): boolean {
  return /^\d+$/.test(seg);
}

export function AdminBreadcrumbBar() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  const items: { label: string; href: string }[] = [
    { label: "Home", href: "/admin" },
  ];

  let path = "";
  for (const seg of segments) {
    path += "/" + seg;
    if (seg === "admin") continue;
    if (isNumericId(seg)) continue;
    const label =
      SEGMENT_LABELS[seg] ??
      seg.charAt(0).toUpperCase() + seg.slice(1).replace(/-/g, " ");
    items.push({ label, href: path });
  }

  const Chevron = () => (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="text-slate-300 shrink-0"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );

  return (
    <div className="px-6 py-3 flex items-center gap-2 text-sm text-slate-500">
      {items.map((item, i) => (
        <span key={item.href} className="flex items-center gap-2">
          {i > 0 && <Chevron />}
          {i === items.length - 1 ? (
            <span className="text-brand-navy font-medium">{item.label}</span>
          ) : (
            <a href={item.href} className="hover:text-brand-navy transition">
              {item.label}
            </a>
          )}
        </span>
      ))}
    </div>
  );
}
