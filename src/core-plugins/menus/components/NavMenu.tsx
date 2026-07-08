import type { ReactNode } from "react";
import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import type { MenuItemDetail, MenuStyle } from "@core-plugins/menus";
import { BuilderCard } from "@core/blocks/BuilderCard";
import { MenuLocationPickerInput } from "./MenuLocationPickerInput";

export type NavMenuOrientation = "horizontal" | "vertical";
export type NavMenuAlign = "left" | "center" | "right";
export type NavMenuMobileMode = "inline" | "drawer" | "hidden";
export type NavMenuBreakpoint = "sm" | "md" | "lg";

export type NavMenuProps = {
  /** Match this against `menus.location` at render time. The public renderer
   *  pre-fetches one menu per unique location used on the page and stuffs
   *  it into puck.metadata.menus[location]. */
  location: string;
  orientation: NavMenuOrientation;
  /** Horizontal: justification along the main axis. Vertical: alignment
   *  of items along the cross axis. Defaults to "left" so existing saved
   *  rows without this prop preserve current behavior. */
  align: NavMenuAlign;
  /** What to render below the mobile breakpoint:
   *   - `"inline"` (default) — the regular nav, just wrapped onto multiple
   *     lines. Preserves current behavior for already-saved menus.
   *   - `"drawer"` — replace the inline nav with a hamburger button that
   *     opens a slide-down popover panel listing every item vertically.
   *     Mega panels collapse to plain children; the browser's native
   *     Popover API handles open/close (no client JS).
   *   - `"hidden"` — drop the nav from mobile entirely. */
  mobileMode?: NavMenuMobileMode;
  /** Tailwind breakpoint at which the mobile treatment switches off.
   *  `"md"` (768px) is the default and matches the rest of the chrome
   *  widgets' fold. */
  mobileBreakpoint?: NavMenuBreakpoint;
  /** Auto-injected by Puck — used to mint a per-instance popover id when
   *  `mobileMode === "drawer"` so multiple NavMenu instances on one page
   *  don't share a popover target. */
  id?: string;
};

/** Desktop nav visibility class per chosen breakpoint. Full literal
 *  strings so the Tailwind JIT scanner picks them up. */
const BREAKPOINT_DESKTOP_VISIBLE: Record<NavMenuBreakpoint, string> = {
  sm: "hidden sm:flex",
  md: "hidden md:flex",
  lg: "hidden lg:flex",
};
/** Mobile hamburger trigger visibility per chosen breakpoint. */
const BREAKPOINT_MOBILE_VISIBLE: Record<NavMenuBreakpoint, string> = {
  sm: "flex sm:hidden",
  md: "flex md:hidden",
  lg: "flex lg:hidden",
};

interface MegaPanelEntry {
  node: ReactNode;
  /** 'full' = panel spans 100vw under the nav. 'container' = aligned to
   *  the theme container (same edges as the nav itself). */
  widthMode: "full" | "container";
}

interface PuckMetadataShape {
  menus?: Record<
    string,
    { items: MenuItemDetail[]; style?: MenuStyle } | null | undefined
  >;
  /** Pre-rendered mega panels keyed by location → menu_item_id. Populated
   *  by `prefetchPanelsForMenuLocations` in the mega-menu plugin via the
   *  themes/render.tsx metadata pass. Absent when the mega-menu plugin
   *  is disabled or no panels exist for the rendered menus. */
  megaPanels?: Record<string, Record<number, MegaPanelEntry> | undefined>;
  /** Theme container width — class string (Tailwind preset or empty for
   *  fluid/custom) and optional inline maxWidth (custom mode). Mega
   *  panels in "container" widthMode use this so they match the page
   *  body width instead of hardcoding a preset. */
  themeContainer?: { className: string; maxWidth?: string };
}

