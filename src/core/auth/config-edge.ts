/**
 * Edge-safe NextAuth config. Imported by proxy.ts (Edge runtime) — must
 * NOT touch node:fs / @libsql/client / argon2 / any Node-only module. The full
 * Node-runtime config (with the credentials provider that hits the DB) lives
 * in ./config.ts.
 */
import type { NextAuthConfig } from "next-auth";

// JWT signature stays valid for up to a year — the actual session lifetime
// is enforced softly in the admin shell layout against
// security.session_max_age_days. Setting maxAge here just gives the soft
// gate enough headroom (the form caps the setting at 365).
const ONE_YEAR_SECONDS = 365 * 24 * 60 * 60;

export const authConfigEdge = {
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: ONE_YEAR_SECONDS
  },
  pages: {
    signIn: "/admin/login",
    error: "/admin/login"
  },
  providers: [],
  callbacks: {
    async session({ session, token }) {
      if (token.sub) {
        session.user = {
          ...session.user,
          id: token.sub,
          email: String(token.email ?? ""),
          name: String(token.name ?? ""),
          roles: Array.isArray(token.roles) ? (token.roles as string[]) : [],
          emailVerifiedAt: (token.emailVerifiedAt as string | null) ?? null,
          status: String(token.status ?? ""),
          iat: typeof token.iat === "number" ? token.iat : null
        } as unknown as typeof session.user;
      }
      return session;
    }
  }
} satisfies NextAuthConfig;
