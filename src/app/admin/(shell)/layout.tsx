import { auth } from "@core/auth";
import { checkSessionFreshness } from "@core/auth/freshness";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AdminShellProvider } from "@core/components/AdminShellContext";
import { SIDEBAR_COOKIE } from "@core/components/admin-shell-cookie";
import { AdminTopNav } from "@core/components/AdminTopNav";
import { AdminSideNav, type PluginNavItem } from "@core/components/AdminSideNav";
import { discoveredPlugins } from "@/generated/plugins";
import { AdminMainArea } from "@core/components/AdminMainArea";
import { MaintenanceBanner } from "@core/components/MaintenanceBanner";
import { db } from "@core/db/instance";
import { ensureSync } from "@core/db/client";
import { getAdminShellState } from "@core/auth/user-session-cache";
import { getEnabledPluginSlugs } from "@core/plugins/enabled-cache";
import { getMaintenanceState } from "@core/maintenance";
import { getEffectivePermissions } from "@core-plugins/users/permissions";
import { getSetting } from "@core-plugins/settings/registry";
import {
  DEFAULT_DATE_FORMAT,
  DEFAULT_TIME_FORMAT,
  DEFAULT_TIMEZONE,
  type DateFormat,
  type TimeFormat,
} from "@core/datetime";
import { Toaster } from "@/components/ui/sonner";
import { ProcessingIndicator } from "@core/components/ProcessingIndicator";
import { ConfirmProvider } from "@core/components/ConfirmDialog";
import { CommandPaletteProvider } from "@core/components/CommandPalette";
import { AdminBreadcrumbBar } from "@core/components/AdminBreadcrumbBar";

// Every admin page is auth-gated and DB-dependent — never statically render.
export const dynamic = "force-dynamic";

export default async function AdminShellLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  // Defense in depth — middleware should already have redirected.
  if (!session?.user) {
    redirect("/admin/login");
  }

  await ensureSync();

  // Soft session-expiry + revocation gate. NextAuth's maxAge is 1 year so
  // the cookie signature stays valid; the real lifetime lives in
  // security.session_max_age_days and is enforced here.
  const freshness = await checkSessionFreshness(db(), {
    userId: session.user.id,
    iat: session.user.iat ?? null,
  });
  if (!freshness.ok) {
    // Bounce through the force-logout route handler — server-component
    // layouts can't delete cookies, so we hand off to a route handler that
    // clears the JWT cookie before sending the user to the login page.
    redirect(`/admin/force-logout?reason=${freshness.reason}`);
  }

  const maintenance = await getMaintenanceState(db());

  const permissions = Array.from(
    await getEffectivePermissions(db(), session.user.roles ?? []),
  );

  // Display-format triple read once and pushed into AdminShellProvider so
  // every client component can render dates with a pinned locale (server
  // and client agree → no hydration mismatch) and honor the user's
  // preferred date/time format from System Settings.
  const [displayTimezone, displayDateFormat, displayTimeFormat] = await Promise.all([
    getSetting<string>(db(), "site.timezone"),
    getSetting<DateFormat>(db(), "site.date_format"),
    getSetting<TimeFormat>(db(), "site.time_format"),
  ]);
  const display = {
    dateFormat: displayDateFormat ?? DEFAULT_DATE_FORMAT,
    timeFormat: displayTimeFormat ?? DEFAULT_TIME_FORMAT,
    timezone: displayTimezone ?? DEFAULT_TIMEZONE,
  };

  // Persisted sidebar collapsed state — first paint matches the user's
  // last manual choice so there's no flash from default → saved.
  const cookieStore = await cookies();
  const initialSidebarCollapsed = cookieStore.get(SIDEBAR_COOKIE)?.value === "collapsed";

  // Avatar comes from the same cached read used by the freshness gate
  // (`user-session-cache.ts`) — one cached query per user instead of three.
  const adminShellState = await getAdminShellState(db(), session.user.id);
  const avatarUrl = adminShellState.avatarUrl;

  // Build dynamic plugin nav items by reading the `admin` block off each
  // enabled non-system plugin's manifest. The manifest schema requires
  // this block whenever `capabilities.registers_admin_menu === true`, so
  // any plugin that opts in is guaranteed to carry the label + icon.
  const adminPresenceMap = new Map<string, { label: string; icon: string }>();
  for (const entry of discoveredPlugins) {
    // Themes share the discovery pipeline but are managed under /admin/themes —
    // never let one bleed into the Plugins sidebar group.
    if (entry.manifest.type === "theme") continue;
    const isCore = entry.migrationsDir?.startsWith("src/core-plugins/") ?? true;
    if (isCore) continue;
    if (entry.manifest.capabilities.registers_admin_menu !== true) continue;
    if (!entry.manifest.admin) continue;
    adminPresenceMap.set(entry.manifest.slug, entry.manifest.admin);
  }

  let pluginNavItems: PluginNavItem[] = [];
  try {
    const enabledSlugs = await getEnabledPluginSlugs(db());
    pluginNavItems = enabledSlugs
      .map((slug) => {
        const presence = adminPresenceMap.get(slug);
        if (!presence) return null;
        return {
          label: presence.label,
          href: `/admin/plugins/${slug}`,
          icon: presence.icon,
        };
      })
      .filter((item): item is PluginNavItem => item !== null);
  } catch {
    // Non-fatal — sidebar works without plugin items
  }

  return (
    <TooltipProvider delay={200}>
      <ConfirmProvider>
      <AdminShellProvider display={display} initialSidebarCollapsed={initialSidebarCollapsed}>
      <CommandPaletteProvider>
        <div className="min-h-screen bg-slate-50 text-slate-900">
          <AdminTopNav
            user={{
              name: session.user.name,
              email: session.user.email,
              avatarUrl,
            }}
            permissions={permissions}
          />
          <AdminSideNav
            pluginNavItems={pluginNavItems}
            isAdmin={session.user.roles?.includes("admin") ?? false}
            permissions={permissions}
          />
          <AdminMainArea>
            <MaintenanceBanner state={maintenance} />
            <div className="sticky top-14 z-30 bg-slate-50/85 backdrop-blur border-b border-slate-200">
              <AdminBreadcrumbBar />
            </div>
            <div className="px-6 py-8">{children}</div>
          </AdminMainArea>
          <Toaster position="bottom-right" richColors />
          <ProcessingIndicator />
        </div>
      </CommandPaletteProvider>
      </AdminShellProvider>
      </ConfirmProvider>
    </TooltipProvider>
  );
}
