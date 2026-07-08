"use client";

import { useEffect, useRef, useState } from "react";
import { useEditor, EditorContent, Extension, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Quote,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Link as LinkIcon,
  Unlink,
  ImageIcon,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Pilcrow,
  Pencil,
  Trash2,
} from "lucide-react";
import { LinkDialog } from "./LinkDialog";
import { EditorImageDialog, type ImageInsertOptions } from "./EditorImageDialog";

/**
 * Tiptap Image extension extended with two custom attributes:
 *
 *   - `data-np-id` — stamped when an image is inserted from the media
 *     library; combined with the `data-np-shortcode="img"` marker, it
 *     hands the public RichTextDisplay everything it needs to wire up the
 *     lightbox without touching the shortcode pipeline.
 *
 *   - `class` — drives alignment (`np-align-left|center|right`) AND
 *     thumbnail-mode styling. Tiptap's stock Image extension drops `class`
 *     on parse, so without this addAttributes patch the alignment styles
 *     would survive only until the first save → reload round-trip.
 *
 * URL-pasted images leave `data-np-id` empty and therefore render as plain
 * non-interactive `<img>` tags (still get alignment via `class`).
 */
const NextPressImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      "data-np-id": {
        default: null,
        parseHTML: (el) => el.getAttribute("data-np-id"),
        renderHTML: (attrs) => {
          const id = attrs["data-np-id"];
          if (!id) return {};
          return { "data-np-id": id, "data-np-shortcode": "img" };
        },
      },
      class: {
        default: null,
        parseHTML: (el) => el.getAttribute("class"),
        renderHTML: (attrs) => (attrs.class ? { class: attrs.class as string } : {}),
      },
    };
  },
});

/**
 * Allow a `class` attribute on paragraph nodes so Tailwind Typography's
 * `.lead` element selector can style introductory paragraphs (larger,
 * lighter weight). Without this, Tiptap drops `class` on parse and a
 * saved `<p class="lead">` would lose its class on the first edit.
 *
 * Only paragraph is targeted — image already manages its own `class`
 * attribute, and we don't want classes leaking onto headings or list
 * items.
 */
const ParagraphClass = Extension.create({
  name: "paragraphClass",
  addGlobalAttributes() {
    return [
      {
        types: ["paragraph"],
        attributes: {
          class: {
            default: null,
            parseHTML: (el) => el.getAttribute("class"),
            renderHTML: (attrs) =>
              attrs.class ? { class: attrs.class as string } : {},
          },
        },
      },
    ];
  },
});

/** Map alignment + thumbnail-mode flags to the CSS class string applied to
 *  the inserted image node. The classes are defined globally in
 *  `globals.css` so editor preview and public render look identical. */
function buildImageClass(alignment: ImageInsertOptions["alignment"], thumbnail: boolean): string {
  const parts = [`np-align-${alignment}`];
  if (thumbnail) parts.push("np-thumb-tile");
  return parts.join(" ");
}

/** Inverse of `buildImageClass` — derive dialog initial values from a
 *  selected image node's attrs so the edit popup mirrors what's on screen.
 *  When in thumbnail mode the user-facing src is the *full* image URL
 *  (so they can flip the toggle off without re-picking); the actual stored
 *  src on the node would be the /thumb variant. */
function deriveImageOptions(attrs: Record<string, unknown>): ImageInsertOptions {
  const className = typeof attrs.class === "string" ? attrs.class : "";
  const alignment: ImageInsertOptions["alignment"] = className.includes("np-align-left")
    ? "left"
    : className.includes("np-align-right")
      ? "right"
      : "center";
  const thumbnail = className.includes("np-thumb-tile");
  const mediaId = typeof attrs["data-np-id"] === "string" ? (attrs["data-np-id"] as string) : null;
  const storedSrc = typeof attrs.src === "string" ? attrs.src : "";
  // In thumbnail mode the displayed src points at /media/{id}/thumb; surface
  // the canonical /media/{id} URL in the dialog so untoggling thumbnail
  // doesn't leave a stale /thumb URL behind.
  const src = thumbnail && mediaId ? `/media/${mediaId}` : storedSrc;
  const alt = typeof attrs.alt === "string" ? attrs.alt : "";
  return { src, alt, alignment, thumbnail, mediaId };
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Min height of the editable area, in px. Defaults to 300. */
  minHeight?: number;
}

