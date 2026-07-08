"use client";

import { useEffect, useState, useTransition } from "react";
import { ExternalLink, FileText, Network, Newspaper } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listInboundLinks } from "@core/links/inbound";
import type { InboundLink, InboundLinkGroup } from "@core/links/inbound-utils";

function publicUrlForSource(source: InboundLink["source"]): string {
  if (source.kind === "post" && source.postKind === "spike" && source.parentSlug) {
    return `/${source.parentSlug}/${source.slug}`;
  }
  return `/${source.slug}`;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: { kind: "page" | "post"; id: number; title: string } | null;
}

export function BacklinksDialog({ open, onOpenChange, target }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] sm:h-[750px] max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="size-4 text-slate-500" />
            Backlinks {target ? `to "${target.title}"` : ""}
          </DialogTitle>
          <DialogDescription>
            Every published post or page that links to this resource via prose link or CTA.
          </DialogDescription>
        </DialogHeader>
        {open && target ? (
          <BacklinksBody key={`${target.kind}-${target.id}`} target={target} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function BacklinksBody({
  target,
}: {
  target: { kind: "page" | "post"; id: number; title: string };
}) {
  const [groups, setGroups] = useState<InboundLinkGroup[] | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      const result = await listInboundLinks({ kind: target.kind, id: target.id });
      setGroups(result);
    });
  }, [target.kind, target.id]);

  if (pending || groups == null) {
    return (
      <p className="flex-1 px-1 py-6 text-sm text-slate-500">Loading backlinks…</p>
    );
  }

  const totalLinks = groups.reduce((sum, g) => sum + g.links.length, 0);
  const pillarCount = groups.filter((g) => g.key.startsWith("pillar-")).length;

  if (totalLinks === 0) {
    return (
      <p className="flex-1 px-1 py-6 text-sm text-slate-500">
        No published posts or pages link here yet.
      </p>
    );
  }

  return (
    <div className="grid flex-1 min-h-0 grid-cols-3 gap-4">
      <aside className="col-span-1 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
        <div className="text-xs uppercase tracking-wide text-slate-500">Target</div>
        <div className="mt-1 truncate font-semibold text-slate-900">{target.title}</div>
        <div className="mt-3 text-xs text-slate-500">
          {totalLinks} inbound link{totalLinks === 1 ? "" : "s"}
        </div>
        <div className="text-xs text-slate-500">
          across {pillarCount} pillar{pillarCount === 1 ? "" : "s"}
        </div>
      </aside>
      <div className="col-span-2 min-h-0 space-y-4 overflow-y-auto">
        {groups.map((g) => (
          <section key={g.key}>
            <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-600">
              {g.label}{" "}
              <span className="text-slate-400">({g.links.length})</span>
            </h3>
            <ul
              className={`divide-y divide-white/60 rounded-lg border border-slate-200 ${g.bgClass}`}
            >
              {g.links.map((link) => {
                const href = publicUrlForSource(link.source);
                return (
                  <li key={`${link.source.kind}-${link.source.id}`}>
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex items-start gap-2 px-3 py-2 hover:bg-white/50 transition-colors"
                    >
                      {link.source.kind === "page" ? (
                        <FileText className="mt-0.5 size-4 shrink-0 text-slate-500" />
                      ) : (
                        <Newspaper className="mt-0.5 size-4 shrink-0 text-slate-500" />
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1 truncate text-sm font-medium text-slate-900 group-hover:text-brand-green transition-colors">
                          <span className="truncate">{link.source.title}</span>
                          <ExternalLink className="size-3 shrink-0 opacity-0 group-hover:opacity-60 transition-opacity" />
                        </div>
                        <div className="truncate text-xs text-slate-500">
                          {href}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {link.hits.map((h) => (
                          <span
                            key={h.kind}
                            className="rounded border border-slate-200 bg-white/80 px-1.5 py-0.5 text-[10px] font-medium uppercase text-slate-600"
                          >
                            {h.kind}
                          </span>
                        ))}
                      </div>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
