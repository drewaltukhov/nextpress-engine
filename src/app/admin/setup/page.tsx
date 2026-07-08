import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Logo } from "@core/components/Logo";
import { createDbClient } from "@core/db/client";
import { readEnv } from "@core/env";
import { isSetupComplete } from "@core/setup/status";
import { ENGINE_VERSION } from "@core/version";
import { SetupWizard } from "./SetupWizard";

export const metadata: Metadata = { title: "Setup — NextPress" };

// Setup state lives in the database, so this page can never be safely
// prerendered — at build time the schema may not exist yet.
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  // Defense-in-depth: redirect if setup already done (middleware also guards).
  const env = readEnv();
  const db = createDbClient({ databaseUrl: env.databaseUrl, authToken: env.authToken });
  if (await isSetupComplete(db)) {
    redirect("/admin");
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-white text-slate-900">
      {/* Brand panel — matches login page */}
      <aside className="relative hidden lg:flex flex-col justify-between bg-brand-navy text-white p-12 overflow-hidden">
        <div
          aria-hidden
          className="absolute -right-10 -bottom-10 font-display font-medium text-[32rem] leading-none text-brand-green/15 select-none pointer-events-none"
        >
          {"}"}
        </div>

        <header className="relative">
          <a href="/" className="inline-flex items-center text-white">
            <Logo className="h-9 w-auto" />
          </a>
        </header>

        <div className="relative max-w-md">
          <p className="font-display text-4xl leading-[1.1] tracking-tight">
            Welcome to NextPress.
          </p>
          <p className="mt-6 text-sm text-white/60 leading-relaxed">
            Let&apos;s get your site up and running. This wizard will walk you
            through the essentials — you can always change these settings later.
          </p>
        </div>

        <footer className="relative text-sm text-white/40 tracking-wide">v{ENGINE_VERSION}</footer>
      </aside>

      {/* Setup panel */}
      <main className="flex flex-col justify-center px-6 py-16 sm:px-12">
        <div className="mx-auto w-full max-w-md">
          <div className="lg:hidden mb-10 text-brand-navy">
            <Logo className="h-8 w-auto" />
          </div>

          <h1 className="font-display text-4xl tracking-tight text-brand-navy">
            Setup
          </h1>
          <p className="mt-2 text-base text-slate-500 mb-8">
            Configure your site in a few quick steps.
          </p>

          <SetupWizard />
        </div>
      </main>
    </div>
  );
}
