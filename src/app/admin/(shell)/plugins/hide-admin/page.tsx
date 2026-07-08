import type { Metadata } from "next";
import { getHideAdminSettings } from "./actions";
import { HideAdminSettingsClient } from "./HideAdminSettingsClient";

export const metadata: Metadata = { title: "Hide Admin" };

export default async function HideAdminPluginPage() {
  const settings = await getHideAdminSettings();
  return <HideAdminSettingsClient initial={settings} />;
}
