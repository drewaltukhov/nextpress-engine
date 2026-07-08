import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import {
  AuthorName,
  type AuthorNameProps,
} from "../../../../src/core-plugins/site-widgets/AuthorName";

type PuckRenderArg = Parameters<typeof AuthorName.render>[0];

function defaults(overrides: Partial<AuthorNameProps> = {}): AuthorNameProps {
  return { ...AuthorName.defaultProps, ...overrides } as AuthorNameProps;
}

function render(
  props: Partial<AuthorNameProps>,
  metadata: Record<string, unknown>,
): string {
  const arg = {
    ...defaults(props),
    puck: { isEditing: false, metadata },
  } as unknown as PuckRenderArg;
  const node = AuthorName.render(arg) as ReactElement | null;
  return renderToStaticMarkup(<>{node}</>);
}

const author = {
  id: "u1",
  username: "drew",
  displayName: "Drew",
  fullName: "Drew Altukhov",
  avatarUrl: null,
  bio: null,
  socials: {},
};

describe("AuthorName — linkAuthor toggle", () => {
  it("renders the name as plain text by default (linkAuthor: false)", () => {
    const html = render({}, { author });
    expect(html).toMatch(/Drew/);
    expect(html).not.toMatch(/<a href="\/author\/drew"/);
  });

  it("wraps the name in /author/<username> when linkAuthor is true", () => {
    const html = render({ linkAuthor: true }, { author });
    expect(html).toMatch(
      /<a href="\/author\/drew"[^>]*>Drew<\/a>/,
    );
  });

  it("renders plain text when linkAuthor is true but the author has no username", () => {
    const html = render({ linkAuthor: true }, { author: { ...author, username: "" } });
    expect(html).toMatch(/Drew/);
    expect(html).not.toMatch(/<a href="\/author\//);
  });
});
