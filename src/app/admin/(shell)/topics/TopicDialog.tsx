"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { normalizeSlug } from "@core/slugs/normalize";
import { createTopicAction, updateTopicAction } from "./actions";
import type { TopicListItem } from "@core-plugins/topics";

export interface CustomTopicTemplate {
  slug: string;
  displayName: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, dialog is in edit mode for this topic. */
  topic?: TopicListItem | null;
  /** Custom Topic Archive templates pulled from the active theme. */
  customTopicTemplates: CustomTopicTemplate[];
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

export function TopicDialog({ open, onOpenChange, topic, customTopicTemplates }: Props) {
  const isEdit = topic != null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit topic" : "Add topic"}</DialogTitle>
        </DialogHeader>
        {open ? (
          <TopicForm
            key={topic?.id ?? "new"}
            topic={topic ?? null}
            customTopicTemplates={customTopicTemplates}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

interface FormProps {
  topic: TopicListItem | null;
  customTopicTemplates: CustomTopicTemplate[];
  onClose: () => void;
}

function TopicForm({ topic, customTopicTemplates, onClose }: FormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(topic?.name ?? "");
  const [slug, setSlug] = useState(topic?.slug ?? "");
  const [description, setDescription] = useState(topic?.description ?? "");
  const [template, setTemplate] = useState(topic?.template ?? "");

  const previewSlug = useMemo(() => {
    const source = slug.trim() || name;
    return normalizeSlug(source);
  }, [name, slug]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const input = { name, slug, description, template };
      const result = topic
        ? await updateTopicAction(topic.id, input)
        : await createTopicAction(input);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(topic ? "Topic updated" : "Topic created");
      onClose();
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="tp-name" className="block text-sm font-medium text-slate-700 mb-1.5">
          Name
        </label>
        <input
          id="tp-name"
          type="text"
          required
          autoFocus
          maxLength={100}
          placeholder="e.g. Recipes"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="tp-slug" className="block text-sm font-medium text-slate-700 mb-1.5">
          Slug <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <input
          id="tp-slug"
          type="text"
          maxLength={100}
          placeholder="Leave blank to derive from name"
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className={`${inputCls} font-mono`}
        />
        <p className="mt-1 text-xs text-slate-500">
          Will be saved as <code className="font-mono text-slate-700">{previewSlug || "—"}</code>
        </p>
      </div>

      <div>
        <label htmlFor="tp-description" className="block text-sm font-medium text-slate-700 mb-1.5">
          Description <span className="text-slate-400 font-normal">(optional)</span>
        </label>
        <textarea
          id="tp-description"
          rows={4}
          maxLength={1000}
          placeholder="Used on archive pages and og:description."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={inputCls}
        />
      </div>

      <div>
        <label htmlFor="tp-template" className="block text-sm font-medium text-slate-700 mb-1.5">
          Template
        </label>
        <Select
          value={template}
          onValueChange={(v) => setTemplate(v ?? "")}
        >
          <SelectTrigger id="tp-template">
            <SelectValue placeholder="Default (Topic Archive)">
              {(value) => {
                if (!value) return "Default (Topic Archive)";
                const match = customTopicTemplates.find((c) => c.slug === String(value));
                return match?.displayName ?? String(value);
              }}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">Default (Topic Archive)</SelectItem>
            {customTopicTemplates.length > 0 ? (
              <SelectGroup>
                <SelectLabel>Custom</SelectLabel>
                {customTopicTemplates.map((c) => (
                  <SelectItem key={c.slug} value={c.slug}>
                    {c.displayName}
                  </SelectItem>
                ))}
              </SelectGroup>
            ) : null}
          </SelectContent>
        </Select>
        {customTopicTemplates.length === 0 ? (
          <p className="mt-1 text-xs text-slate-500">
            No custom Topic Archive templates yet — create one from Themes → Settings → Layout.
          </p>
        ) : null}
      </div>

      <DialogFooter>
        <button
          type="button"
          onClick={onClose}
          className="h-10 px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending
            ? topic
              ? "Saving…"
              : "Creating…"
            : topic
              ? "Save changes"
              : "Create topic"}
        </button>
      </DialogFooter>
    </form>
  );
}
