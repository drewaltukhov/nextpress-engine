import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/admin/force-logout/route";

// Behind the Dokploy/Traefik proxy, `req.url` is the container's internal
// origin (http://localhost:3000). An absolute redirect built from it sent
// live users to https://localhost:3000/admin/login.
describe("GET /admin/force-logout", () => {
  it("redirects with a relative Location, never the internal origin", async () => {
    const req = new NextRequest("http://localhost:3000/admin/force-logout?reason=expired");
    const res = await GET(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("/admin/login?reason=expired");
  });

  it("defaults the reason to expired and still clears the session cookie", async () => {
    const res = await GET(new NextRequest("http://localhost:3000/admin/force-logout"));
    expect(res.headers.get("location")).toBe("/admin/login?reason=expired");
    expect(res.headers.get("set-cookie")).toContain("authjs.session-token=");
  });
});
