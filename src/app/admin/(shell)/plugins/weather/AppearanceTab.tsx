"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveAppearanceSettings,
  type WeatherSettings,
  type LocationFormat,
} from "./actions";

interface Props {
  initial: WeatherSettings;
}

const FORMAT_LABELS: Record<LocationFormat, string> = {
  city: "City only",
  city_state: "City, State",
  city_country: "City, Country",
};

const cardCls = "rounded-xl bg-white border border-slate-200 p-5";
const labelCls = "block text-sm font-medium text-slate-700 mb-1.5";

function formatPreview(s: WeatherSettings, fmt: LocationFormat): string {
  switch (fmt) {
    case "city_state":
      return s.state ? `${s.cityName}, ${s.state}` : s.cityName;
    case "city_country":
      return s.country ? `${s.cityName}, ${s.country}` : s.cityName;
    default:
      return s.cityName;
  }
}

export function AppearanceTab({ initial }: Props) {
  const [showIcons, setShowIcons] = useState(initial.showIcons);
  const [locationFormat, setLocationFormat] = useState<LocationFormat>(initial.locationFormat);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveAppearanceSettings({ showIcons, locationFormat });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Appearance settings saved");
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Widget display card ─────────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Widget Display</h3>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-700">Weather icons</div>
              <div className="text-xs text-slate-500">
                Show emoji icons on the dashboard widget.
              </div>
            </div>
            <Switch checked={showIcons} onCheckedChange={setShowIcons} />
          </div>
        </div>

        {/* ── Location format card ────────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Location Format</h3>

          <div>
            <label className={labelCls}>Display format</label>
            <Select
              value={locationFormat}
              onValueChange={(v) => { if (v) setLocationFormat(v as LocationFormat); }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{FORMAT_LABELS[locationFormat]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="city">City only</SelectItem>
                <SelectItem value="city_state">City, State</SelectItem>
                <SelectItem value="city_country">City, Country</SelectItem>
              </SelectContent>
            </Select>
            <p className="mt-2 text-sm text-slate-500">
              Preview: <span className="font-medium text-slate-700">{formatPreview(initial, locationFormat)}</span>
            </p>
          </div>
        </div>

      </div>

      {/* Save */}
      <div className="mt-5">
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
