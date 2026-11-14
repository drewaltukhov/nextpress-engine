import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authenticateWithCredentials, recordSuccessfulLogin } from "./services";
import { authConfigEdge } from "./config-edge";
import { getClientIp } from "@core/net/client-ip";
import { db } from "@core/db/instance";
import { checkSessionFreshness } from "./freshness";

export const authConfig: NextAuthConfig = {
  ...authConfigEdge,
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" }
      },
      async authorize(raw, request) {
        const email = typeof raw?.email === "string" ? raw.email : "";
        const password = typeof raw?.password === "string" ? raw.password : "";
        const headers = (request as Request | undefined)?.headers;
        // `0.0.0.0` from getClientIp means "no header was set" — use null
        // here so audit log entries record absence rather than a sentinel
        // address.
        let ipAddress: string | null = null;
        if (headers) {
          const extracted = getClientIp(headers);
          ipAddress = extracted === "0.0.0.0" ? null : extracted;
        }
        const userAgent = headers?.get("user-agent") ?? null;

        const user = await authenticateWithCredentials(email, password, { ipAddress, userAgent });
        if (!user) return null;
        await recordSuccessfulLogin(user.id, { ipAddress, userAgent });
        return {
          id: user.id,
          email: user.email,
          name: user.displayName,
          roles: user.roles,
          emailVerifiedAt: user.emailVerifiedAt,
          status: user.status
        } as unknown as import("next-auth").User;
      }
    })
  ],
  callbacks: {
    ...authConfigEdge.callbacks,
    async jwt({ token, user }) {
      if (user) {
        const u = user as unknown as {
          id: string;
          email: string;
          name: string;
          roles: string[];
          emailVerifiedAt: string | null;
          status: string;
        };
        token.sub = u.id;
        token.email = u.email;
        token.name = u.name;
        token.roles = u.roles;
        token.emailVerifiedAt = u.emailVerifiedAt;
        token.status = u.status;
        // Immutable login time. Auth.js may re-stamp `iat` whenever it
        // re-encodes the cookie, so revocation and max-age must not use it.
        token.authTime = Math.floor(Date.now() / 1000);
        return token;
      }
      // Every later session read re-validates against the database, so a
      // revoked, expired, disabled, deleted or demoted session is refused by
      // every server action and route, not only the admin shell layout.
      // Returning null ends the session. Tokens minted before authTime
      // existed fail here once and must sign in again.
      if (!token.sub) return null;
      const fresh = await checkSessionFreshness(db(), {
        userId: token.sub,
        iat: typeof token.authTime === "number" ? token.authTime : null,
      });
      if (!fresh.ok) return null;
      if (fresh.roles) token.roles = fresh.roles;
      return token;
    }
  }
};
