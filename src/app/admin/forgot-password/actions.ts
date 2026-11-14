"use server";

import { db } from "@core/db/instance";
import { processSelfPasswordReset } from "@core-plugins/users/self-reset";
import { getClientIp } from "@core/net/client-ip";
import { resolveSiteUrl } from "@core/site-url";
import { headers } from "next/headers";
import { after } from "next/server";

async function getAppOrigin(): Promise<string> {
  const envUrl = process.env.AUTH_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  // Never build the emailed reset link from the request `Host` header in
  // production: an attacker can forge it and poison the link sent to the
  // victim (reset-link poisoning / token theft). Fall back to the trusted
  // site URL (`site.url` setting, then Vercel's production URL env), and
  // fail closed when there is none.
  if (process.env.NODE_ENV === "production") {
    const siteUrl = await resolveSiteUrl(db());
    if (siteUrl) return siteUrl;
    throw new Error("AUTH_URL or site.url must be set in production to build reset links");
  }
  const h = await headers();
  const host = h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? "http";
  return `${proto}://${host}`;
}

// Self-service password reset request. Always returns { ok: true }, and returns
// it before any account lookup: the lookup, rate limits, token and email all
// run detached in processSelfPasswordReset, so a registered address can't be
// told apart from an unknown one by the answer or its timing (security audit
// 2026-11-12). Request headers are read here, while the request is in scope.
// The detached work is registered with `after()` so a serverless host (Vercel)
// keeps the function alive until the email is sent, instead of freezing it
// once the response is out.
export async function requestSelfPasswordReset(email: string): Promise<{ ok: true }> {
  const cleaned = email.trim().toLowerCase();
  if (!cleaned || cleaned.indexOf("@") < 1) return { ok: true };

  const ip = getClientIp(await headers());
  let origin: string;
  try {
    origin = await getAppOrigin();
  } catch {
    return { ok: true };
  }

  after(() =>
    processSelfPasswordReset(db(), { email: cleaned, ip, origin }).catch((err) => {
      console.error("[auth] self-service password reset failed:", err);
    }),
  );
  return { ok: true };
}
