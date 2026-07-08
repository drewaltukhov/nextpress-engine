import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";

// MediaPicker pulls in `@core/media/picker-actions`, which imports
// `next-auth` — incompatible with the vitest node runner. The widget
// only uses MediaPickerInput inside its Puck field render, never at
// runtime render, so stubbing it keeps the editor-only deps out of the
// test bundle.
vi.mock("@core/components/MediaPicker", () => ({
  MediaPickerInput: () => null,
}));

import {
  HeroTitle,
  HeroTitleBlock,
  type HeroTitleProps,
} from "../../../../src/core-plugins/site-widgets/HeroTitle";

type PuckRenderArg = Parameters<typeof HeroTitle.render>[0];

function defaults(overrides: Partial<HeroTitleProps> = {}): HeroTitleProps {
  return { ...HeroTitle.defaultProps, ...overrides } as HeroTitleProps;
}

function renderWidget(
  props: Partial<HeroTitleProps>,
  puck: Partial<NonNullable<PuckRenderArg["puck"]>> = {},
): string {
  const fullProps = defaults(props);
  const arg = {
    ...fullProps,
    puck: { isEditing: false, metadata: {}, ...puck },
  } as unknown as PuckRenderArg;
  const node = HeroTitle.render(arg) as ReactElement | null;
  return renderToStaticMarkup(<>{node}</>);
}

describe("HeroTitle — surfaces & registration", () => {
  it("registers for the single-post, single-pillar, and single-page surfaces", () => {
    expect(HeroTitleBlock.surfaces).toEqual(
      expect.arrayContaining([
        "template-single-post",
        "template-single-pillar",
        "template-single-page",
      ]),
    );
  });

  it("is categorized under Template", () => {
    expect(HeroTitleBlock.category).toBe("Template");
  });

  it("registers under the block name HeroTitle", () => {
    expect(HeroTitleBlock.name).toBe("HeroTitle");
  });
});

describe("HeroTitle — builder card placeholder", () => {
  it("renders a BuilderCard placeholder when editing", () => {
    const html = renderWidget({}, { isEditing: true });
    expect(html).toMatch(/Hero Title/);
  });
});

describe("HeroTitle — empty render", () => {
  it("renders nothing when neither post nor page is in metadata", () => {
    const html = renderWidget({});
    expect(html).toBe("");
  });
});

