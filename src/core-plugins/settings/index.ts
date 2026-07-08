import type { PluginAPI } from "@core/plugins/api";
import { registerCoreSettingDefinitions } from "./definitions";

/**
 * Settings core-plugin — site_settings registry with Zod validation,
 * autoload caching, and AES-256-GCM encryption for sensitive values.
 *
 * Phase 6 surfaces:
 *  - defineSettings() — plugin registration of settings with schema + metadata
 *  - getSetting() / setSetting() — validated read/write with encryption support
 *  - loadAutoloadCache() — memory cache for boot-time settings
 */
export default function register(_api: PluginAPI): void {
  registerCoreSettingDefinitions();
}

export {
  defineSettings,
  getDefinition,
  listDefinitions,
  listGroups,
  loadAutoloadCache,
  getSetting,
  setSetting,
  deleteSetting,
  _resetRegistry,
  type SettingDefinition
} from "./registry";

export { encrypt, decrypt, type EncryptedPayload } from "./crypto";
