import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Metadata } from "next";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { getPost } from "@core-plugins/posts";
import { getRevisions, getRevision } from "@core/revisions/service";
import { restorePostRevisionAction } from "../../../revisions/actions";
import { ArrowLeft, Clock, MoveRight } from "lucide-react";
import { restoreBlockAction } from "../../../revisions/actions";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const post = await getPost(db(), Number(id));
  return { title: post ? `History — ${post.title}` : "History" };
}

// ── Types ──────────────────────────────────────────────────────────────────

type PuckBlock = {
  type: string;
  props: Record<string, unknown>;
};

// ── HTML helpers ───────────────────────────────────────────────────────────

function htmlToText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/p>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

// Split a RichText HTML string into block-level paragraph segments.
// Each <p>, <h1-h6>, <ul>, <ol>, <blockquote> becomes one diffable unit.
function splitHtmlSegments(html: string): string[] {
  const segs: string[] = [];
  const re = /<(p|h[1-6]|ul|ol|blockquote|pre)(\s[^>]*)?>[\s\S]*?<\/\1>/gi;
  let last = 0, m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const between = html.slice(last, m.index).trim();
    if (between) segs.push(between);
    segs.push(m[0]);
    last = m.index + m[0].length;
  }
  const tail = html.slice(last).trim();
  if (tail) segs.push(tail);
  return segs.filter(s => htmlToText(s).length > 0);
}

// ── Generic LCS ───────────────────────────────────────────────────────────

type DiffOp<T> = { kind: "keep" | "del" | "ins"; item: T };

function lcs<T>(a: T[], b: T[], key: (t: T) => string): DiffOp<T>[] {
  const aKeys = a.map(key);
  const bKeys = b.map(key);
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = aKeys[i - 1] === bKeys[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
  const ops: DiffOp<T>[] = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && aKeys[i - 1] === bKeys[j - 1] && dp[i][j] !== dp[i - 1][j]) {
      // Only consume the match if skipping a[i-1] would shorten the LCS.
      // When dp[i][j] === dp[i-1][j], the match is optional — we skip it
      // (prefer del) so that duplicate items are removed at their LATER
      // position, leaving the original (earlier) occurrence as "keep".
      ops.unshift({ kind: "keep", item: b[j - 1] }); i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      ops.unshift({ kind: "ins", item: b[j - 1] }); j--;
    } else {
      ops.unshift({ kind: "del", item: a[i - 1] }); i--;
    }
  }
  return ops;
}

// ── Block-level diff ───────────────────────────────────────────────────────

type BlockDiffRow =
  | { kind: "keep"; block: PuckBlock }
  | { kind: "del"; block: PuckBlock }
  | { kind: "ins"; block: PuckBlock }
  | { kind: "change"; del: PuckBlock; ins: PuckBlock };

function blockSig(block: PuckBlock): string {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { id: _id, ...rest } = block.props;
  const normalized = { ...rest };
  if (block.type === "RichText") {
    normalized.html = htmlToText(String(rest.html ?? rest.content ?? ""));
    delete normalized.content;
  }
  return JSON.stringify({ type: block.type, props: normalized });
}

function parseBlocks(contentJson: string): PuckBlock[] {
  try {
    const data = JSON.parse(contentJson);
    return (data?.content ?? []) as PuckBlock[];
  } catch { return []; }
}

function parseRoot(contentJson: string): unknown {
  try {
    return JSON.parse(contentJson)?.root ?? { props: {} };
  } catch { return { props: {} }; }
}

// Produces contentJson with the old version of a changed block restored.
function computeRevertedContent(
  diff: BlockDiffRow[],
  targetIndex: number,
  currentRoot: unknown,
): string {
  const newBlocks: PuckBlock[] = [];
  for (let i = 0; i < diff.length; i++) {
    const row = diff[i];
    if (row.kind === "keep") newBlocks.push(row.block);
    else if (row.kind === "ins") newBlocks.push(row.block);
    else if (row.kind === "change") newBlocks.push(i === targetIndex ? row.del : row.ins);
  }
  return JSON.stringify({ root: currentRoot, content: newBlocks });
}

// Produces contentJson with a deleted block reinserted at its original position.
function computeRestoredContent(
  diff: BlockDiffRow[],
  targetIndex: number,
  currentRoot: unknown,
): string {
  const newBlocks: PuckBlock[] = [];
  for (let i = 0; i < diff.length; i++) {
    const row = diff[i];
    if (i === targetIndex && row.kind === "del") {
      newBlocks.push(row.block);
    }
    if (row.kind === "keep") newBlocks.push(row.block);
    else if (row.kind === "ins") newBlocks.push(row.block);
    else if (row.kind === "change") newBlocks.push(row.ins);
  }
  return JSON.stringify({ root: currentRoot, content: newBlocks });
}

