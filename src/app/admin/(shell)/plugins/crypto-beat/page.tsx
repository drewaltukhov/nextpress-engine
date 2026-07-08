import type { Metadata } from "next";
import { getCryptoBeatSettings } from "./actions";
import { CryptoBeatSettingsClient } from "./CryptoBeatSettingsClient";

export const metadata: Metadata = { title: "Crypto Beat" };

export default async function CryptoBeatPluginPage() {
  const settings = await getCryptoBeatSettings();
  return <CryptoBeatSettingsClient initial={settings} />;
}