/**
 * Tiptap-backed rich-text editor used inside Puck's Block settings panel
 * (and anywhere else we need inline formatting). Stores HTML — the simplest
 * round-trip for content that ultimately renders via dangerouslySetInnerHTML
 * inside a `prose` container on the public side.
 *
 * Tiptap requires `immediatelyRender: false` under Next.js' SSR pipeline;
 * without it the server-rendered DOM and the post-hydration editor drift,
 * triggering hydration mismatches.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  minHeight = 300,
}: RichTextEditorProps) {
  // Link-edit dialog state lives at the editor level so both the toolbar
  // button AND clicks-on-existing-links inside the canvas can open it.
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [linkInitial, setLinkInitial] = useState("");
  const [linkInitialNewTab, setLinkInitialNewTab] = useState(false);
  const [imageDialogOpen, setImageDialogOpen] = useState(false);
  // When set, the dialog opens in edit mode pre-filled from these values
  // and on submit we updateAttributes the selected node instead of
  // inserting a new one.
  const [imageDialogInitial, setImageDialogInitial] = useState<ImageInsertOptions | null>(null);
  // Position of the floating "edit image" pencil button, computed from
  // the selected image's bounding rect. Null hides the button.
  const [editButtonPos, setEditButtonPos] = useState<{ top: number; left: number } | null>(null);
  const editorWrapperRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // We want H2/H3 only — H1 is the page title input above the canvas,
        // and H4+ is rarely useful. Constrain at the schema level.
        heading: { levels: [2, 3] },
      }),
      Underline,
      Link.configure({
        openOnClick: false,
      }),
      NextPressImage.configure({
        // `inline: false` keeps each image on its own line as a block —
        // matches the `prose img` default layout and avoids weird wrapping
        // when a user inserts an image mid-paragraph (Tiptap splits the
        // paragraph for them).
        inline: false,
        // Authors should not be able to paste arbitrary base64 blobs that
        // would inflate the saved HTML.
        allowBase64: false,
      }),
      TextAlign.configure({
        types: ["heading", "paragraph"],
        alignments: ["left", "center", "right", "justify"],
      }),
      ParagraphClass,
    ],
    content: value || "",
    editorProps: {
      attributes: {
        // Full-size prose to match the public article preview's
        // typography — the inspector reads as a writing surface rather
        // than a cramped settings input. Vertical padding gives breathing
        // room below the sticky toolbar.
        class:
          "prose prose-slate max-w-none focus:outline-none py-3",
        // Defer to `--inspector-content-h` when an ancestor sets it (the
        // floating Block-settings panel writes the panel-content height
        // there on resize). Subtract the chrome that lives between the
        // panel's content area and this editable region:
        //   Puck field label  ~23px
        //   editor toolbar    ~37px (border + py + button)
        //   editor padding    24px (py-3)
        // ≈ 84px. Round to 5.25rem (84px). The `max()` gives a hard
        // floor — even if the panel shrinks below that, the editor stays
        // usable.
        style: `min-height: max(${minHeight}px, var(--inspector-content-h, ${minHeight}px) - 5.25rem)`,
      },
      // (Capture-phase click handler is wired up below in a useEffect —
      //  ProseMirror's handleDOMEvents fires in the bubble phase, which
      //  is too late for Chrome's target="_blank" default action.)
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    immediatelyRender: false,
  });

  // Capture-phase click intercept on the editor's contenteditable root.
  // Fires before any bubble-phase handler AND before the browser's
  // default action on <a target="_blank">, which is what was opening
  // the link in a new tab even though the dialog was also opening.
  // Mousedown is also intercepted because some browsers (Chromium) fire
  // popup permissions tied to the mousedown event for new-tab opens.
  useEffect(() => {
    if (!editor) return;
    const editorRef = editor;
    const view = editorRef.view;
    const dom = view.dom;
    function intercept(e: Event) {
      const target = e.target as HTMLElement | null;
      const linkEl = target?.closest("a");
      if (!linkEl || !dom.contains(linkEl)) return;
      e.preventDefault();
      e.stopPropagation();
      // stopImmediatePropagation prevents any other listener (including
      // ProseMirror plugins or extensions) from also handling the click.
      if ("stopImmediatePropagation" in e) {
        (e as Event & { stopImmediatePropagation(): void }).stopImmediatePropagation();
      }
      if (e.type === "click") {
        // We blocked ProseMirror's own mouse handling above, so it can't
        // move the cursor for us — and without a cursor inside the link
        // mark, `extendMarkRange("link").unsetLink()` (Remove button)
        // and `.setLink({href})` (Apply button) silently no-op. Compute
        // the document position from the clicked <a> element and set
        // the selection there ourselves before opening the dialog.
        const pos = view.posAtDOM(linkEl, 0);
        if (typeof pos === "number" && pos >= 0) {
          editorRef.chain().setTextSelection(pos).extendMarkRange("link").run();
        }
        const href = linkEl.getAttribute("href") ?? "";
        const target = linkEl.getAttribute("target");
        setLinkInitial(href);
        setLinkInitialNewTab(target === "_blank");
        setLinkDialogOpen(true);
      }
    }
    dom.addEventListener("mousedown", intercept, { capture: true });
    dom.addEventListener("click", intercept, { capture: true });
    dom.addEventListener("auxclick", intercept, { capture: true });
    return () => {
      dom.removeEventListener("mousedown", intercept, { capture: true });
      dom.removeEventListener("click", intercept, { capture: true });
      dom.removeEventListener("auxclick", intercept, { capture: true });
    };
  }, [editor]);

  // Track the selected image and project an edit-pencil button to its
  // top-right corner. Recomputes on every transaction (covers selection
  // changes AND attr/content changes that move the image), plus capture-
  // phase scroll/resize so the button rides any layout shift in ancestor
  // panels (the floating Block-settings inspector scrolls).
  useEffect(() => {
    if (!editor) return;
    const editorRef = editor;
    function update() {
      if (!editorRef.isActive("image")) {
        setEditButtonPos((current) => (current === null ? current : null));
        return;
      }
      const { from } = editorRef.state.selection;
      const node = editorRef.view.nodeDOM(from) as HTMLElement | null;
      const wrapper = editorWrapperRef.current;
      if (!node || !wrapper) {
        setEditButtonPos(null);
        return;
      }
      const wrapperRect = wrapper.getBoundingClientRect();
      const nodeRect = node.getBoundingClientRect();
      // Anchor to the wrapper so scrolling content moves the button along
      // with the image. Offset the button so it sits just inside the
      // image's top-right corner with a comfortable inset (button is 28px
      // wide; -37 leaves a ~9px gap to the right edge).
      setEditButtonPos({
        top: nodeRect.top - wrapperRect.top + 6,
        left: nodeRect.right - wrapperRect.left - 37,
      });
    }
    editorRef.on("selectionUpdate", update);
    editorRef.on("transaction", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    update();
    return () => {
      editorRef.off("selectionUpdate", update);
      editorRef.off("transaction", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [editor]);

  if (!editor) {
    return (
      <div
        className="rounded-lg border border-slate-200 bg-slate-50"
        style={{ minHeight: minHeight + 40 }}
      />
    );
  }

  function openLinkDialogForSelection() {
    if (!editor) return;
    const attrs = editor.getAttributes("link");
    const previousUrl = attrs.href as string | undefined;
    const previousTarget = attrs.target as string | undefined;
    setLinkInitial(previousUrl ?? "");
    setLinkInitialNewTab(previousTarget === "_blank");
    setLinkDialogOpen(true);
  }

  function applyLink(url: string, openInNewTab: boolean) {
    if (!editor) return;
    const target = openInNewTab ? "_blank" : null;
    const rel = openInNewTab ? "noopener noreferrer" : null;
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: url, target, rel })
      .run();
  }

  function removeLink() {
    editor?.chain().focus().extendMarkRange("link").unsetLink().run();
  }

  function openImageDialog() {
    if (!editor) return;
    // Edit mode when an image is selected; otherwise blank insert.
    if (editor.isActive("image")) {
      const attrs = editor.getAttributes("image");
      setImageDialogInitial(deriveImageOptions(attrs));
    } else {
      setImageDialogInitial(null);
    }
    setImageDialogOpen(true);
  }

  function submitImage(options: ImageInsertOptions) {
    if (!editor) return;
    // Thumbnail mode is library-only (the dialog enforces this). Library
    // picks land here with `mediaId` set + `src = /media/{id}`; flipping
    // the URL to the /thumb variant produces a smaller image inline that
    // still opens the full-size in lightbox via metadata lookup.
    const finalSrc = options.thumbnail && options.mediaId
      ? `/media/${options.mediaId}/thumb`
      : options.src;
    const className = buildImageClass(options.alignment, options.thumbnail);
    // Tiptap's setImage / updateAttributes signatures don't know about our
    // custom attrs, but Tiptap forwards everything through to the schema —
    // the cast keeps the call typesafe at the call surface and lets the
    // extended Image node pick up `data-np-id` + `class`.
    const attrs = {
      src: finalSrc,
      alt: options.alt,
      "data-np-id": options.mediaId ?? null,
      class: className,
    };
    if (imageDialogInitial !== null && editor.isActive("image")) {
      // Edit mode — patch the selected node's attrs in place. Preserves
      // selection so the pencil stays anchored to the same image.
      editor
        .chain()
        .focus()
        .updateAttributes(
          "image",
          attrs as Parameters<ReturnType<typeof editor.chain>["updateAttributes"]>[1],
        )
        .run();
    } else {
      editor
        .chain()
        .focus()
        .setImage(attrs as Parameters<ReturnType<typeof editor.chain>["setImage"]>[0])
        .run();
    }
  }

  return (
    <div
      ref={editorWrapperRef}
      // No bordered card — the editor IS the inspector content for the
      // RichText field, and the surrounding panel chrome is enough
      // structure. Stripping the card lets the prose breathe like the
      // public article it ultimately becomes.
      className="relative"
    >
      <Toolbar
        editor={editor}
        onOpenLinkDialog={openLinkDialogForSelection}
        onOpenImageDialog={openImageDialog}
      />
      <EditorContent
        editor={editor}
        placeholder={placeholder}
      />
      {editButtonPos && (
        <>
          {/* Delete button — sits to the left of the pencil with a 4px
              gap (pencil is 28px / size-7, so -32 offset from its left). */}
          <button
            type="button"
            // Mousedown's preventDefault keeps the image's NodeSelection
            // intact through the click — without it the editor would
            // blur and deselect before deleteSelection() runs.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => editor.chain().focus().deleteSelection().run()}
            title="Delete image"
            aria-label="Delete image"
            style={{ top: editButtonPos.top, left: editButtonPos.left - 32 }}
            className="absolute z-10 inline-flex size-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-rose-50 hover:text-rose-600 hover:border-rose-300"
          >
            <Trash2 className="size-3.5" />
          </button>
          <button
            type="button"
            // Same focus-preservation reason as the delete button above —
            // without preventDefault, `editor.isActive("image")` would
            // already be false by the time openImageDialog() ran.
            onMouseDown={(e) => e.preventDefault()}
            onClick={openImageDialog}
            title="Edit image"
            aria-label="Edit image"
            style={{ top: editButtonPos.top, left: editButtonPos.left }}
            className="absolute z-10 inline-flex size-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 hover:text-brand-green hover:border-brand-green"
          >
            <Pencil className="size-3.5" />
          </button>
        </>
      )}
      <LinkDialog
        open={linkDialogOpen}
        onOpenChange={setLinkDialogOpen}
        initialUrl={linkInitial}
        initialOpenInNewTab={linkInitialNewTab}
        hasLink={editor.isActive("link") || linkInitial !== ""}
        onApply={applyLink}
        onRemove={removeLink}
      />
      <EditorImageDialog
        open={imageDialogOpen}
        onOpenChange={setImageDialogOpen}
        onInsert={submitImage}
        initial={imageDialogInitial}
      />
    </div>
  );
}

