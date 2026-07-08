"use client";

import { useEffect, useState } from "react";
import { loadAvailableTopics, type AvailableTopic } from "@core-plugins/topics";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const ALL_TOPICS_VALUE = "__all";

interface Props {
  value: string;
  onChange: (next: string) => void;
}

/**
 * Custom Puck field input that lets the user pick a topic by slug.
 * Used by PostsGrid to filter recent posts to a single topic.
 *
 * Built on the project's shadcn-style `Select` (base-ui under the hood)
 * so it picks up the same focus, hover, and popup styling as the rest
 * of the admin UI. base-ui's Select doesn't allow an empty-string item
 * value, so the "All topics" option is encoded as `__all` internally
 * and translated back to `""` on change.
 */
export function TopicSlugPickerInput({ value, onChange }: Props) {
  const [items, setItems] = useState<AvailableTopic[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    loadAvailableTopics()
      .then((rows) => {
        if (active) setItems(rows);
      })
      .catch((e: unknown) => {
        if (active) {
          setItems([]);
          setError(e instanceof Error ? e.message : "Failed to load topics");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  if (items === null) {
    return <div className="text-xs text-slate-400">Loading topics…</div>;
  }

  const selectedValue = value === "" ? ALL_TOPICS_VALUE : value;
  const selectedTopic = items.find((t) => t.slug === value);

  return (
    <div className="space-y-1.5">
      <Select
        value={selectedValue}
        onValueChange={(v) => onChange(!v || v === ALL_TOPICS_VALUE ? "" : v)}
      >
        <SelectTrigger className="h-9 text-sm">
          <SelectValue placeholder="All topics">
            {(v) => {
              if (!v || v === ALL_TOPICS_VALUE) {
                return <span className="text-slate-500">All topics</span>;
              }
              if (!selectedTopic) {
                return <span className="text-slate-400 font-mono">{v}</span>;
              }
              return (
                <>
                  <span className="font-medium">{selectedTopic.name}</span>
                  <span className="text-slate-400 ml-1">({selectedTopic.slug})</span>
                </>
              );
            }}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={ALL_TOPICS_VALUE}>
            <span className="text-slate-500">All topics</span>
          </SelectItem>
          {items.map((t) => (
            <SelectItem key={t.slug} value={t.slug}>
              <span className="font-medium">{t.name}</span>
              <span className="text-slate-400 ml-1">({t.slug})</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {items.length === 0 ? (
        <p className="text-xs text-slate-500">
          No topics yet.{" "}
          <a
            href="/admin/topics"
            className="text-brand-green underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Create one →
          </a>
        </p>
      ) : null}
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