// Produces contentJson with a single paragraph within a changed RichText block restored.
// segs: paragraph-level diff for the block at blockIdx; segIdx: which paragraph to restore.
function computeSegRestoredContent(
  diff: BlockDiffRow[],
  blockIdx: number,
  segs: SegDiffRow[],
  segIdx: number,
  currentRoot: unknown,
): string {
  const htmlParts: string[] = [];
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i];
    if (seg.kind === "keep") htmlParts.push(seg.html);
    else if (seg.kind === "ins") htmlParts.push(seg.html);
    else if (seg.kind === "del") {
      if (i === segIdx) htmlParts.push(seg.html);
    } else {
      htmlParts.push(i === segIdx ? seg.del : seg.ins);
    }
  }
  const newHtml = htmlParts.join("");
  const newBlocks: PuckBlock[] = [];
  for (let i = 0; i < diff.length; i++) {
    const row = diff[i];
    if (row.kind === "keep") newBlocks.push(row.block);
    else if (row.kind === "ins") newBlocks.push(row.block);
    else if (row.kind === "change") {
      if (i === blockIdx) {
        newBlocks.push({ ...row.ins, props: { ...row.ins.props, html: newHtml } });
      } else {
        newBlocks.push(row.ins);
      }
    }
  }
  return JSON.stringify({ root: currentRoot, content: newBlocks });
}


function computeBlockDiff(a: PuckBlock[], b: PuckBlock[]): BlockDiffRow[] {
  const ops = lcs(a, b, blockSig);
  const rows: BlockDiffRow[] = [];
  for (let k = 0; k < ops.length; k++) {
    if (ops[k].kind === "del" && ops[k + 1]?.kind === "ins") {
      rows.push({ kind: "change", del: ops[k].item, ins: ops[k + 1].item });
      k++;
    } else if (ops[k].kind === "keep") {
      rows.push({ kind: "keep", block: ops[k].item });
    } else if (ops[k].kind === "del") {
      rows.push({ kind: "del", block: ops[k].item });
    } else {
      rows.push({ kind: "ins", block: ops[k].item });
    }
  }
  return rows;
}

// ── Paragraph-level diff inside RichText blocks ────────────────────────────

type SegDiffRow =
  | { kind: "keep"; html: string }
  | { kind: "del"; html: string }
  | { kind: "ins"; html: string }
  | { kind: "change"; del: string; ins: string };

function computeSegDiff(delHtml: string, insHtml: string): SegDiffRow[] {
  const a = splitHtmlSegments(delHtml);
  const b = splitHtmlSegments(insHtml);
  const ops = lcs(a, b, htmlToText);
  const rows: SegDiffRow[] = [];
  for (let k = 0; k < ops.length; k++) {
    if (ops[k].kind === "del" && ops[k + 1]?.kind === "ins") {
      rows.push({ kind: "change", del: ops[k].item, ins: ops[k + 1].item });
      k++;
    } else if (ops[k].kind === "keep") {
      rows.push({ kind: "keep", html: ops[k].item });
    } else if (ops[k].kind === "del") {
      rows.push({ kind: "del", html: ops[k].item });
    } else {
      rows.push({ kind: "ins", html: ops[k].item });
    }
  }
  return rows;
}

// ── Renderers ─────────────────────────────────────────────────────────────

