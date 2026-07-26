import type { ComponentConfig } from "@measured/puck";
import { GalleryEmbed, type GalleryLayout } from "@core-plugins/galleries/components/GalleryEmbed";
import type { GalleryDetail } from "@core-plugins/galleries";
import type { RegisteredBlock } from "@core/blocks/registry";
import { BlockPlaceholder } from "./_placeholder";
import { BuilderCard } from "@core/blocks/BuilderCard";

export type GalleryBlockProps = {
  galleryId: number | null;
  layout: GalleryLayout;
  showCaptions: boolean;
  showArrows: boolean;
  showDots: boolean;
  /** Masonry-only: number of columns (1–12). */
  columns: number;
  /** Masonry-only: gap between images, in rems (0–5). */
  gap: number;
  /** Grid + masonry: drop the rounded corners on images. */
  removeRadius: boolean;
  /** Carousel + masonry: tap an image to open the full-size lightbox.
   *  When off for masonry, images render plain with no link. */
  enableLightbox: boolean;
};

interface PuckMetadataShape {
  galleries?: Record<number, GalleryDetail>;
}

export const Gallery: ComponentConfig<GalleryBlockProps> = {
  label: "Gallery",
  // Editor fields (GalleryPickerField → picker dialog) live in
  // Gallery.fields.tsx and merge in for the admin editor via `withAdminFields`.
  // Empty here so the public render path never pulls the picker UI.
  fields: {} as ComponentConfig<GalleryBlockProps>["fields"],
  defaultProps: {
    galleryId: null,
    layout: "grid-lightbox",
    showCaptions: true,
    showArrows: true,
    showDots: true,
    columns: 2,
    gap: 1.5,
    removeRadius: false,
    enableLightbox: true,
  },
  // Backfill masonry defaults onto blocks created before these fields
  // existed, so the inspector shows real values instead of blank inputs.
  // Idempotent — only fills props that are actually missing.
  resolveData: (data) => {
    const props = { ...data.props };
    let changed = false;
    if (props.columns == null) {
      props.columns = 2;
      changed = true;
    }
    if (props.gap == null) {
      props.gap = 1.5;
      changed = true;
    }
    if (props.removeRadius == null) {
      props.removeRadius = false;
      changed = true;
    }
    return changed ? { props } : { props: data.props };
  },
  // Show only the fields relevant to the active layout. Hidden values stay
  // in puckData, so switching layouts and back restores the user's prior
  // choices without losing them. galleryId / layout / showCaptions apply to
  // every layout and are never filtered.
  resolveFields: (data, { fields }) => {
    const layout = (data.props?.layout ?? "grid-lightbox") as GalleryLayout;
    const visibleByLayout: Record<GalleryLayout, Array<keyof GalleryBlockProps>> = {
      "grid-lightbox": ["removeRadius"],
      masonry: ["columns", "gap", "removeRadius", "enableLightbox"],
      carousel: ["showArrows", "showDots", "enableLightbox"],
    };
    const conditional: Array<keyof GalleryBlockProps> = [
      "showArrows",
      "showDots",
      "enableLightbox",
      "columns",
      "gap",
      "removeRadius",
    ];
    const visible = new Set<string>(visibleByLayout[layout] ?? []);
    const filtered = Object.fromEntries(
      Object.entries(fields).filter(
        ([key]) => !conditional.includes(key as keyof GalleryBlockProps) || visible.has(key),
      ),
    );
    return filtered as typeof fields;
  },
  render: ({ galleryId, layout, showCaptions, showArrows, showDots, columns, gap, removeRadius, enableLightbox, puck }) => {
    const md = (puck?.metadata ?? {}) as PuckMetadataShape & { themeBuilder?: boolean };
    if (puck?.isEditing && md.themeBuilder) {
      const description = galleryId == null
        ? "Curated gallery of images — pick one and choose a layout in the inspector."
        : `Gallery #${galleryId} · ${layout}`;
      return <BuilderCard name="Gallery" title="Gallery" description={description} />;
    }
    if (galleryId == null) {
      return (
        <BlockPlaceholder>
          Gallery — pick one in the Widget Settings panel
        </BlockPlaceholder>
      );
    }
    const metadata = (puck?.metadata ?? {}) as PuckMetadataShape;
    const gallery = metadata.galleries?.[galleryId];
    if (!gallery) {
      return (
        <BlockPlaceholder>
          Gallery #{galleryId} — loading…
        </BlockPlaceholder>
      );
    }
    // Pre-existing Gallery blocks saved before these fields were added
    // don't have the props in their puckData. Treat undefined as `true`
    // for showCaptions (preserve old "captions visible" behaviour) and
    // as `false` for enableLightbox (older carousels never had lightbox,
    // so opting them in retroactively would be a behaviour change).
    return (
      <div className="np-gallery">
        <GalleryEmbed
          gallery={gallery}
          layout={layout}
          showCaptions={showCaptions ?? true}
          showArrows={showArrows}
          showDots={showDots}
          columns={columns ?? 2}
          gap={gap ?? 1.5}
          removeRadius={removeRadius ?? false}
          enableLightbox={enableLightbox ?? false}
          mode={puck?.isEditing ? "editor" : "public"}
        />
      </div>
    );
  },
};

export const GalleryBlock: Omit<RegisteredBlock, "source"> = {
  name: "Gallery",
  config: Gallery,
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
  category: "Media",
};
