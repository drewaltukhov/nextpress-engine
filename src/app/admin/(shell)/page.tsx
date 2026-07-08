import type { Metadata } from "next";
import { auth } from "@core/auth";
import { db } from "@core/db/instance";
import { resolveUserId } from "@core/auth/resolve-user";
import { getSetting } from "@core-plugins/settings/registry";
import { getEnabledPluginSlugs } from "@core/plugins/enabled-cache";
import { listDashboardWidgets, type DashboardWidget } from "@core/dashboard/registry";
import { getDashboardLayout, packDefaultLayout } from "@core/dashboard/layout";
import { LiveClock, type DateFormat, type TimeFormat } from "@core/components/LiveClock";
import { isSmtpConfigured } from "@core/email/smtp";
import { DashboardGrid, type RenderedWidget } from "./DashboardGrid";
import { SmtpWarning } from "./SmtpWarning";
import { createElement } from "react";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const session = await auth();

  // Decide which registered widgets to render. Plugin widgets are gated
  // by the owning plugin's enabled flag; built-in (`source: "core"`)
  // widgets always render.
  const enabledPlugins = new Set(await getEnabledPluginSlugs(db()));
  enabledPlugins.add("core");

  const allWidgets = listDashboardWidgets();
  const activeWidgets: DashboardWidget<unknown>[] = allWidgets.filter((w) => enabledPlugins.has(w.source));

  // Fetch each widget's data in parallel, alongside the page's own queries.
  const userId = session?.user ? await resolveUserId(db(), session.user) : null;
  const [smtpConfigured, timezone, dateFormat, timeFormat, savedLayout, ...widgetData] =
    await Promise.all([
      isSmtpConfigured(db()),
      getSetting<string>(db(), "site.timezone"),
      getSetting<DateFormat>(db(), "site.date_format"),
      getSetting<TimeFormat>(db(), "site.time_format"),
      userId ? getDashboardLayout(db(), userId) : Promise.resolve(null),
      ...activeWidgets.map((w) =>
        w.fetch ? w.fetch({ db: db(), userId }) : Promise.resolve(undefined as unknown)
      )
    ]);

  // Build the layout: prefer the user's saved one, otherwise auto-pack defaults.
  // Drop any saved entries whose widget is no longer registered/enabled.
  const validSlugs = new Set(activeWidgets.map((w) => w.slug));
  const filteredSaved = (savedLayout ?? []).filter((it) => validSlugs.has(it.slug));
  const knownInLayout = new Set(filteredSaved.map((it) => it.slug));
  const newlyAdded = activeWidgets.filter((w) => !knownInLayout.has(w.slug));
  const layout = filteredSaved.length > 0
    ? [...filteredSaved, ...packDefaultLayout(newlyAdded).map((it) => ({
        ...it,
        // Push newly registered widgets below the saved arrangement.
        y: it.y + Math.max(0, ...filteredSaved.map((s) => s.y + s.h))
      }))]
    : packDefaultLayout(activeWidgets);

  const renderedWidgets: RenderedWidget[] = activeWidgets.map((w, i) => {
    const geo = layout.find((it) => it.slug === w.slug)!;
    return {
      slug: w.slug,
      title: w.title,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      body: createElement(w.Component as any, { data: widgetData[i] }),
      headerActions: w.HeaderActions ? createElement(w.HeaderActions) : undefined,
      layout: { x: geo.x, y: geo.y, w: geo.w, h: geo.h },
      minSize: w.minSize,
      maxSize: w.maxSize
    };
  });

  const name = session?.user?.name ?? "there";
  const email = session?.user?.email ?? "";
  const roles = session?.user?.roles ?? [];

  return (
    <>
      {!smtpConfigured && <SmtpWarning />}

      {/* Welcome header */}
      <div className="flex items-baseline justify-between gap-6">
        <div>
          <h1 className="font-display text-4xl tracking-tight text-brand-navy">Dashboard</h1>
          <p className="mt-1.5 text-sm text-slate-500">
            Welcome back, <span className="text-slate-700 font-medium">{name}</span> ·{" "}
            <code className="font-mono text-[12px] text-slate-500">{email}</code>
          </p>
          {roles.length > 0 && (
            <p className="mt-1 text-sm text-slate-400">
              Roles:{" "}
              {roles.map((r) => (
                <span
                  key={r}
                  className="inline-block ml-1 first:ml-0 px-1.5 py-0.5 rounded bg-brand-light-green text-brand-navy font-medium text-[10px] uppercase tracking-wider"
                >
                  {r}
                </span>
              ))}
            </p>
          )}
        </div>
        <LiveClock
          timezone={timezone || "UTC"}
          dateFormat={(dateFormat as DateFormat) || "MMM d, yyyy"}
          timeFormat={(timeFormat as TimeFormat) || "12h"}
          className="text-sm text-slate-400 whitespace-nowrap font-mono tabular-nums"
        />
      </div>

      {/* Single 12-col grid — every panel is a widget. */}
      <div className="mt-6">
        <DashboardGrid widgets={renderedWidgets} />
      </div>
    </>
  );
}
