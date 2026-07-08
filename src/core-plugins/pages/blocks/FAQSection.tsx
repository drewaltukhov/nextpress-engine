import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import { BuilderCard } from "@core/blocks/BuilderCard";
import { blockSelectField } from "@core/blocks/BlockSelect";

// Inline SVG instead of `lucide-react` — `lucide-react` v1's Icon
// component is `"use client"` and calls `useContext` internally, which
// crashes Puck's <Render> with
// "Cannot read properties of null (reading 'useContext')" because the
// public render path doesn't bridge client components through Next.js's
// RSC machinery.
function ChevronDownGlyph({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export type FAQItem = {
  question: string;
  answer: string;
};

export type FAQLayout = "accordion" | "expanded";
export type FAQSectionProps = {
  items: FAQItem[];
  layout: FAQLayout;
  openFirst: boolean;
};

/**
 * Helper for the JSON-LD auto-emitter — walks a Puck `data.content` array
 * and pulls every {question, answer} pair from FAQSection blocks. Lives
 * here (alongside the block) so the block + the schema emitter share the
 * same prop shape and stay in sync if the block changes.
 */
export function collectFaqItems(
  content: { type?: string; props?: { items?: FAQItem[] } }[],
): FAQItem[] {
  return content
    .filter((block) => block.type === "FAQSection")
    .flatMap((block) => block.props?.items ?? [])
    .map((it) => ({
      question: (it?.question ?? "").trim(),
      answer: (it?.answer ?? "").trim(),
    }))
    .filter((it) => it.question && it.answer);
}

const DEFAULT_ITEMS: FAQItem[] = [
  { question: "What is this?", answer: "Replace this with your first FAQ." },
];

export const FAQSection: ComponentConfig<FAQSectionProps> = {
  label: "FAQ Section",
  fields: {
    items: {
      type: "array",
      label: "Q&A",
      arrayFields: {
        question: { type: "text", label: "Question" },
        answer: { type: "textarea", label: "Answer" },
      },
      defaultItemProps: { question: "", answer: "" },
      getItemSummary: (item, i) =>
        item?.question?.trim() || `Question ${(i ?? 0) + 1}`,
    },
    layout: blockSelectField<FAQLayout>({
      label: "Layout",
      options: [
        { label: "Accordion (collapsible)", value: "accordion" },
        { label: "Expanded (all open)", value: "expanded" },
      ],
    }),
    openFirst: {
      type: "radio",
      label: "Start with first item open",
      options: [
        { label: "No", value: false },
        { label: "Yes", value: true },
      ],
    },
  },
  defaultProps: {
    items: DEFAULT_ITEMS,
    layout: "accordion",
    openFirst: false,
  },
  render: ({ items, layout, openFirst, puck }) => {
    const md = (puck?.metadata ?? {}) as { themeBuilder?: boolean };
    const safeItems = (items ?? []).filter(
      (it) => it && (it.question?.trim() || it.answer?.trim()),
    );
    if (puck?.isEditing && md.themeBuilder) {
      const description = safeItems.length === 0
        ? "Collapsible Q&A — add questions in the inspector."
        : `${layout} · ${safeItems.length} question${safeItems.length === 1 ? "" : "s"}`;
      return <BuilderCard name="FAQSection" title="FAQ" description={description} />;
    }
    if (safeItems.length === 0) {
      return (
        <div
          className="np-faq-section mb-4"
          style={{
            padding: "2rem",
            border: "1px dashed #cbd5e1",
            borderRadius: 8,
            color: "#94a3b8",
            fontSize: 14,
            textAlign: "center",
          }}
        >
          FAQ — add questions in the Widget Settings panel
        </div>
      );
    }

    if (layout === "expanded") {
      return (
        <div className="np-faq-section not-prose mb-4 space-y-6">
          {safeItems.map((it, i) => (
            <div key={i}>
              <h3 className="text-lg font-semibold text-slate-900">{it.question}</h3>
              <p className="mt-1 whitespace-pre-line text-slate-700">{it.answer}</p>
            </div>
          ))}
        </div>
      );
    }

    // accordion — uses native <details>/<summary> so it works without JS,
    // is keyboard + screen-reader accessible by default, and supports
    // multi-open as a side-effect (each <details> toggles independently).
    return (
      <div className="np-faq-section not-prose mb-4 divide-y divide-slate-200 rounded-lg border border-slate-200">
        {safeItems.map((it, i) => (
          <details
            key={i}
            open={openFirst && i === 0}
            className="group [&_summary::-webkit-details-marker]:hidden"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-base font-medium text-slate-900 hover:bg-slate-50">
              <span>{it.question}</span>
              <ChevronDownGlyph className="size-4 shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
            </summary>
            <div className="px-4 py-4 text-slate-700 whitespace-pre-line">
              {it.answer}
            </div>
          </details>
        ))}
      </div>
    );
  },
};

export const FAQSectionBlock: Omit<RegisteredBlock, "source"> = {
  name: "FAQSection",
  config: FAQSection,
  surfaces: [
    "page-content",
    "post-content",
    "template-homepage",
    "template-single-page",
    "template-single-post",
    "template-single-pillar",
    "template-topic-archive",
    "template-author",
  ],
  category: "Sections",
};