interface ToolbarProps {
  editor: Editor;
  /** Lifted to RichTextEditor so clicks on existing link marks inside
   *  the canvas can also open the same dialog (single state owner). */
  onOpenLinkDialog: () => void;
  onOpenImageDialog: () => void;
}

function Toolbar({ editor, onOpenLinkDialog, onOpenImageDialog }: ToolbarProps) {
  return (
    // Sticky at the top of the scrolling inspector content so the
    // toolbar stays accessible as the user scrolls down through a long
    // article. The subtle bottom border separates it from the prose
    // without feeling like the lid of a card.
    <div className="sticky top-0 z-20 flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-white px-1.5 py-1">
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBold().run()}
        active={editor.isActive("bold")}
        label="Bold"
      >
        <Bold className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleItalic().run()}
        active={editor.isActive("italic")}
        label="Italic"
      >
        <Italic className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        active={editor.isActive("underline")}
        label="Underline"
      >
        <UnderlineIcon className="size-3.5" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        active={editor.isActive("heading", { level: 2 })}
        label="Heading 2"
      >
        <Heading2 className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        active={editor.isActive("heading", { level: 3 })}
        label="Heading 3"
      >
        <Heading3 className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => {
          const isLead = editor.isActive("paragraph", { class: "lead" });
          editor
            .chain()
            .focus()
            .updateAttributes("paragraph", { class: isLead ? null : "lead" })
            .run();
        }}
        active={editor.isActive("paragraph", { class: "lead" })}
        disabled={!editor.isActive("paragraph")}
        label="Lead paragraph"
      >
        <Pilcrow className="size-3.5" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        active={editor.isActive("bulletList")}
        label="Bulleted list"
      >
        <List className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        active={editor.isActive("orderedList")}
        label="Numbered list"
      >
        <ListOrdered className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
        active={editor.isActive("blockquote")}
        label="Blockquote"
      >
        <Quote className="size-3.5" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
        active={editor.isActive({ textAlign: "left" })}
        label="Align left"
      >
        <AlignLeft className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
        active={editor.isActive({ textAlign: "center" })}
        label="Align center"
      >
        <AlignCenter className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
        active={editor.isActive({ textAlign: "right" })}
        label="Align right"
      >
        <AlignRight className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
        active={editor.isActive({ textAlign: "justify" })}
        label="Justify"
      >
        <AlignJustify className="size-3.5" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={onOpenLinkDialog}
        active={editor.isActive("link")}
        label="Add or edit link"
      >
        <LinkIcon className="size-3.5" />
      </ToolbarButton>
      <ToolbarButton
        onClick={() => editor.chain().focus().extendMarkRange("link").unsetLink().run()}
        active={false}
        disabled={!editor.isActive("link")}
        label="Remove link"
      >
        <Unlink className="size-3.5" />
      </ToolbarButton>

      <Divider />

      <ToolbarButton
        onClick={onOpenImageDialog}
        active={false}
        label="Insert image"
      >
        <ImageIcon className="size-3.5" />
      </ToolbarButton>
    </div>
  );
}

interface ToolbarButtonProps {
  onClick: () => void;
  active: boolean;
  disabled?: boolean;
  label: string;
  children: React.ReactNode;
}

function ToolbarButton({ onClick, active, disabled, label, children }: ToolbarButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex size-7 items-center justify-center rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        active
          ? "bg-brand-green/15 text-brand-green"
          : "text-slate-600 hover:bg-slate-200/60 hover:text-slate-900"
      }`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-4 w-px bg-slate-200" aria-hidden />;
}
