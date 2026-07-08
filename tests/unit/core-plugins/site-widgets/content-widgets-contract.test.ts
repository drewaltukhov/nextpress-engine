import { describe, it, expect, vi } from "vitest";

// MediaPicker pulls in next-auth via picker-actions; stubbing keeps
// the editor-only deps out of the test bundle. HeroTitle imports
// MediaPicker but isn't covered by this test — the stub still has
// to be in place because site-widgets/index.ts would otherwise pull
// it in transitively if we ever imported the barrel here.
vi.mock("@core/components/MediaPicker", () => ({
  MediaPickerInput: () => null,
}));

import { PageContentBlock, PageContent } from "../../../../src/core-plugins/site-widgets/PageContent";
import { PostContentBlock, PostContent } from "../../../../src/core-plugins/site-widgets/PostContent";
import { SearchResultsBlock, SearchResults } from "../../../../src/core-plugins/site-widgets/SearchResults";
import { NotFoundMessageBlock, NotFoundMessage } from "../../../../src/core-plugins/site-widgets/NotFoundMessage";

const CONTENT_WIDGETS = [
  { block: PageContentBlock, config: PageContent, surface: "template-single-page" },
  { block: PostContentBlock, config: PostContent, surface: "template-single-post" },
  { block: SearchResultsBlock, config: SearchResults, surface: "template-search-results" },
  { block: NotFoundMessageBlock, config: NotFoundMessage, surface: "template-not-found" },
] as const;

describe("content widgets — consistent Main-zone behavior", () => {
  for (const { block, config, surface } of CONTENT_WIDGETS) {
    describe(`${block.name}`, () => {
      it("is marked essential", () => {
        expect(block.essential).toBe(true);
      });

      it("is in the Template category", () => {
        expect(block.category).toBe("Template");
      });

      it("targets its template surface", () => {
        expect(block.surfaces).toEqual(expect.arrayContaining([surface]));
      });

      it("locks delete and duplicate on the ComponentConfig", () => {
        const perms = (config as { permissions?: { delete?: boolean; duplicate?: boolean } }).permissions;
        expect(perms?.delete).toBe(false);
        expect(perms?.duplicate).toBe(false);
      });
    });
  }
});
