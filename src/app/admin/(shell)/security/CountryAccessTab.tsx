"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { X, Search } from "lucide-react";
import { saveCountrySettings, type CountryMode, type CountrySettings } from "./actions";

// ---------------------------------------------------------------------------
// Country data — flag emoji from ISO code + common country names
// ---------------------------------------------------------------------------

const COUNTRIES: { code: string; name: string; flag: string }[] = [
  { code: "AF", name: "Afghanistan", flag: "\u{1F1E6}\u{1F1EB}" },
  { code: "AL", name: "Albania", flag: "\u{1F1E6}\u{1F1F1}" },
  { code: "DZ", name: "Algeria", flag: "\u{1F1E9}\u{1F1FF}" },
  { code: "AR", name: "Argentina", flag: "\u{1F1E6}\u{1F1F7}" },
  { code: "AU", name: "Australia", flag: "\u{1F1E6}\u{1F1FA}" },
  { code: "AT", name: "Austria", flag: "\u{1F1E6}\u{1F1F9}" },
  { code: "BD", name: "Bangladesh", flag: "\u{1F1E7}\u{1F1E9}" },
  { code: "BY", name: "Belarus", flag: "\u{1F1E7}\u{1F1FE}" },
  { code: "BE", name: "Belgium", flag: "\u{1F1E7}\u{1F1EA}" },
  { code: "BR", name: "Brazil", flag: "\u{1F1E7}\u{1F1F7}" },
  { code: "BG", name: "Bulgaria", flag: "\u{1F1E7}\u{1F1EC}" },
  { code: "CA", name: "Canada", flag: "\u{1F1E8}\u{1F1E6}" },
  { code: "CL", name: "Chile", flag: "\u{1F1E8}\u{1F1F1}" },
  { code: "CN", name: "China", flag: "\u{1F1E8}\u{1F1F3}" },
  { code: "CO", name: "Colombia", flag: "\u{1F1E8}\u{1F1F4}" },
  { code: "HR", name: "Croatia", flag: "\u{1F1ED}\u{1F1F7}" },
  { code: "CZ", name: "Czechia", flag: "\u{1F1E8}\u{1F1FF}" },
  { code: "DK", name: "Denmark", flag: "\u{1F1E9}\u{1F1F0}" },
  { code: "EG", name: "Egypt", flag: "\u{1F1EA}\u{1F1EC}" },
  { code: "EE", name: "Estonia", flag: "\u{1F1EA}\u{1F1EA}" },
  { code: "FI", name: "Finland", flag: "\u{1F1EB}\u{1F1EE}" },
  { code: "FR", name: "France", flag: "\u{1F1EB}\u{1F1F7}" },
  { code: "DE", name: "Germany", flag: "\u{1F1E9}\u{1F1EA}" },
  { code: "GR", name: "Greece", flag: "\u{1F1EC}\u{1F1F7}" },
  { code: "HK", name: "Hong Kong", flag: "\u{1F1ED}\u{1F1F0}" },
  { code: "HU", name: "Hungary", flag: "\u{1F1ED}\u{1F1FA}" },
  { code: "IN", name: "India", flag: "\u{1F1EE}\u{1F1F3}" },
  { code: "ID", name: "Indonesia", flag: "\u{1F1EE}\u{1F1E9}" },
  { code: "IR", name: "Iran", flag: "\u{1F1EE}\u{1F1F7}" },
  { code: "IQ", name: "Iraq", flag: "\u{1F1EE}\u{1F1F6}" },
  { code: "IE", name: "Ireland", flag: "\u{1F1EE}\u{1F1EA}" },
  { code: "IL", name: "Israel", flag: "\u{1F1EE}\u{1F1F1}" },
  { code: "IT", name: "Italy", flag: "\u{1F1EE}\u{1F1F9}" },
  { code: "JP", name: "Japan", flag: "\u{1F1EF}\u{1F1F5}" },
  { code: "KZ", name: "Kazakhstan", flag: "\u{1F1F0}\u{1F1FF}" },
  { code: "KE", name: "Kenya", flag: "\u{1F1F0}\u{1F1EA}" },
  { code: "KR", name: "South Korea", flag: "\u{1F1F0}\u{1F1F7}" },
  { code: "LV", name: "Latvia", flag: "\u{1F1F1}\u{1F1FB}" },
  { code: "LT", name: "Lithuania", flag: "\u{1F1F1}\u{1F1F9}" },
  { code: "MY", name: "Malaysia", flag: "\u{1F1F2}\u{1F1FE}" },
  { code: "MX", name: "Mexico", flag: "\u{1F1F2}\u{1F1FD}" },
  { code: "MA", name: "Morocco", flag: "\u{1F1F2}\u{1F1E6}" },
  { code: "NL", name: "Netherlands", flag: "\u{1F1F3}\u{1F1F1}" },
  { code: "NZ", name: "New Zealand", flag: "\u{1F1F3}\u{1F1FF}" },
  { code: "NG", name: "Nigeria", flag: "\u{1F1F3}\u{1F1EC}" },
  { code: "KP", name: "North Korea", flag: "\u{1F1F0}\u{1F1F5}" },
  { code: "NO", name: "Norway", flag: "\u{1F1F3}\u{1F1F4}" },
  { code: "PK", name: "Pakistan", flag: "\u{1F1F5}\u{1F1F0}" },
  { code: "PE", name: "Peru", flag: "\u{1F1F5}\u{1F1EA}" },
  { code: "PH", name: "Philippines", flag: "\u{1F1F5}\u{1F1ED}" },
  { code: "PL", name: "Poland", flag: "\u{1F1F5}\u{1F1F1}" },
  { code: "PT", name: "Portugal", flag: "\u{1F1F5}\u{1F1F9}" },
  { code: "RO", name: "Romania", flag: "\u{1F1F7}\u{1F1F4}" },
  { code: "RU", name: "Russia", flag: "\u{1F1F7}\u{1F1FA}" },
  { code: "SA", name: "Saudi Arabia", flag: "\u{1F1F8}\u{1F1E6}" },
  { code: "RS", name: "Serbia", flag: "\u{1F1F7}\u{1F1F8}" },
  { code: "SG", name: "Singapore", flag: "\u{1F1F8}\u{1F1EC}" },
  { code: "SK", name: "Slovakia", flag: "\u{1F1F8}\u{1F1F0}" },
  { code: "ZA", name: "South Africa", flag: "\u{1F1FF}\u{1F1E6}" },
  { code: "ES", name: "Spain", flag: "\u{1F1EA}\u{1F1F8}" },
  { code: "SE", name: "Sweden", flag: "\u{1F1F8}\u{1F1EA}" },
  { code: "CH", name: "Switzerland", flag: "\u{1F1E8}\u{1F1ED}" },
  { code: "TW", name: "Taiwan", flag: "\u{1F1F9}\u{1F1FC}" },
  { code: "TH", name: "Thailand", flag: "\u{1F1F9}\u{1F1ED}" },
  { code: "TR", name: "Turkey", flag: "\u{1F1F9}\u{1F1F7}" },
  { code: "UA", name: "Ukraine", flag: "\u{1F1FA}\u{1F1E6}" },
  { code: "AE", name: "United Arab Emirates", flag: "\u{1F1E6}\u{1F1EA}" },
  { code: "GB", name: "United Kingdom", flag: "\u{1F1EC}\u{1F1E7}" },
  { code: "US", name: "United States", flag: "\u{1F1FA}\u{1F1F8}" },
  { code: "UZ", name: "Uzbekistan", flag: "\u{1F1FA}\u{1F1FF}" },
  { code: "VE", name: "Venezuela", flag: "\u{1F1FB}\u{1F1EA}" },
  { code: "VN", name: "Vietnam", flag: "\u{1F1FB}\u{1F1F3}" },
];

