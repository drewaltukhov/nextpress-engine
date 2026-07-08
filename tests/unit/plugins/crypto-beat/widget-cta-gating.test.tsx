import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CryptoBeatWidget } from "../../../../plugins/crypto-beat/CryptoBeatWidget";

describe("CryptoBeatWidget — showAdminCTAs prop", () => {
  it("renders /admin link in EmptyState when API key missing (default true)", () => {
    const html = renderToStaticMarkup(
      <CryptoBeatWidget rows={[]} currency="usd" apiKeyConfigured={false} />,
    );
    expect(html).toMatch(/href="\/admin\//);
  });

  it("omits /admin link when showAdminCTAs={false}", () => {
    const html = renderToStaticMarkup(
      <CryptoBeatWidget
        rows={[]}
        currency="usd"
        apiKeyConfigured={false}
        showAdminCTAs={false}
      />,
    );
    expect(html).not.toMatch(/href="\/admin/);
  });

  it("omits /admin link in no-assets state when showAdminCTAs={false}", () => {
    const html = renderToStaticMarkup(
      <CryptoBeatWidget
        rows={[]}
        currency="usd"
        apiKeyConfigured={true}
        showAdminCTAs={false}
      />,
    );
    expect(html).not.toMatch(/href="\/admin/);
  });
});
