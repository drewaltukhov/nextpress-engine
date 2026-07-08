/**
 * Built-in dashboard widgets.
 *
 * Plugins register their own widgets via the plugin API
 * (`api.dashboard.registerWidget`). The engine itself ships a small set
 * of always-on widgets; this module is invoked once during bootEngine
 * so the registry has them before the first dashboard render.
 */
import { registerDashboardWidget } from "../registry";
import { systemHealthWidget } from "./system-health";
import { recentActivityWidget } from "./recent-activity";

export function registerBuiltInDashboardWidgets(): void {
  registerDashboardWidget(systemHealthWidget);
  registerDashboardWidget(recentActivityWidget);
}
