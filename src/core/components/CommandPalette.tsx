"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  FileText,
  Newspaper,
  User as UserIcon,
  Tag,
  Image as ImageIcon,
  Plus,
  Sparkles,
  CornerDownLeft,
  ArrowUp,
  ArrowDown,
  X,
} from "lucide-react";
import {
  searchAdmin,
  getCommandPaletteSeed,
  type CommandHit,
  type CommandHitKind,
  type QuickAction,
} from "@/app/admin/(shell)/_command/actions";

// ---------------------------------------------------------------------------
// Context — shared open state so the topbar trigger can flip it without
// drilling props through every layer of the admin shell.
// ---------------------------------------------------------------------------

interface CommandPaletteContextValue {
  open: boolean;
  openPalette: () => void;
  closePalette: () => void;
}

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    throw new Error("useCommandPalette must be used inside <CommandPaletteProvider>");
  }
  return ctx;
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  const openPalette = useCallback(() => setOpen(true), []);
  const closePalette = useCallback(() => setOpen(false), []);

  // Cmd+K / Ctrl+K opens the palette from anywhere inside the admin shell.
  // Bound at the provider level so we don't need to mount a global listener
  // per-page. Filters out keystrokes from inside form fields when the user
  // is mid-edit and just happens to hit ⌘K — there isn't really a reason to
  // *not* open in that case (this is a global shortcut), but we let
  // contenteditable/textarea/input keep the keystroke if they would
  // otherwise consume it via preventDefault upstream. In practice
  // ⌘K isn't bound to anything browser-native, so this is purely belt+
  // suspenders.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const isToggle =
        (e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K");
      if (!isToggle) return;
      e.preventDefault();
      setOpen((v) => !v);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const value = useMemo(
    () => ({ open, openPalette, closePalette }),
    [open, openPalette, closePalette],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      <CommandPalette />
    </CommandPaletteContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Visual constants — one source of truth for per-resource styling so the
// chip on the icon and the badge color always agree.
// ---------------------------------------------------------------------------

const KIND_VISUALS: Record<
  CommandHitKind,
  { Icon: typeof FileText; chipClass: string; label: string }
> = {
  post: {
    Icon: Newspaper,
    chipClass: "bg-indigo-50 text-indigo-600 ring-1 ring-indigo-100",
    label: "Post",
  },
  page: {
    Icon: FileText,
    chipClass: "bg-sky-50 text-sky-600 ring-1 ring-sky-100",
    label: "Page",
  },
  user: {
    Icon: UserIcon,
    chipClass: "bg-violet-50 text-violet-600 ring-1 ring-violet-100",
    label: "User",
  },
  topic: {
    Icon: Tag,
    chipClass: "bg-amber-50 text-amber-600 ring-1 ring-amber-100",
    label: "Topic",
  },
  media: {
    Icon: ImageIcon,
    chipClass: "bg-pink-50 text-pink-600 ring-1 ring-pink-100",
    label: "Media",
  },
};

const SECTION_ORDER: CommandHitKind[] = ["post", "page", "user", "topic", "media"];

const SECTION_TITLE: Record<CommandHitKind, string> = {
  post: "Posts",
  page: "Pages",
  user: "Users",
  topic: "Topics",
  media: "Media",
};

// ---------------------------------------------------------------------------
// The palette
// ---------------------------------------------------------------------------

type Selectable =
  | { type: "hit"; data: CommandHit }
  | { type: "action"; data: QuickAction };

interface SeedPayload {
  recents: CommandHit[];
  quickActions: QuickAction[];
}

interface SearchPayload {
  hits: CommandHit[];
  truncated: boolean;
}

function CommandPalette() {
  const { open, closePalette } = useCommandPalette();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // State is split intentionally so each effect only owns the slice it
  // updates — keeps the React 19 set-state-in-effect rule happy without
  // forcing eslint-disable comments.
  const [query, setQuery] = useState("");
  const [seed, setSeed] = useState<SeedPayload>({ recents: [], quickActions: [] });
  const [search, setSearch] = useState<SearchPayload>({ hits: [], truncated: false });
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Reset transient state when the palette opens. prev-value-in-render
  // pattern (memo'd via React 19's `<https://react.dev/learn/you-might-not-need-an-effect#resetting-all-state-when-a-prop-changes>`)
  // — the `open` flag flipping to true is the trigger; capturing the prior
  // value lets us reset query/search/selection without an effect.
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setQuery("");
      setSearch({ hits: [], truncated: false });
      setSelectedIndex(0);
      setLoading(true);
    }
  }

  // Capture the previously-focused element + load seed when the palette
  // opens. Both side effects belong here (ref writes can't happen during
  // render, and the seed fetch is async).
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    let cancelled = false;
    void getCommandPaletteSeed().then((next) => {
      if (cancelled) return;
      setSeed(next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Restore focus to whatever was focused before the palette opened. The
  // browser drops focus onto <body> when our modal unmounts, which makes
  // re-opening with the same shortcut feel laggy (the next ⌘K is read by
  // body, not the prior caller). Focus restore makes ⌘K → close → ⌘K
  // round-trips feel snappy.
  useEffect(() => {
    if (open) return;
    const target = restoreFocusRef.current;
    if (target && typeof target.focus === "function") {
      target.focus();
    }
    restoreFocusRef.current = null;
  }, [open]);

  // Auto-focus the input on open. The animation target unmount/mount toggles
  // the input ref, so set it on the next paint.
  useEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  // Debounced search. The setState calls live inside the setTimeout callback
  // (an external system, per the React 19 rule's docs) so they're outside
  // the synchronous effect body.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q) return;

    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const result = await searchAdmin(q);
      if (cancelled) return;
      setSearch({ hits: result.hits, truncated: result.truncated });
      setLoading(false);
      setSelectedIndex(0);
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [open, query]);

  // Loading flag flips on synchronously when the user types. prev-value
  // pattern again so we don't need a setState-inside-effect.
  const [prevQuery, setPrevQuery] = useState(query);
  if (prevQuery !== query) {
    setPrevQuery(query);
    if (query.trim().length > 0) setLoading(true);
    else setLoading(false);
  }

  // Compute the flat-selectable list once per render. Two distinct shapes:
  //   - Empty query: recents (kind=hit) + quick actions (kind=action)
  //   - With query: hits grouped by kind, flattened in section order
  // The flat list drives keyboard navigation; sections are rendered by
  // walking the list and emitting headers as the kind changes.
  const trimmedQuery = query.trim();
  const selectable: Selectable[] = useMemo(() => {
    if (!trimmedQuery) {
      const out: Selectable[] = [];
      for (const r of seed.recents) out.push({ type: "hit", data: r });
      for (const a of seed.quickActions) out.push({ type: "action", data: a });
      return out;
    }
    const out: Selectable[] = [];
    for (const kind of SECTION_ORDER) {
      for (const h of search.hits) {
        if (h.kind === kind) out.push({ type: "hit", data: h });
      }
    }
    return out;
  }, [trimmedQuery, seed.recents, seed.quickActions, search.hits]);

  // Clamp selected index to the available range whenever the list shape
  // changes — keeps the highlight valid as the user types. prev-value-in-
  // render pattern, no useEffect.
  const [prevLen, setPrevLen] = useState(selectable.length);
  if (prevLen !== selectable.length) {
    setPrevLen(selectable.length);
    if (selectable.length === 0) {
      if (selectedIndex !== 0) setSelectedIndex(0);
    } else if (selectedIndex >= selectable.length) {
      setSelectedIndex(selectable.length - 1);
    }
  }

  // Scroll the highlighted row into view as the user navigates.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-cmd-index="${selectedIndex}"]`,
    );
    if (el) {
      el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex, selectable]);

  function activate(i: number) {
    const item = selectable[i];
    if (!item) return;
    closePalette();
    router.push(item.data.href);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      closePalette();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(selectable.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      activate(selectedIndex);
      return;
    }
  }

  if (!open) return null;

  const showingSeed = trimmedQuery.length === 0;
  const hasContent = selectable.length > 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search admin"
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh] sm:pt-[18vh]"
    >
      {/* Backdrop — separate element so clicks bubble correctly. The blur
          + dim is what gives the modal its feeling of focus. */}
      <div
        onClick={closePalette}
        className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm animate-[fadeIn_120ms_ease-out]"
        aria-hidden
      />

      {/* Card */}
      <div
        className="relative w-full max-w-2xl rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 overflow-hidden flex flex-col max-h-[70vh] animate-[paletteIn_140ms_ease-out]"
      >
        {/* Header / input */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-slate-100">
          <Search className="size-5 text-slate-400 shrink-0" strokeWidth={2} />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search posts, pages, users, topics, media…"
            className="flex-1 h-full bg-transparent outline-none text-base text-slate-900 placeholder:text-slate-400"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            onClick={closePalette}
            className="inline-flex items-center justify-center size-7 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Body */}
        <div ref={listRef} className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {loading && !hasContent && <PaletteSkeleton />}

          {!loading && !hasContent && showingSeed && <EmptySeed />}

          {!loading && !hasContent && !showingSeed && <NoResults query={query} />}

          {hasContent && showingSeed && (
            <SeedSections
              recents={seed.recents}
              quickActions={seed.quickActions}
              selectedIndex={selectedIndex}
              onActivate={activate}
              onHover={setSelectedIndex}
            />
          )}

          {hasContent && !showingSeed && (
            <ResultSections
              hits={search.hits}
              selectedIndex={selectedIndex}
              onActivate={activate}
              onHover={setSelectedIndex}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 h-10 text-[11px] text-slate-500 border-t border-slate-100 bg-slate-50/60">
          <div className="flex items-center gap-3">
            <KbdHint icon={<ArrowUp className="size-3" />} label="↑" />
            <KbdHint icon={<ArrowDown className="size-3" />} label="↓" />
            <span>Navigate</span>
            <KbdHint icon={<CornerDownLeft className="size-3" />} label="↵" className="ml-2" />
            <span>Open</span>
            <span className="ml-2 inline-flex items-center gap-1 font-mono text-[10px] px-1.5 py-0.5 rounded border border-slate-200 bg-white">
              esc
            </span>
            <span>Close</span>
          </div>
          {search.truncated && trimmedQuery.length > 0 && (
            <span className="text-slate-400">More results — refine your search</span>
          )}
        </div>
      </div>

      {/* Inline keyframes — keeps the animation self-contained without
          touching the project's tailwind config. */}
      <style jsx global>{`
        @keyframes paletteIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function KbdHint({
  icon,
  label,
  className = "",
}: {
  icon: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center justify-center size-5 font-mono text-[10px] rounded border border-slate-200 bg-white ${className}`}
      aria-label={label}
    >
      {icon}
    </span>
  );
}

function PaletteSkeleton() {
  return (
    <div className="px-3 py-2 space-y-1.5 animate-pulse">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-2 rounded-lg">
          <div className="size-9 rounded-lg bg-slate-100 shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-1/3 bg-slate-100 rounded" />
            <div className="h-2 w-1/2 bg-slate-100 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptySeed() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="size-12 rounded-full bg-brand-light-green/40 text-brand-navy inline-flex items-center justify-center mb-3">
        <Sparkles className="size-5" strokeWidth={2} />
      </div>
      <p className="text-sm font-medium text-slate-900">Start typing to search</p>
      <p className="text-xs text-slate-500 mt-1 max-w-xs">
        Find posts, pages, users, topics and media. Or pick a quick action.
      </p>
    </div>
  );
}

function NoResults({ query }: { query: string }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-6">
      <div className="size-12 rounded-full bg-slate-100 text-slate-400 inline-flex items-center justify-center mb-3">
        <Search className="size-5" />
      </div>
      <p className="text-sm font-medium text-slate-900">
        No results for &ldquo;{query}&rdquo;
      </p>
      <p className="text-xs text-slate-500 mt-1">
        Try a different keyword, or check spelling.
      </p>
    </div>
  );
}