function BlockPreview({ block }: { block: PuckBlock }) {
  switch (block.type) {
    case "RichText": {
      const html = String(block.props.html ?? block.props.content ?? "");
      return <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
    }
    case "Heading": {
      const text = String(block.props.text ?? block.props.title ?? block.props.content ?? "");
      const level = Number(block.props.level ?? 2);
      const cls = level <= 1 ? "text-2xl font-bold" : level === 2 ? "text-xl font-bold" : "text-lg font-semibold";
      return <div className={cls}>{text}</div>;
    }
    case "Image": {
      const src = String(block.props.src ?? block.props.url ?? "");
      const alt = String(block.props.alt ?? "");
      // eslint-disable-next-line @next/next/no-img-element
      if (src) return <img src={src} alt={alt} className="max-w-full rounded" />;
      return <div className="text-sm italic text-slate-400">[Image{alt ? `: ${alt}` : ""}]</div>;
    }
    case "Table": {
      const cells = (block.props.cells as string[][] | undefined) ?? [];
      const headerRow = Boolean(block.props.headerRow);
      return (
        <table className="w-full text-xs border-collapse">
          <tbody>
            {cells.map((row, ri) => (
              <tr key={ri}>
                {row.map((cell, ci) =>
                  headerRow && ri === 0
                    ? <th key={ci} className="border border-slate-300 px-2 py-1 bg-slate-100 text-left font-semibold">{cell}</th>
                    : <td key={ci} className="border border-slate-300 px-2 py-1">{cell}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    default: {
      const texts = Object.entries(block.props)
        .filter(([k, v]) => k !== "id" && typeof v === "string" && (v as string).length > 0)
        .map(([, v]) => String(v));
      return (
        <div className="text-sm">
          <span className="font-mono text-[11px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded mr-2">{block.type}</span>
          {texts.length > 0 && <span className="text-slate-600">{texts[0].slice(0, 300)}</span>}
        </div>
      );
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function RestoreBar({ kind, contentId, newContentJson, label, accent }: {
  kind: "post" | "page"; contentId: number; newContentJson: string;
  label: string; accent: "red" | "slate";
}) {
  const fg = accent === "red" ? "text-red-500 hover:text-red-700" : "text-slate-400 hover:text-slate-700";
  const border = accent === "red" ? "border-red-100" : "border-slate-100";
  return (
    <form action={restoreBlockAction} className={`px-5 py-1.5 flex items-center justify-between border-b ${border}`}>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="contentId" value={String(contentId)} />
      <input type="hidden" name="newContentJson" value={newContentJson} />
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
      <button type="submit" className={`inline-flex items-center gap-1 text-xs font-medium ${fg} transition-colors`}>
        <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
        Restore block
      </button>
    </form>
  );
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

// ── Page ───────────────────────────────────────────────────────────────────

export default async function PostHistoryPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ rev?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");

  const { id: idParam } = await params;
  const { rev: revParam } = await searchParams;
  const postId = Number(idParam);
  if (!Number.isFinite(postId) || postId <= 0) notFound();

  const [post, revisions] = await Promise.all([
    getPost(db(), postId),
    getRevisions(db(), "post", postId, 5),
  ]);
  if (!post) notFound();

  const selectedRevId = revParam ? Number(revParam) : (revisions[0]?.id ?? null);
  const selectedRev = selectedRevId ? await getRevision(db(), selectedRevId) : null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snap = selectedRev ? (JSON.parse(selectedRev.snapshot) as Record<string, any>) : null;

  const revBlocks = snap ? parseBlocks(snap.contentJson ?? "{}") : [];
  const curBlocks = parseBlocks(post.contentJson ?? "{}");
  const curRoot = parseRoot(post.contentJson ?? "{}");
  const diff = snap ? computeBlockDiff(revBlocks, curBlocks) : [];

  const titleChanged = snap && snap.title !== post.title;

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`/admin/posts/${postId}/edit`}
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700 mb-3"
        >
          <ArrowLeft className="size-4" />
          Back to editor
        </Link>
        <h1 className="text-xl font-semibold text-brand-navy">
          History — <span className="font-normal text-slate-600">{post.title}</span>
        </h1>
      </div>

      {revisions.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-400">
          <Clock className="size-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No versions saved yet. Versions are captured automatically on each save.</p>
        </div>
      ) : (
        <div className="flex gap-6 items-start">
          {/* Revision list */}
          <div className="w-56 shrink-0">
            <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Saved versions</p>
            <ul className="flex flex-col gap-2">
              {revisions.map((rev) => {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const s = JSON.parse(rev.snapshot) as Record<string, any>;
                const isSelected = rev.id === selectedRevId;
                return (
                  <li key={rev.id} className={`rounded-xl border bg-white shadow-sm transition-shadow hover:shadow-md ${isSelected ? "border-brand-green ring-1 ring-brand-green/30" : "border-slate-200"}`}>
                    <Link href={`?rev=${rev.id}`} className="block px-4 pt-3 pb-2">
                      <p className="text-sm font-medium text-slate-700 truncate">{s.title || "Untitled"}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{fmt(rev.createdAt)}</p>
                    </Link>
                    <div className="px-4 pb-3">
                      <form action={restorePostRevisionAction.bind(null, postId, rev.id)}>
                        <button type="submit" className="text-xs font-medium text-brand-green hover:underline">
                          Restore this version
                        </button>
                      </form>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Diff panel */}
          {snap && selectedRev ? (
            <div className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center gap-2 text-xs text-slate-500">
                <span className="font-semibold text-slate-700">{fmt(selectedRev.createdAt)}</span>
                <MoveRight className="size-3.5 shrink-0" />
                <span className="font-semibold text-slate-700">Current version</span>
              </div>

              {titleChanged && (
                <div className="px-5 py-3 border-b border-slate-200 space-y-1">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 mb-2">Title changed</p>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 text-[11px] font-bold text-red-400 w-4">−</span>
                    <span className="flex-1 text-sm text-red-800 line-through bg-red-50 px-2 py-1 rounded">{snap.title}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-0.5 shrink-0 text-[11px] font-bold text-green-500 w-4">+</span>
                    <span className="flex-1 text-sm text-green-900 font-medium bg-green-50 px-2 py-1 rounded">{post.title}</span>
                  </div>
                </div>
              )}

              {diff.length === 0 ? (
                <div className="px-5 py-8 text-center text-sm text-slate-400">No content to compare.</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {diff.map((row, i) => {
                    if (row.kind === "keep") return (
                      <div key={i} className="px-5 py-4">
                        <BlockPreview block={row.block} />
                      </div>
                    );

                    if (row.kind === "del") return (
                      <div key={i} className="bg-red-50">
                        <RestoreBar kind="post" contentId={postId} newContentJson={computeRestoredContent(diff, i, curRoot)} label="Block removed" accent="red" />
                        <div className="px-5 py-4 [&_*]:line-through [&_*]:decoration-red-500/70 opacity-70">
                          <BlockPreview block={row.block} />
                        </div>
                      </div>
                    );

                    if (row.kind === "ins") return (
                      <div key={i} className="px-5 py-4 bg-green-50">
                        <BlockPreview block={row.block} />
                      </div>
                    );

                    // change — if both are RichText, diff at paragraph level
                    if (row.del.type === "RichText" && row.ins.type === "RichText") {
                      const delHtml = String(row.del.props.html ?? row.del.props.content ?? "");
                      const insHtml = String(row.ins.props.html ?? row.ins.props.content ?? "");
                      const segs = computeSegDiff(delHtml, insHtml);
                      return (
                        <div key={i}>
                          <RestoreBar kind="post" contentId={postId} newContentJson={computeRevertedContent(diff, i, curRoot)} label="Block changed" accent="slate" />
                          <div className="px-5 py-4">
                            <div className="prose prose-sm max-w-none">
                              {segs.map((seg, si) => {
                                if (seg.kind === "keep") return (
                                  <div key={si} dangerouslySetInnerHTML={{ __html: seg.html }} />
                                );
                                if (seg.kind === "ins") return (
                                  <div key={si} className="bg-green-50 rounded" dangerouslySetInnerHTML={{ __html: seg.html }} />
                                );
                                if (seg.kind === "del") {
                                  const segJson = computeSegRestoredContent(diff, i, segs, si, curRoot);
                                  return (
                                    <div key={si} className="relative group/para">
                                      <div className="bg-red-50 rounded line-through decoration-red-500/60 opacity-70" dangerouslySetInnerHTML={{ __html: seg.html }} />
                                      <form action={restoreBlockAction} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/para:opacity-100 transition-opacity">
                                        <input type="hidden" name="kind" value="post" />
                                        <input type="hidden" name="contentId" value={String(postId)} />
                                        <input type="hidden" name="newContentJson" value={segJson} />
                                        <button type="submit" className="inline-flex items-center gap-0.5 text-[10px] bg-white/90 backdrop-blur-sm px-1.5 py-0.5 rounded border border-red-200 text-red-500 hover:text-red-700 font-medium shadow-sm whitespace-nowrap">
                                          ↩ restore
                                        </button>
                                      </form>
                                    </div>
                                  );
                                }
                                // change seg: show old (with restore) then new
                                const segJson = computeSegRestoredContent(diff, i, segs, si, curRoot);
                                return (
                                  <div key={si}>
                                    <div className="relative group/para">
                                      <div className="bg-red-50 rounded line-through decoration-red-500/60 opacity-70" dangerouslySetInnerHTML={{ __html: seg.del }} />
                                      <form action={restoreBlockAction} className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover/para:opacity-100 transition-opacity">
                                        <input type="hidden" name="kind" value="post" />
                                        <input type="hidden" name="contentId" value={String(postId)} />
                                        <input type="hidden" name="newContentJson" value={segJson} />
                                        <button type="submit" className="inline-flex items-center gap-0.5 text-[10px] bg-white/90 backdrop-blur-sm px-1.5 py-0.5 rounded border border-red-200 text-red-500 hover:text-red-700 font-medium shadow-sm whitespace-nowrap">
                                          ↩ restore
                                        </button>
                                      </form>
                                    </div>
                                    <div className="bg-green-50 rounded" dangerouslySetInnerHTML={{ __html: seg.ins }} />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // change — non-RichText: show full del then ins
                    return (
                      <div key={i}>
                        <RestoreBar kind="post" contentId={postId} newContentJson={computeRevertedContent(diff, i, curRoot)} label="Block changed" accent="slate" />
                        <div className="px-5 py-4 bg-red-50 [&_*]:line-through [&_*]:decoration-red-500/70 opacity-70">
                          <BlockPreview block={row.del} />
                        </div>
                        <div className="px-5 py-4 bg-green-50">
                          <BlockPreview block={row.ins} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm py-16 rounded-xl border border-slate-200 bg-white">
              Select a version to compare
            </div>
          )}
        </div>
      )}
    </div>
  );
}
