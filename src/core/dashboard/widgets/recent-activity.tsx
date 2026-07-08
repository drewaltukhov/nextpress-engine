import {
  Activity,
  ArchiveRestore,
  AtSign,
  Download,
  Edit3,
  FileText,
  Globe,
  Image as ImageIcon,
  ImageOff,
  Key,
  KeyRound,
  LogIn,
  LogOut,
  Mail,
  Newspaper,
  Palette,
  Plug,
  PlugZap,
  RotateCcw,
  Search as SearchIcon,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
  ShieldX,
  Trash2,
  UserCheck,
  UserCog,
  UserMinus,
  UserPlus,
  UserX,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import type { DbClient } from "@core/db/client";
import { timeAgo } from "@core/datetime";

interface ActivityRow {
  verb: string;
  /** Optional title pulled from `diff` JSON (page/post/theme name) —
   *  rendered in quotes after the verb so the feed reads
   *  `Drew published a page "Lorem Ipsum"` instead of just
   *  `Drew published a page`. */
  title: string | null;
  Icon: LucideIcon;
  actorName: string | null;
  createdAt: string;
}

interface RecentActivityData {
  rows: ActivityRow[];
}

const ACTION_LABELS: Record<string, string> = {
  "auth.login.success": "signed in",
  "auth.logout": "signed out",
  "auth.session.revoked": "revoked a session",
  "users.create": "created a user",
  "users.update": "updated a user",
  "users.delete": "deleted a user",
  "users.enable": "enabled a user",
  "users.disable": "disabled a user",
  "users.email_change_bootstrap": "started an email change",
  "users.password_reset_requested": "requested a password reset",
  "users.password_reset_completed": "reset their password",
  "roles.permission_grant": "granted a permission",
  "roles.permission_revoke": "revoked a permission",
  "media.upload": "uploaded a media file",
  "media.delete": "deleted a media file",
  "backup.created": "created a backup",
  "backup.restored": "restored from backup",
  "logs.purged": "purged all logs",
  "settings.maintenance.update": "changed maintenance settings",
  "settings.logging.update": "changed log settings",
  "settings.api.update": "changed API settings",
  // Pages
  "pages.created": "created a page",
  "pages.updated": "edited a page",
  "pages.seoUpdated": "updated page SEO",
  "pages.published": "published a page",
  "pages.unpublished": "unpublished a page",
  "pages.trashed": "moved a page to trash",
  "pages.restored": "restored a page",
  "pages.purged": "permanently deleted a page",
  // Posts
  "posts.created": "created a post",
  "posts.updated": "edited a post",
  "posts.seoUpdated": "updated post SEO",
  "posts.published": "published a post",
  "posts.unpublished": "unpublished a post",
  "posts.trashed": "moved a post to trash",
  "posts.restored": "restored a post",
  "posts.purged": "permanently deleted a post",
  // Themes
  "themes.activated": "activated theme",
  "themes.deactivated": "deactivated the active theme",
  "themes.builder.saved": "saved theme layout",
  "themes.builder.defaults_restored": "restored theme defaults",
};

const SETTINGS_CHANGED_LABELS: Record<string, string> = {
  "security.country": "changed country access",
  "weather": "changed weather settings",
  "crypto-beat": "changed Crypto Beat settings",
  "media": "changed Media settings",
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function activityVerb(action: string, targetId: string | null): string | null {
  if (action === "plugin.enabled") return targetId ? `enabled the ${capitalize(targetId)} plugin` : null;
  if (action === "plugin.disabled") return targetId ? `disabled the ${capitalize(targetId)} plugin` : null;
  if (action === "plugin.deleted") return targetId ? `removed the ${capitalize(targetId)} plugin` : null;

  if (action === "settings.changed") {
    if (targetId && SETTINGS_CHANGED_LABELS[targetId]) return SETTINGS_CHANGED_LABELS[targetId];
    if (targetId) return `changed ${capitalize(targetId)} settings`;
    return null;
  }
  if (ACTION_LABELS[action]) return ACTION_LABELS[action];
  return null;
}

function activityIcon(action: string, targetId: string | null): LucideIcon {
  switch (action) {
    case "auth.login.success": return LogIn;
    case "auth.logout": return LogOut;
    case "auth.session.revoked": return ShieldX;
    case "users.create": return UserPlus;
    case "users.update": return UserCog;
    case "users.delete": return UserMinus;
    case "users.enable": return UserCheck;
    case "users.disable": return UserX;
    case "users.email_change_bootstrap": return AtSign;
    case "users.password_reset_requested": return Mail;
    case "users.password_reset_completed": return KeyRound;
    case "roles.permission_grant": return ShieldCheck;
    case "roles.permission_revoke": return ShieldX;
    case "media.upload": return ImageIcon;
    case "media.delete": return ImageOff;
    case "backup.created": return Download;
    case "backup.restored": return RotateCcw;
    case "logs.purged": return Trash2;
    case "plugin.enabled": return PlugZap;
    case "plugin.disabled": return Plug;
    case "plugin.deleted": return Trash2;
    case "settings.maintenance.update": return Wrench;
    case "settings.logging.update": return FileText;
    case "settings.api.update": return Key;
    case "pages.created": return FileText;
    case "pages.updated": return Edit3;
    case "pages.seoUpdated": return SearchIcon;
    case "pages.published": return Send;
    case "pages.unpublished": return ArchiveRestore;
    case "pages.trashed": return Trash2;
    case "pages.restored": return ArchiveRestore;
    case "pages.purged": return Trash2;
    case "posts.created": return Newspaper;
    case "posts.updated": return Edit3;
    case "posts.seoUpdated": return SearchIcon;
    case "posts.published": return Send;
    case "posts.unpublished": return ArchiveRestore;
    case "posts.trashed": return Trash2;
    case "posts.restored": return ArchiveRestore;
    case "posts.purged": return Trash2;
    case "themes.activated": return Palette;
    case "themes.deactivated": return Palette;
    case "themes.builder.saved": return Palette;
    case "themes.builder.defaults_restored": return RotateCcw;
  }
  if (action === "settings.changed") {
    if (targetId === "security.country") return Globe;
    if (targetId === "media") return ImageIcon;
    return SettingsIcon;
  }
  return Activity;
}

/** Pull a human-readable name out of the audit-log diff JSON, or
 *  null when nothing useful is in there. Recent-activity rows mirror
 *  the precedence the full activity-log reader uses:
 *  `title` → `name` → `display_name` (so we cover pages/posts,
 *  themes, and user-targeted actions consistently). */
function diffTitle(diff: string | null): string | null {
  if (!diff) return null;
  try {
    const parsed = JSON.parse(diff);
    if (parsed && typeof parsed === "object") {
      if (typeof parsed.title === "string" && parsed.title.length > 0) {
        return parsed.title;
      }
      if (typeof parsed.name === "string" && parsed.name.length > 0) {
        return parsed.name;
      }
      if (
        typeof parsed.display_name === "string" &&
        parsed.display_name.length > 0
      ) {
        return parsed.display_name;
      }
    }
  } catch {
    // diff isn't JSON — ignore
  }
  return null;
}

async function fetchRecentActivity({ db }: { db: DbClient }): Promise<RecentActivityData> {
  // Pull more than we display — many rows get filtered when their action
  // doesn't map to a clean verb.
  const res = await db.execute({
    sql: `SELECT a.action, a.created_at, a.target_id, a.diff, u.display_name
          FROM audit_log a
          LEFT JOIN users u ON u.id = a.actor_user_id
          WHERE a.tenant_id = 1
          ORDER BY a.created_at DESC
          LIMIT 30`,
    args: [],
  });

  const rows: ActivityRow[] = res.rows
    .map((r) => {
      const action = String(r.action);
      const targetId = r.target_id ? String(r.target_id) : null;
      const verb = activityVerb(action, targetId);
      if (!verb) return null;
      return {
        verb,
        title: diffTitle(r.diff != null ? String(r.diff) : null),
        Icon: activityIcon(action, targetId),
        actorName: r.display_name ? String(r.display_name) : null,
        createdAt: String(r.created_at),
      };
    })
    .filter((r): r is ActivityRow => r !== null)
    .slice(0, 6);

  return { rows };
}

function RecentActivityWidget({ data }: { data: RecentActivityData }) {
  if (data.rows.length === 0) {
    return <p className="text-sm text-slate-400 italic">No recent activity</p>;
  }
  return (
    <div className="space-y-0">
      {data.rows.map((a, i) => (
        <div
          key={i}
          className="flex items-baseline gap-2 py-1.5 border-b border-slate-50 last:border-0 text-sm"
        >
          <a.Icon className="size-3.5 text-slate-400 shrink-0 self-center" />
          <span className="text-slate-600 truncate flex-1 min-w-0">
            <span className="font-semibold text-brand-navy">{a.actorName ?? "System"}</span>{" "}
            {a.verb}
            {a.title ? (
              <>
                {" "}
                <span className="font-medium text-brand-navy">&ldquo;{a.title}&rdquo;</span>
              </>
            ) : null}
          </span>
          <span className="text-slate-400 shrink-0" suppressHydrationWarning>
            {timeAgo(a.createdAt)}
          </span>
        </div>
      ))}
    </div>
  );
}

export const recentActivityWidget = {
  slug: "core.recent-activity",
  source: "core" as const,
  title: "Recent Activity",
  defaultSize: { w: 4, h: 5 },
  minSize: { w: 3 },
  maxSize: { w: 12, h: 12 },
  fetch: fetchRecentActivity,
  Component: RecentActivityWidget,
};