function SectionHeader({ children }: { children: ReactNode }) {
  return (
    <div className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
      {children}
    </div>
  );
}

interface RowProps {
  index: number;
  selected: boolean;
  onActivate: (i: number) => void;
  onHover: (i: number) => void;
  hit?: CommandHit;
  action?: QuickAction;
}

function Row({ index, selected, onActivate, onHover, hit, action }: RowProps) {
  const kind = (hit?.kind ?? action?.kind) as CommandHitKind;
  const visuals = KIND_VISUALS[kind];
  const Icon = visuals.Icon;

  const title = hit?.title ?? action?.label ?? "";
  const subtitle = hit?.subtitle ?? action?.description ?? null;
  const badge = hit?.badge ?? null;

  return (
    <button
      type="button"
      data-cmd-index={index}
      onClick={() => onActivate(index)}
      onMouseEnter={() => onHover(index)}
      className={`w-full min-w-0 flex items-center gap-3 px-3 py-2 mx-1 rounded-lg text-left transition-colors ${
        selected ? "bg-slate-100" : "hover:bg-slate-50"
      }`}
    >
      <span
        className={`inline-flex size-9 items-center justify-center rounded-lg shrink-0 ${visuals.chipClass}`}
      >
        {action ? <Plus className="size-4" strokeWidth={2.5} /> : <Icon className="size-4" />}
      </span>
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-medium text-slate-900 truncate">{title}</span>
        {subtitle && (
          <span className="block text-xs text-slate-500 truncate font-mono">{subtitle}</span>
        )}
      </span>
      {badge && (
        <span className="text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 shrink-0">
          {badge}
        </span>
      )}
      {selected && (
        <CornerDownLeft className="size-4 text-slate-400 shrink-0" strokeWidth={2} />
      )}
    </button>
  );
}

