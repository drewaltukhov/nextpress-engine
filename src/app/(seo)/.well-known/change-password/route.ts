// W3C "A Well-Known URL for Changing Passwords" —
// https://w3c.github.io/webappsec-change-password-url/
// Password managers and 1Password / iCloud Keychain hit this URL when
// a user opts to rotate a stored credential; the standard expects a
// 302/303 redirect to the actual change-password UI. NextPress doesn't
// have an in-app "change password while logged in" surface yet, so the
// forgot-password flow (which sends a reset email regardless of login
// state) is the closest stable target.
export function GET() {
  return new Response(null, {
    status: 303,
    headers: { Location: "/admin/forgot-password" },
  });
}