export const NavMenu: ComponentConfig<NavMenuProps> = {
  label: "Nav Menu",
  fields: {
    location: {
      type: "custom",
      label: "Menu",
      render: ({ value, onChange }) => (
        <MenuLocationPickerInput
          value={typeof value === "string" ? value : ""}
          onChange={onChange}
        />
      ),
    },
    orientation: {
      type: "radio",
      label: "Orientation",
      options: [
        { label: "Horizontal", value: "horizontal" },
        { label: "Vertical", value: "vertical" },
      ],
    },
    align: {
      type: "radio",
      label: "Alignment",
      options: [
        { label: "Left", value: "left" },
        { label: "Center", value: "center" },
        { label: "Right", value: "right" },
      ],
    },
    mobileMode: {
      type: "select",
      label: "Mobile mode",
      options: [
        { label: "Inline (wraps)", value: "inline" },
        { label: "Drawer (hamburger)", value: "drawer" },
        { label: "Hidden", value: "hidden" },
      ],
    },
    mobileBreakpoint: {
      type: "select",
      label: "Mobile breakpoint",
      options: [
        { label: "Small — <640px", value: "sm" },
        { label: "Medium — <768px (default)", value: "md" },
        { label: "Large — <1024px", value: "lg" },
      ],
    },
  },
  defaultProps: {
    location: "primary",
    orientation: "horizontal",
    align: "left",
    mobileMode: "inline",
    mobileBreakpoint: "md",
  },
  render: ({ location, orientation, align, mobileMode, mobileBreakpoint, id, puck }) => {
    if (puck?.isEditing) {
      return <BuilderCard name="NavMenu" title="Nav Menu" description="Renders the menu items for the chosen location." />;
    }

    if (!location || location.trim().length === 0) {
      return <></>;
    }

    const metadata = (puck?.metadata ?? {}) as PuckMetadataShape;
    const menu = metadata.menus?.[location];
    const style: MenuStyle = menu?.style ?? "dropdowns";
    // "dropdowns" mode opts out of mega panels even if some are saved —
    // lets the editor toggle off mega without deleting per-item panel
    // data. "top-level-only" also skips them since there are no
    // child-bearing items to attach to.
    const megaPanels =
      style === "mega" ? metadata.megaPanels?.[location] ?? {} : {};
    const themeContainer = metadata.themeContainer ?? null;

    if (!menu) {
      return <></>;
    }

    const fullTree = buildTree(menu.items);
    // "top-level-only" mode: drop every node's children so neither the
    // dropdown chevron nor the submenu panel render. Mega panels are
    // already filtered above (megaPanels = {}). Roots stay as-is.
    const tree =
      style === "top-level-only"
        ? fullTree.map((n) => ({ ...n, children: [] }))
        : fullTree;
    if (tree.length === 0) {
      return <></>;
    }

    const safeAlign: NavMenuAlign = align ?? "left";
    const safeMobileMode: NavMenuMobileMode = mobileMode ?? "inline";
    const safeBreakpoint: NavMenuBreakpoint = mobileBreakpoint ?? "md";

    // Vertical orientation is uncommon for mobile-mode-driven headers
    // (sidebars/footers stay vertical). Skip the desktop/mobile split
    // when vertical — render as before.
    if (orientation === "vertical") {
      const itemsAlign =
        safeAlign === "center"
          ? "items-center"
          : safeAlign === "right"
            ? "items-end"
            : "items-start";
      return (
        <nav className={`not-prose flex flex-col ${itemsAlign}`} aria-label={`Menu (${location})`}>
          <VerticalList items={tree} depth={0} />
        </nav>
      );
    }

    const justify =
      safeAlign === "center"
        ? "justify-center"
        : safeAlign === "right"
          ? "justify-end"
          : "justify-start";

    // The "inline" mobile mode preserves the original render output
    // exactly — no responsive wrapping, no drawer DOM. Lets already-
    // saved menus render byte-for-byte the same after the upgrade.
    //
    // No `relative` on the <nav> — the mega-menu panel needs to skip
    // this element and use the outer <header> (added by the theme
    // renderer) as its positioning ancestor so it centers on the
    // viewport instead of inheriting any off-center column offset.
    if (safeMobileMode === "inline") {
      return (
        <nav className={`not-prose flex w-full ${justify}`} aria-label={`Menu (${location})`}>
          <ul className="flex flex-row flex-wrap items-center gap-1">
            {tree.map((item) => (
              <TopLevelItem key={item.id} item={item} megaPanel={megaPanels[item.id] ?? null} themeContainer={themeContainer} />
            ))}
          </ul>
        </nav>
      );
    }

    // Mobile-aware modes — wrap desktop nav with a breakpoint visibility
    // class. The desktop nav matches the inline branch except for the
    // outer visibility wrapper. Same `relative`-omitted shape for the
    // same reason.
    const desktopVisible = BREAKPOINT_DESKTOP_VISIBLE[safeBreakpoint];
    const desktopNav = (
      <nav
        className={`not-prose w-full ${desktopVisible} ${justify}`}
        aria-label={`Menu (${location})`}
      >
        <ul className="flex flex-row flex-wrap items-center gap-1">
          {tree.map((item) => (
            <TopLevelItem key={item.id} item={item} megaPanel={megaPanels[item.id] ?? null} themeContainer={themeContainer} />
          ))}
        </ul>
      </nav>
    );

    if (safeMobileMode === "hidden") {
      return desktopNav;
    }

    // Drawer mode — hamburger button + native-popover panel for mobile.
    // Browser handles open/close/Esc/click-outside; no client JS. Mega
    // panels collapse to their children rendered as plain links so the
    // drawer doesn't try to ship 100vw mega chrome inside a narrow
    // viewport.
    const mobileVisible = BREAKPOINT_MOBILE_VISIBLE[safeBreakpoint];
    const popoverId = `np-nav-drawer-${id ?? location ?? "default"}`;
    const mobileJustify =
      safeAlign === "center"
        ? "justify-center"
        : safeAlign === "right"
          ? "justify-end"
          : "justify-start";
    return (
      <>
        {desktopNav}
        <div className={`not-prose w-full ${mobileVisible} ${mobileJustify}`}>
          <button
            type="button"
            popoverTarget={popoverId}
            aria-label={`Open menu (${location})`}
            title="Menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-700 transition hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-brand-green/30"
          >
            <HamburgerIcon className="size-5" />
          </button>
          <div
            id={popoverId}
            popover="auto"
            // Left-edge slide-in drawer. The native Popover API drives
            // open / close / Esc / backdrop-dismiss with no client JS.
            // The UA stylesheet centres `[popover]` via `margin:auto;
            // inset:0`, so `m-0` + the explicit `inset-y-0 left-0
            // right-auto` pin the panel flush to the left edge at full
            // height. `@starting-style` + `transition-discrete` (the
            // `starting:` / `transition-discrete` utilities) animate the
            // slide in pure CSS; browsers without that support just show
            // the panel anchored — no slide, still a drawer.
            //
            // IMPORTANT: no `display` utility on the popover element
            // itself. The UA hides a closed popover with `display:none`;
            // an author `display:flex` would override it (author origin
            // beats UA), leaving the off-screen panel rendered so its
            // shadow bleeds onto the screen. The flex layout lives on the
            // inner wrapper instead.
            className="np-nav-drawer not-prose fixed inset-y-0 left-0 right-auto m-0 h-auto w-[min(320px,85vw)] -translate-x-full overflow-hidden border-r border-slate-200 bg-white shadow-2xl transition-all transition-discrete duration-200 ease-out [&:popover-open]:translate-x-0 starting:[&:popover-open]:-translate-x-full [&::backdrop]:bg-black/40"
            aria-label={`Menu (${location})`}
          >
            <div className="flex h-full flex-col">
              <div className="flex shrink-0 items-center justify-between border-b border-slate-100 px-4 py-3">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Menu
                </span>
                <button
                  type="button"
                  popoverTarget={popoverId}
                  popoverTargetAction="hide"
                  aria-label="Close menu"
                  title="Close"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-green/30"
                >
                  <CloseIcon className="size-5" />
                </button>
              </div>
              <nav className="flex-1 overflow-y-auto p-4" aria-label={`Menu (${location}, mobile)`}>
                <DrawerList items={tree} megaPanels={megaPanels} />
              </nav>
            </div>
          </div>
        </div>
      </>
    );
  },
};

function HamburgerIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6h16" />
      <path d="M4 12h16" />
      <path d="M4 18h16" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 6l12 12" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

interface TreeNode extends MenuItemDetail {
  children: TreeNode[];
}

function buildTree(flat: MenuItemDetail[]): TreeNode[] {
  const byId = new Map<number, TreeNode>();
  const roots: TreeNode[] = [];
  for (const item of flat) {
    byId.set(item.id, { ...item, children: [] });
  }
  for (const item of flat) {
    const node = byId.get(item.id);
    if (!node) continue;
    if (item.parentId != null && byId.has(item.parentId)) {
      byId.get(item.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

const TOP_LEVEL_LINK =
  "inline-flex items-center gap-1 rounded-md px-3 py-2 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

const SUBMENU_PANEL =
  "absolute z-50 min-w-[12rem] rounded-md border border-neutral-200 bg-white p-1 shadow-lg invisible opacity-0 translate-y-1 transition-[opacity,transform,visibility] duration-150";

const SUBMENU_LINK =
  "flex w-full items-center justify-between gap-2 rounded-sm px-3 py-1.5 text-sm text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:bg-muted focus-visible:text-foreground focus-visible:outline-none";

function ChevronDownIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 7.5l5 5 5-5" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.5 5l5 5-5 5" />
    </svg>
  );
}

function TopLevelItem({
  item,
  megaPanel,
  themeContainer,
}: {
  item: TreeNode;
  megaPanel: MegaPanelEntry | null;
  themeContainer: { className: string; maxWidth?: string } | null;
}) {
  const hasChildren = item.children.length > 0;
  const extra = item.cssClasses ? ` ${item.cssClasses}` : "";

  // Mega panel takes precedence over the existing dropdown. Pure-CSS
  // show/hide via group-hover + group-focus-within — same pattern the
  // existing submenu dropdown below uses. No client component is
  // imported because importing a "use client" wrapper into NavMenu's
  // server-side Puck render fn destabilises the React-server / SSR
  // boundary inside Puck's <Render> walk (same trap as the gallery
  // collector duplication in themes/render.tsx). Click-outside / Escape
  // close are deferred to v1.x via a page-level Mounter.
  if (megaPanel) {
    const isFull = megaPanel.widthMode === "full";
    // <li> is `static` (not relative): the absolutely-positioned panel
    // skips this <li> AND its <nav> ancestor (also static now) and
    // uses the outer <header> element — which the theme renderer sets
    // to `position: relative`. The header is `mx-auto` (centered on the
    // viewport via the theme container), so `left:50% / -translate-x-1/2
    // / width:100vw` lands symmetrically around the header's center,
    // which equals viewport center, so the panel covers the viewport
    // edge-to-edge regardless of which column the trigger lives in.
    // The existing submenu pattern below keeps `position: relative` on
    // its own <li> because its dropdown is small + item-anchored.
    //
    // No `hidden lg:block` — visibility follows the parent <nav>'s
    // breakpoint (`hidden md:flex` etc.), so mega items appear whenever
    // the desktop nav is shown. Previously hardcoded to `lg` created a
    // dead zone between `md` and `lg` where the desktop nav was visible
    // but every mega trigger silently disappeared.
    return (
      <li className="group/mega">
        <a
          href={item.url}
          target={item.target}
          rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
          aria-haspopup="menu"
          className={`${TOP_LEVEL_LINK} group-hover/mega:bg-muted group-hover/mega:text-foreground group-focus-within/mega:bg-muted${extra}`}
        >
          <span>{item.label}</span>
          <ChevronDownIcon className="size-3.5 opacity-70 transition-transform duration-150 group-hover/mega:rotate-180 group-focus-within/mega:rotate-180" />
        </a>
        <div
          role="region"
          aria-label={`${item.label} mega panel`}
          /* Vertical positioning: `top-full` resolves to the bottom of
             the positioned ancestor — now the <header> (set `relative`
             by the theme renderer) so the panel can center on viewport
             rather than inherit a column's horizontal offset. Header
             carries `py-4`, so `top-full` lands 1rem below the nav row
             (trigger bottom). `-mt-4` pulls the panel back up by that
             1rem so its bounding box starts at the trigger's bottom;
             `pt-4` then makes that same 1rem a transparent hoverable
             extension of the panel itself. Net effect: cursor leaving
             trigger lands directly inside the panel's hover region,
             no dead-zone bridge, and the visible content still sits
             1rem below the trigger (same visual as before). */
          className="invisible opacity-0 translate-y-1 group-hover/mega:visible group-hover/mega:opacity-100 group-hover/mega:translate-y-0 group-focus-within/mega:visible group-focus-within/mega:opacity-100 group-focus-within/mega:translate-y-0 absolute left-1/2 -translate-x-1/2 top-full -mt-4 pt-4 z-40 transition-[opacity,transform,visibility] duration-150"
          style={{ width: "100vw" }}
        >
          {isFull ? (
            <div className="bg-white border-y border-slate-200 shadow-lg">
              {/* Inner cap keeps content readable on ultra-wide viewports
                  (4K/ultrawide) — bg still spans 100vw, content lives at
                  max-w-screen-2xl with generous side padding. Below `lg`
                  (1024px) the cap and side padding collapse so the
                  content fills the full viewport edge-to-edge. */}
              <div className="mx-auto max-w-screen-2xl px-10 max-lg:max-w-none max-lg:px-4">{megaPanel.node}</div>
            </div>
          ) : (
            /* Card spans the SAME outer width as the theme header —
               the `max-w-…` preset / custom maxWidth / fluid setting
               comes from `themeContainer`, so the card edge aligns
               with the header element edge (not inset). Below `lg`
               (1024px) the rounded corners, side borders, and centered
               max-width collapse so the panel reads as a flush
               full-viewport band instead of a constrained card
               floating mid-screen. */
            <div
              className={`mx-auto w-full ${themeContainer?.className ?? "max-w-7xl"} rounded-xl bg-white border border-slate-200 shadow-lg overflow-hidden max-lg:max-w-none max-lg:rounded-none max-lg:border-x-0`}
              style={themeContainer?.maxWidth ? { maxWidth: themeContainer.maxWidth } : undefined}
            >
              <div className="px-6 max-lg:px-4">{megaPanel.node}</div>
            </div>
          )}
        </div>
      </li>
    );
  }

  if (!hasChildren) {
    return (
      <li>
        <a
          href={item.url}
          target={item.target}
          rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
          className={`${TOP_LEVEL_LINK}${extra}`}
        >
          {item.label}
        </a>
      </li>
    );
  }

  return (
    <li className="relative group/item">
      <a
        href={item.url}
        target={item.target}
        rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
        aria-haspopup="true"
        className={`${TOP_LEVEL_LINK} group-hover/item:bg-muted group-hover/item:text-foreground group-focus-within/item:bg-muted${extra}`}
      >
        <span>{item.label}</span>
        <ChevronDownIcon className="size-3.5 opacity-70 transition-transform duration-150 group-hover/item:rotate-180 group-focus-within/item:rotate-180" />
      </a>
      <ul
        role="menu"
        className={`${SUBMENU_PANEL} top-full left-0 mt-1 group-hover/item:visible group-hover/item:opacity-100 group-hover/item:translate-y-0 group-focus-within/item:visible group-focus-within/item:opacity-100 group-focus-within/item:translate-y-0`}
      >
        {item.children.map((child) => (
          <SubMenuItem key={child.id} item={child} />
        ))}
      </ul>
    </li>
  );
}

function SubMenuItem({ item }: { item: TreeNode }) {
  const hasChildren = item.children.length > 0;
  const extra = item.cssClasses ? ` ${item.cssClasses}` : "";

  if (!hasChildren) {
    return (
      <li role="none">
        <a
          href={item.url}
          target={item.target}
          rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
          role="menuitem"
          className={`${SUBMENU_LINK}${extra}`}
        >
          <span>{item.label}</span>
        </a>
      </li>
    );
  }

  return (
    <li role="none" className="relative group/sub">
      <a
        href={item.url}
        target={item.target}
        rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
        role="menuitem"
        aria-haspopup="true"
        className={`${SUBMENU_LINK} group-hover/sub:bg-muted group-hover/sub:text-foreground group-focus-within/sub:bg-muted${extra}`}
      >
        <span>{item.label}</span>
        <ChevronRightIcon className="size-3.5 opacity-70" />
      </a>
      <ul
        role="menu"
        className={`${SUBMENU_PANEL} top-0 left-full ml-1 group-hover/sub:visible group-hover/sub:opacity-100 group-hover/sub:translate-y-0 group-focus-within/sub:visible group-focus-within/sub:opacity-100 group-focus-within/sub:translate-y-0`}
      >
        {item.children.map((grandchild) => (
          <SubMenuItem key={grandchild.id} item={grandchild} />
        ))}
      </ul>
    </li>
  );
}

function VerticalList({
  items,
  depth,
  size = "sm",
}: {
  items: TreeNode[];
  depth: number;
  /** Link font size. `"sm"` (default) = `text-sm` for vertical-orientation
   *  NavMenus on sidebars / footers; `"base"` = `text-base` (1rem) so the
   *  drawer's nested children read at a comfortable mobile tap size. */
  size?: "sm" | "base";
}) {
  const textClass = size === "base" ? "text-base" : "text-sm";
  return (
    <ul className={`flex flex-col gap-0.5 ${depth > 0 ? "pl-4 mt-0.5" : ""}`}>
      {items.map((item) => {
        const extra = item.cssClasses ? ` ${item.cssClasses}` : "";
        return (
          <li key={item.id}>
            <a
              href={item.url}
              target={item.target}
              rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
              className={`inline-flex items-center rounded-md px-2 py-1 ${textClass} text-foreground/80 transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring${extra}`}
            >
              {item.label}
            </a>
            {item.children.length > 0 ? (
              <VerticalList items={item.children} depth={depth + 1} size={size} />
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

/** Mobile-drawer rendering of the menu tree. Top-level items are bold,
 *  accent-barred section rows. A root with child items (or a mega
 *  panel) becomes a native `<details>` disclosure — tap the row to
 *  expand / collapse, with zero client JS, the browser owning the open
 *  state — and a chevron that rotates on open. Childless roots stay
 *  plain links. Child branches reuse `VerticalList`.
 *
 *  Expandable roots toggle rather than navigate: the summary label is
 *  plain text, not a link, so the whole row is an easy expand target. */
function DrawerList({
  items,
  megaPanels,
}: {
  items: TreeNode[];
  megaPanels: Record<number, MegaPanelEntry | undefined>;
}) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => {
        const extra = item.cssClasses ? ` ${item.cssClasses}` : "";
        const panel = megaPanels[item.id];
        // Shared root-row look — bold label + brand-green accent bar —
        // so the plain link and the `<details>` summary read identically.
        const rowClass = `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[18px] font-semibold text-slate-800 transition-colors hover:bg-brand-green/10 hover:text-brand-green focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-green/30${extra}`;
        const accentBar = (
          <span aria-hidden className="h-4 w-1 shrink-0 rounded-full bg-brand-green" />
        );

        // The expandable payload — a mega panel, or the child sublist.
        const expandable = panel ? (
          // Negative horizontal margin lets the panel's `px-6` chrome
          // breathe past the drawer padding so it reads as a section.
          <div className="-mx-4 mt-1 mb-2 border-t border-slate-100 bg-slate-50/40">
            {panel.node}
          </div>
        ) : item.children.length > 0 ? (
          // Children sit under a hairline "branch" line; `depth={0}`
          // keeps VerticalList from adding padding atop this wrapper.
          <div className="mb-1 ml-4 mt-1 border-l border-slate-200 pl-2">
            <VerticalList items={item.children} depth={0} size="base" />
          </div>
        ) : null;

        if (!expandable) {
          // Leaf root — a plain link.
          return (
            <li key={item.id}>
              <a
                href={item.url}
                target={item.target}
                rel={item.target === "_blank" ? "noopener noreferrer" : undefined}
                className={rowClass}
              >
                {accentBar}
                {item.label}
              </a>
            </li>
          );
        }

        // Expandable root — native `<details>` disclosure. The summary
        // is `display:flex`, which also drops the default UA triangle.
        // The chevron rotates via the `details-open:` custom variant
        // (declared in globals.css) when the `<details>` is open.
        return (
          <li key={item.id}>
            <details>
              <summary
                className={`${rowClass} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
              >
                {accentBar}
                <span className="flex-1">{item.label}</span>
                <ChevronIcon className="size-4 shrink-0 text-slate-400 transition-transform duration-200 details-open:rotate-180" />
              </summary>
              {expandable}
            </details>
          </li>
        );
      })}
    </ul>
  );
}

export const NavMenuBlock: Omit<RegisteredBlock, "source"> = {
  name: "NavMenu",
  config: NavMenu,
  surfaces: ["header", "footer", "sidebar"],
  category: "Template",
};