interface SeedProps {
  recents: CommandHit[];
  quickActions: QuickAction[];
  selectedIndex: number;
  onActivate: (i: number) => void;
  onHover: (i: number) => void;
}

function SeedSections({
  recents,
  quickActions,
  selectedIndex,
  onActivate,
  onHover,
}: SeedProps) {
  let cursor = 0;
  return (
    <div className="py-1">
      {recents.length > 0 && (
        <>
          <SectionHeader>Recent</SectionHeader>
          {recents.map((hit) => {
            const i = cursor++;
            return (
              <Row
                key={`r-${hit.kind}-${hit.id}`}
                index={i}
                selected={i === selectedIndex}
                onActivate={onActivate}
                onHover={onHover}
                hit={hit}
              />
            );
          })}
        </>
      )}

      {quickActions.length > 0 && (
        <>
          <SectionHeader>Create new</SectionHeader>
          {quickActions.map((a) => {
            const i = cursor++;
            return (
              <Row
                key={`a-${a.kind}-${a.label}`}
                index={i}
                selected={i === selectedIndex}
                onActivate={onActivate}
                onHover={onHover}
                action={a}
              />
            );
          })}
        </>
      )}
    </div>
  );
}

interface ResultsProps {
  hits: CommandHit[];
  selectedIndex: number;
  onActivate: (i: number) => void;
  onHover: (i: number) => void;
}

function ResultSections({ hits, selectedIndex, onActivate, onHover }: ResultsProps) {
  let cursor = 0;
  return (
    <div className="py-1">
      {SECTION_ORDER.map((kind) => {
        const sectionHits = hits.filter((h) => h.kind === kind);
        if (sectionHits.length === 0) return null;
        return (
          <div key={kind}>
            <SectionHeader>{SECTION_TITLE[kind]}</SectionHeader>
            {sectionHits.map((hit) => {
              const i = cursor++;
              return (
                <Row
                  key={`${kind}-${hit.id}`}
                  index={i}
                  selected={i === selectedIndex}
                  onActivate={onActivate}
                  onHover={onHover}
                  hit={hit}
                />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
