"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { MapPin, Search, Locate } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  saveLocationSettings,
  searchCity,
  saveDetectedLocation,
  type WeatherSettings,
} from "./actions";
import type { GeoResult } from "@plugins/weather/types";

interface Props {
  initial: WeatherSettings;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";
const labelCls = "block text-sm font-medium text-slate-700 mb-1.5";
const cardCls = "rounded-xl bg-white border border-slate-200 p-5";

export function SettingsTab({ initial }: Props) {
  const [cityName, setCityName] = useState(initial.cityName);
  const [state, setState] = useState(initial.state);
  const [country, setCountry] = useState(initial.country);
  const [latitude, setLatitude] = useState(initial.latitude);
  const [longitude, setLongitude] = useState(initial.longitude);
  const [units, setUnits] = useState(initial.units);

  const [savePending, startSaveTransition] = useTransition();
  const [searchPending, startSearchTransition] = useTransition();

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<GeoResult[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [detecting, setDetecting] = useState(false);

  function handleSearch() {
    if (!searchQuery.trim()) return;
    startSearchTransition(async () => {
      const results = await searchCity(searchQuery);
      setSearchResults(results);
      setShowResults(true);
    });
  }

  function handleSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSearch();
    }
  }

  function selectCity(result: GeoResult) {
    setCityName(result.name);
    setState(result.admin1 ?? "");
    setCountry(result.country);
    setLatitude(result.latitude);
    setLongitude(result.longitude);
    setShowResults(false);
    setSearchQuery("");
    setSearchResults([]);
  }

  function handleDetectLocation() {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    setDetecting(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setLatitude(lat);
        setLongitude(lon);
        const result = await saveDetectedLocation(lat, lon);
        if (result.ok) {
          setCityName(result.city);
          toast.success(`Location detected: ${result.city}`);
        }
        setDetecting(false);
      },
      (err) => {
        toast.error(`Location detection failed: ${err.message}`);
        setDetecting(false);
      },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startSaveTransition(async () => {
      const result = await saveLocationSettings({
        cityName,
        state,
        country,
        latitude,
        longitude,
        units,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Weather settings saved");
    });
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* ── Location card ───────────────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Location</h3>

          {/* Current location badge */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 mb-4">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <MapPin className="size-4 text-brand-green" />
              {cityName}{state ? `, ${state}` : ""}{country ? `, ${country}` : ""}
            </div>
            <div className="text-xs text-slate-400 mt-0.5">
              {latitude.toFixed(4)}, {longitude.toFixed(4)}
            </div>
          </div>

          {/* City search */}
          <div className="mb-4">
            <label className={labelCls}>Search for a city</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={handleSearchKeyDown}
                placeholder="e.g. London, Tokyo"
                className={inputCls}
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={searchPending || !searchQuery.trim()}
                className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shrink-0 inline-flex items-center gap-1.5"
              >
                <Search className="size-4" />
                {searchPending ? "..." : "Search"}
              </button>
            </div>

            {showResults && searchResults.length > 0 && (
              <div className="mt-2 rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 overflow-hidden">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectCity(r)}
                    className="w-full text-left px-4 py-2.5 hover:bg-brand-light-green/30 transition-colors"
                  >
                    <div className="text-sm font-medium text-slate-900">
                      {r.name}
                      {r.admin1 && <span className="text-slate-500">, {r.admin1}</span>}
                    </div>
                    <div className="text-xs text-slate-400">{r.country}</div>
                  </button>
                ))}
              </div>
            )}
            {showResults && searchResults.length === 0 && !searchPending && (
              <p className="mt-2 text-sm text-slate-400">No cities found.</p>
            )}
          </div>

          {/* Detect location */}
          <button
            type="button"
            onClick={handleDetectLocation}
            disabled={detecting}
            className="inline-flex items-center gap-2 h-9 px-4 rounded-lg border border-slate-200 bg-white text-slate-600 font-medium text-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
          >
            <Locate className={`size-4 ${detecting ? "animate-pulse" : ""}`} />
            {detecting ? "Detecting..." : "Detect my location"}
          </button>
          <p className="mt-1 text-xs text-slate-400">
            Uses your browser&apos;s location.
          </p>
        </div>

        {/* ── Preferences card ────────────────────────────────────── */}
        <div className={cardCls}>
          <h3 className="text-sm font-semibold text-slate-900 mb-4">Preferences</h3>

          <div>
            <label className={labelCls}>Temperature unit</label>
            <Select value={units} onValueChange={(v) => { if (v) setUnits(v as "fahrenheit" | "celsius"); }}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {units === "fahrenheit" ? "Fahrenheit (°F)" : "Celsius (°C)"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fahrenheit">Fahrenheit (°F)</SelectItem>
                <SelectItem value="celsius">Celsius (°C)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

      </div>

      {/* Save */}
      <div className="mt-5">
        <button
          type="submit"
          disabled={savePending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {savePending ? "Saving..." : "Save"}
        </button>
      </div>
    </form>
  );
}
