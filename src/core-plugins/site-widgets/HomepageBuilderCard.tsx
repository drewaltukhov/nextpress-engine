"use client";

import { useEffect, useState } from "react";
import {
  getHomepageContentSource,
  type HomepageSource,
} from "@core-plugins/themes/homepage-source-actions";
import { BuilderCard } from "@core/blocks/BuilderCard";

/**
 * Builder-only preview for the HomepageMain block. The builder doesn't
 * pass metadata to Puck, so the block's render can't read the homepage
 * source the way the public theme renderer does. We fetch it directly
 * here and render the same descriptive `BuilderCard` the live render
 * would produce.
 */
export function HomepageBuilderCard() {
  const [source, setSource] = useState<HomepageSource | null>(null);

  useEffect(() => {
    let active = true;
    getHomepageContentSource().then((s) => {
      if (active) setSource(s);
    });
    return () => {
      active = false;
    };
  }, []);

  return <BuilderCard name="HomepageMain" title="Homepage Content" description={describe(source)} />;
}

function describe(source: HomepageSource | null): string {
  if (!source) return "Reading homepage settings…";
  if (source.kind === "page") {
    return source.page
      ? `Static page · "${source.page.title}"`
      : "Static page · none picked yet — pick one in the settings.";
  }
  if (source.kind === "topic") {
    return source.topic
      ? `Topic posts · "${source.topic.name}", newest first`
      : "Topic posts · none picked yet — pick one in the settings.";
  }
  if (source.kind === "pillar") {
    return source.pillar
      ? `Pillar spikes · "${source.pillar.title}", newest first`
      : "Pillar spikes · none picked yet — pick one in the settings.";
  }
  return "Recent posts · the whole site, newest first";
}