/** Generate flag emoji from 2-letter ISO code */
function flagEmoji(code: string): string {
  const known = COUNTRIES.find((c) => c.code === code);
  if (known) return known.flag;
  // Fallback: generate from regional indicator symbols
  const chars = [...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65);
  return String.fromCodePoint(...chars);
}

function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  initial: CountrySettings;
}

const radioCardCls = (selected: boolean) =>
  `flex-1 cursor-pointer rounded-lg border px-4 py-3 transition-colors ${
    selected
      ? "border-brand-green bg-brand-light-green/30 ring-2 ring-brand-green/30"
      : "border-slate-200 bg-white hover:bg-slate-50"
  }`;

export function CountryAccessTab({ initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<CountryMode>(initial.mode);

  // Parse initial codes into an array of uppercase codes
  const [selectedCodes, setSelectedCodes] = useState<string[]>(() =>
    initial.codes
      .split(/[\n,]/)
      .map((s) => s.trim().toUpperCase())
      .filter((s) => /^[A-Z]{2}$/.test(s))
  );

  const [search, setSearch] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return COUNTRIES.filter(
      (c) =>
        !selectedCodes.includes(c.code) &&
        (c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
    );
  }, [search, selectedCodes]);

  function addCountry(code: string) {
    setSelectedCodes((prev) => [...prev, code]);
    setSearch("");
    setDropdownOpen(false);
  }

  function removeCountry(code: string) {
    setSelectedCodes((prev) => prev.filter((c) => c !== code));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveCountrySettings({
        mode,
        codes: selectedCodes.join("\n"),
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Country access settings saved");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="w-full space-y-5">
      <div className="rounded-xl bg-white border border-slate-200 p-6 space-y-5">
        <div>
          <h3 className="text-base font-medium text-slate-900 mb-1">
            Who can access your site?
          </h3>
          <p className="text-sm text-slate-500">
            Restrict login and API access by country. Based on IP geolocation.
          </p>
        </div>

        {/* Mode radio cards */}
        <div className="flex flex-col sm:flex-row gap-3">
          <label className={radioCardCls(mode === "off")}>
            <input
              type="radio"
              name="country-mode"
              value="off"
              checked={mode === "off"}
              onChange={() => setMode("off")}
              className="sr-only"
            />
            <div className="font-medium text-slate-900">Everyone</div>
            <div className="text-sm text-slate-500">No country restrictions</div>
          </label>
          <label className={radioCardCls(mode === "allowlist")}>
            <input
              type="radio"
              name="country-mode"
              value="allowlist"
              checked={mode === "allowlist"}
              onChange={() => setMode("allowlist")}
              className="sr-only"
            />
            <div className="font-medium text-slate-900">Only these countries</div>
            <div className="text-sm text-slate-500">Block everyone else</div>
          </label>
          <label className={radioCardCls(mode === "denylist")}>
            <input
              type="radio"
              name="country-mode"
              value="denylist"
              checked={mode === "denylist"}
              onChange={() => setMode("denylist")}
              className="sr-only"
            />
            <div className="font-medium text-slate-900">Everyone except these</div>
            <div className="text-sm text-slate-500">Block listed countries</div>
          </label>
        </div>

        {/* Country picker (visible when mode !== off) */}
        {mode !== "off" && (
          <div className="space-y-3">
            {/* Selected tags */}
            {selectedCodes.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedCodes.map((code) => (
                  <span
                    key={code}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-sm text-slate-700"
                  >
                    <span>{flagEmoji(code)}</span>
                    <span>{countryName(code)}</span>
                    <button
                      type="button"
                      onClick={() => removeCountry(code)}
                      className="ml-0.5 text-slate-400 hover:text-slate-700 transition-colors"
                    >
                      <X className="size-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Search input + dropdown */}
            <div className="relative">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search countries..."
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setDropdownOpen(true);
                  }}
                  onFocus={() => setDropdownOpen(true)}
                  className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition"
                />
              </div>

              {dropdownOpen && filtered.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {filtered.slice(0, 20).map((c) => (
                    <button
                      key={c.code}
                      type="button"
                      onClick={() => addCountry(c.code)}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-brand-light-green/30 transition-colors text-left"
                    >
                      <span>{c.flag}</span>
                      <span>{c.name}</span>
                      <span className="text-slate-400 ml-auto">{c.code}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Click-away */}
            {dropdownOpen && (
              <div
                className="fixed inset-0 z-0"
                onClick={() => setDropdownOpen(false)}
              />
            )}
          </div>
        )}

        <div className="pt-1">
          <button
            type="submit"
            disabled={pending}
            className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </form>
  );
}