describe("HeroTitle — post render", () => {
  const post = {
    id: 1,
    title: "Hello world",
    publishedAt: "2026-05-01 12:00:00",
  };
  const postAuthor = {
    id: "u1",
    username: "drew",
    displayName: "Drew",
    fullName: "Drew Altukhov",
    avatarUrl: "/avatar.jpg",
    bio: null,
    socials: {},
  };

  it("renders in the order: title, avatar, meta", () => {
    const html = renderWidget(
      { as: "h1", showAvatar: true, showAuthor: true, showDate: true, avatarShape: "original" },
      { metadata: { post, postAuthor, display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" } } },
    );
    const titleIdx = html.indexOf("<h1");
    const avatarIdx = html.indexOf('src="/avatar.jpg"');
    const dateIdx = html.indexOf("<time");
    expect(titleIdx).toBeGreaterThan(-1);
    expect(avatarIdx).toBeGreaterThan(-1);
    expect(dateIdx).toBeGreaterThan(-1);
    expect(titleIdx).toBeLessThan(avatarIdx);
    expect(avatarIdx).toBeLessThan(dateIdx);
  });

  it("renders the post title inside the configured heading tag", () => {
    const html = renderWidget(
      { as: "h2" },
      { metadata: { post, postAuthor, display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" } } },
    );
    expect(html).toMatch(/<h2[^>]*>Hello world<\/h2>/);
  });

  it("renders the author display name when showAuthor is true and nameSource is displayName", () => {
    const html = renderWidget(
      { showAuthor: true, nameSource: "displayName" },
      { metadata: { post, postAuthor, display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" } } },
    );
    expect(html).toMatch(/Drew/);
    expect(html).not.toMatch(/Drew Altukhov/);
  });

  it("renders the author full name when nameSource is fullName", () => {
    const html = renderWidget(
      { showAuthor: true, nameSource: "fullName" },
      { metadata: { post, postAuthor, display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" } } },
    );
    expect(html).toMatch(/Drew Altukhov/);
  });

  it("renders the avatar img when showAvatar is true and avatarUrl is set", () => {
    const html = renderWidget(
      { showAvatar: true, avatarShape: "circle", avatarSizeRem: 4 },
      { metadata: { post, postAuthor, display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" } } },
    );
    expect(html).toMatch(/src="\/avatar\.jpg"/);
    expect(html).toMatch(/rounded-full/);
    expect(html).toMatch(/4rem/);
  });

  it("does not render the avatar img when showAvatar is false", () => {
    const html = renderWidget(
      { showAvatar: false },
      { metadata: { post, postAuthor, display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" } } },
    );
    expect(html).not.toMatch(/src="\/avatar\.jpg"/);
  });

  it("renders the formatted published date when showDate is true", () => {
    const html = renderWidget(
      { showDate: true },
      { metadata: { post, postAuthor, display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" } } },
    );
    expect(html).toMatch(/2026-05-01/);
  });

  it("omits the date when showDate is false", () => {
    const html = renderWidget(
      { showDate: false },
      { metadata: { post, postAuthor, display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" } } },
    );
    expect(html).not.toMatch(/2026-05-01/);
  });
});

describe("HeroTitle — author link toggle", () => {
  const post = { id: 1, title: "Hello", publishedAt: null };
  const postAuthor = {
    id: "u1",
    username: "drew",
    displayName: "Drew",
    fullName: null,
    avatarUrl: null,
    bio: null,
    socials: {},
  };

  it("wraps the author name in /author/<username> by default", () => {
    const html = renderWidget(
      { showAuthor: true },
      { metadata: { post, postAuthor, display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" } } },
    );
    expect(html).toMatch(/<a href="\/author\/drew"[^>]*>Drew<\/a>/);
  });

  it("renders plain text when linkAuthor is false", () => {
    const html = renderWidget(
      { showAuthor: true, linkAuthor: false },
      { metadata: { post, postAuthor, display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" } } },
    );
    expect(html).toMatch(/Drew/);
    expect(html).not.toMatch(/<a href="\/author\//);
  });

  it("falls back to plain text when the author has no username", () => {
    const html = renderWidget(
      { showAuthor: true, linkAuthor: true },
      {
        metadata: {
          post,
          postAuthor: { ...postAuthor, username: "" },
          display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" },
        },
      },
    );
    expect(html).toMatch(/Drew/);
    expect(html).not.toMatch(/<a href="\/author\//);
  });
});

describe("HeroTitle — page fallback", () => {
  it("renders against page metadata when post is absent", () => {
    const page = { id: 9, title: "About us", publishedAt: "2026-04-15 09:00:00" };
    const pageAuthor = {
      id: "u2",
      username: "ana",
      displayName: "Ana",
      fullName: null,
      avatarUrl: null,
      bio: null,
      socials: {},
    };
    const html = renderWidget(
      { showAuthor: true, showAvatar: true, showDate: true },
      { metadata: { page, pageAuthor, display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" } } },
    );
    expect(html).toMatch(/About us/);
    expect(html).toMatch(/Ana/);
    expect(html).toMatch(/2026-04-15/);
  });
});

describe("HeroTitle — background image + overlay", () => {
  const post = { id: 1, title: "Hello", publishedAt: null };

  it("renders no overlay div when imageUrl is empty and no featured image", () => {
    const html = renderWidget(
      { imageUrl: "", overlayColor: "black" },
      { metadata: { post, display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" } } },
    );
    expect(html).not.toMatch(/bg-black\/45/);
  });

  it("renders no overlay div when overlayColor is none", () => {
    const html = renderWidget(
      { imageUrl: "/bg.jpg", overlayColor: "none" },
      { metadata: { post, display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" } } },
    );
    expect(html).toMatch(/src="\/bg\.jpg"/);
    expect(html).not.toMatch(/bg-black\/45/);
  });

  it("renders the overlay div when imageUrl is set and overlayColor is a preset", () => {
    const html = renderWidget(
      { imageUrl: "/bg.jpg", overlayColor: "black" },
      { metadata: { post, display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" } } },
    );
    expect(html).toMatch(/src="\/bg\.jpg"/);
    expect(html).toMatch(/bg-black\/45/);
  });

  it("falls back to post.featuredImage when imageUrl is empty", () => {
    const html = renderWidget(
      { imageUrl: "" },
      {
        metadata: {
          post: { ...post, featuredImage: "/featured.jpg" },
          display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" },
        },
      },
    );
    expect(html).toMatch(/src="\/featured\.jpg"/);
  });

  it("explicit imageUrl takes precedence over post.featuredImage", () => {
    const html = renderWidget(
      { imageUrl: "/explicit.jpg" },
      {
        metadata: {
          post: { ...post, featuredImage: "/featured.jpg" },
          display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" },
        },
      },
    );
    expect(html).toMatch(/src="\/explicit\.jpg"/);
    expect(html).not.toMatch(/src="\/featured\.jpg"/);
  });
});

describe("HeroTitle — color resolution", () => {
  const post = {
    id: 1,
    title: "Colored",
    publishedAt: "2026-05-01 12:00:00",
  };
  const postAuthor = {
    id: "u1",
    username: "drew",
    displayName: "Drew",
    fullName: null,
    avatarUrl: null,
    bio: null,
    socials: {},
  };
  const md = {
    post,
    postAuthor,
    display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" },
  };

  it("applies the title preset color class when titleColorPreset is a preset", () => {
    const html = renderWidget(
      { titleColorPreset: "green" },
      { metadata: md },
    );
    expect(html).toMatch(/class="[^"]*\btext-brand-green\b[^"]*"/);
  });

  it("applies the title custom hex via inline style when titleColorPreset is custom", () => {
    const html = renderWidget(
      { titleColorPreset: "custom", titleColorCustom: "#abcdef" },
      { metadata: md },
    );
    expect(html).toMatch(/<h1[^>]+style="color:#abcdef"/);
  });

  it("applies the author preset color to the author span", () => {
    // Disable the author link so the assertion focuses on the color
    // class, not the `<a>` wrapper added when linkAuthor is on.
    const html = renderWidget(
      { authorColorPreset: "white", linkAuthor: false },
      { metadata: md },
    );
    expect(html).toMatch(/<span class="text-white">Drew<\/span>/);
  });

  it("applies the date custom hex via inline style on the time element", () => {
    const html = renderWidget(
      { dateColorPreset: "custom", dateColorCustom: "#123456" },
      { metadata: md },
    );
    expect(html).toMatch(/<time[^>]+style="color:#123456"/);
  });

  it("falls back to a safe color when titleColorCustom is malformed", () => {
    const html = renderWidget(
      { titleColorPreset: "custom", titleColorCustom: "not-a-hex" },
      { metadata: md },
    );
    expect(html).toMatch(/<h1[^>]+style="color:#000000"/);
  });
});

describe("HeroTitle — rounded corners + vertical padding", () => {
  const post = {
    id: 1,
    title: "Hello",
    publishedAt: "2026-05-01 12:00:00",
  };
  const md = {
    post,
    display: { dateFormat: "yyyy-MM-dd", timezone: "UTC" },
  };

  it("adds rounded-2xl to the section when rounded is true", () => {
    const html = renderWidget({ rounded: true }, { metadata: md });
    expect(html).toMatch(/<section[^>]*class="[^"]*\brounded-2xl\b/);
  });

  it("omits rounded-2xl when rounded is false", () => {
    const html = renderWidget({ rounded: false }, { metadata: md });
    expect(html).not.toMatch(/rounded-2xl/);
  });

  it("applies paddingYRem symmetrically to the inner wrapper", () => {
    const html = renderWidget({ paddingYRem: 5 }, { metadata: md });
    expect(html).toMatch(
      /style="padding-top:5rem;padding-bottom:5rem"/,
    );
  });

  it("falls back to a safe padding when paddingYRem is invalid", () => {
    const html = renderWidget(
      { paddingYRem: -1 as unknown as number },
      { metadata: md },
    );
    expect(html).toMatch(
      /style="padding-top:3rem;padding-bottom:3rem"/,
    );
  });
});

describe("HeroTitle — resolveFields conditional hiding", () => {
  if (!HeroTitle.resolveFields) {
    it.skip("resolveFields not defined", () => {});
    return;
  }
  const resolveFields = HeroTitle.resolveFields;
  const allFields = HeroTitle.fields;

  it("hides nameSource and linkAuthor when showAuthor is false", () => {
    const filtered = resolveFields(
      { props: defaults({ showAuthor: false }) } as Parameters<typeof resolveFields>[0],
      { fields: allFields, lastFields: allFields, lastData: null, changed: {} } as unknown as Parameters<typeof resolveFields>[1],
    );
    const keys = Object.keys(filtered ?? {});
    expect(keys).not.toContain("nameSource");
    expect(keys).not.toContain("linkAuthor");
  });

  it("hides avatarSizeRem and avatarShape when showAvatar is false", () => {
    const filtered = resolveFields(
      { props: defaults({ showAvatar: false }) } as Parameters<typeof resolveFields>[0],
      { fields: allFields, lastFields: allFields, lastData: null, changed: {} } as unknown as Parameters<typeof resolveFields>[1],
    );
    const keys = Object.keys(filtered ?? {});
    expect(keys).not.toContain("avatarSizeRem");
    expect(keys).not.toContain("avatarShape");
  });

  it("returns the parent fields when both author and avatar are shown (color customs still hidden because presets are auto)", () => {
    const filtered = resolveFields(
      { props: defaults({ showAuthor: true, showAvatar: true }) } as Parameters<typeof resolveFields>[0],
      { fields: allFields, lastFields: allFields, lastData: null, changed: {} } as unknown as Parameters<typeof resolveFields>[1],
    );
    const keys = Object.keys(filtered ?? {});
    expect(keys).toContain("nameSource");
    expect(keys).toContain("avatarSizeRem");
    expect(keys).toContain("avatarShape");
    expect(keys).toContain("titleColorPreset");
    expect(keys).toContain("authorColorPreset");
    expect(keys).toContain("dateColorPreset");
    // Custom hex inputs hidden when their preset isn't "custom" (default is "auto").
    expect(keys).not.toContain("titleColorCustom");
    expect(keys).not.toContain("authorColorCustom");
    expect(keys).not.toContain("dateColorCustom");
  });

  it("shows a custom-hex field when its preset is set to custom", () => {
    const filtered = resolveFields(
      {
        props: defaults({
          titleColorPreset: "custom",
          authorColorPreset: "navy",
          dateColorPreset: "custom",
        }),
      } as Parameters<typeof resolveFields>[0],
      { fields: allFields, lastFields: allFields, lastData: null, changed: {} } as unknown as Parameters<typeof resolveFields>[1],
    );
    const keys = Object.keys(filtered ?? {});
    expect(keys).toContain("titleColorCustom");
    expect(keys).toContain("dateColorCustom");
    expect(keys).not.toContain("authorColorCustom");
  });

  it("hides author color fields when showAuthor is false", () => {
    const filtered = resolveFields(
      { props: defaults({ showAuthor: false }) } as Parameters<typeof resolveFields>[0],
      { fields: allFields, lastFields: allFields, lastData: null, changed: {} } as unknown as Parameters<typeof resolveFields>[1],
    );
    const keys = Object.keys(filtered ?? {});
    expect(keys).not.toContain("authorColorPreset");
    expect(keys).not.toContain("authorColorCustom");
  });

  it("hides date color fields when showDate is false", () => {
    const filtered = resolveFields(
      { props: defaults({ showDate: false }) } as Parameters<typeof resolveFields>[0],
      { fields: allFields, lastFields: allFields, lastData: null, changed: {} } as unknown as Parameters<typeof resolveFields>[1],
    );
    const keys = Object.keys(filtered ?? {});
    expect(keys).not.toContain("dateColorPreset");
    expect(keys).not.toContain("dateColorCustom");
  });
});
