import type { Metadata } from "next";
import { getGoogleNewsSettings } from "./actions";
import { GoogleNewsSettingsClient } from "./GoogleNewsSettingsClient";

export const metadata: Metadata = { title: "Google News" };

export default async function GoogleNewsPluginPage() {
  const settings = await getGoogleNewsSettings();
  return <GoogleNewsSettingsClient initial={settings} />;
}
