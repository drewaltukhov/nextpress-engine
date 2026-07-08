"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MediaPickerInput } from "@core/components/MediaPicker";
import { saveIdentitySettings, type IdentitySettings } from "./actions";
import type { IdentityData } from "@core-plugins/seo/metadata";

interface Props {
  initial: IdentitySettings;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";
const labelCls = "block text-sm font-medium text-slate-700 mb-1";
const cardCls = "rounded-xl bg-white border border-slate-200 p-5";
const helpCls = "mt-1 text-xs text-slate-500";

// ── Phone input with country-code dropdown ────────────────────────────
// E.164-friendly: stored value is "+<dial> <rest>"; the dropdown picks the
// dial code and the text input holds the user-formatted local number.

interface PhoneCountry {
  iso: string;
  name: string;
  flag: string;
  dial: string; // calling code, no plus sign
}

const PHONE_COUNTRIES: PhoneCountry[] = [
  { iso: "US", name: "United States",        flag: "🇺🇸", dial: "1" },
  { iso: "AR", name: "Argentina",            flag: "🇦🇷", dial: "54" },
  { iso: "AU", name: "Australia",            flag: "🇦🇺", dial: "61" },
  { iso: "AT", name: "Austria",              flag: "🇦🇹", dial: "43" },
  { iso: "BE", name: "Belgium",              flag: "🇧🇪", dial: "32" },
  { iso: "BR", name: "Brazil",               flag: "🇧🇷", dial: "55" },
  { iso: "BG", name: "Bulgaria",             flag: "🇧🇬", dial: "359" },
  { iso: "CA", name: "Canada",               flag: "🇨🇦", dial: "1" },
  { iso: "CL", name: "Chile",                flag: "🇨🇱", dial: "56" },
  { iso: "CN", name: "China",                flag: "🇨🇳", dial: "86" },
  { iso: "CO", name: "Colombia",             flag: "🇨🇴", dial: "57" },
  { iso: "HR", name: "Croatia",              flag: "🇭🇷", dial: "385" },
  { iso: "CZ", name: "Czechia",              flag: "🇨🇿", dial: "420" },
  { iso: "DK", name: "Denmark",              flag: "🇩🇰", dial: "45" },
  { iso: "EG", name: "Egypt",                flag: "🇪🇬", dial: "20" },
  { iso: "FI", name: "Finland",              flag: "🇫🇮", dial: "358" },
  { iso: "FR", name: "France",               flag: "🇫🇷", dial: "33" },
  { iso: "DE", name: "Germany",              flag: "🇩🇪", dial: "49" },
  { iso: "GR", name: "Greece",               flag: "🇬🇷", dial: "30" },
  { iso: "HK", name: "Hong Kong",            flag: "🇭🇰", dial: "852" },
  { iso: "HU", name: "Hungary",              flag: "🇭🇺", dial: "36" },
  { iso: "IS", name: "Iceland",              flag: "🇮🇸", dial: "354" },
  { iso: "IN", name: "India",                flag: "🇮🇳", dial: "91" },
  { iso: "ID", name: "Indonesia",            flag: "🇮🇩", dial: "62" },
  { iso: "IE", name: "Ireland",              flag: "🇮🇪", dial: "353" },
  { iso: "IL", name: "Israel",               flag: "🇮🇱", dial: "972" },
  { iso: "IT", name: "Italy",                flag: "🇮🇹", dial: "39" },
  { iso: "JP", name: "Japan",                flag: "🇯🇵", dial: "81" },
  { iso: "MY", name: "Malaysia",             flag: "🇲🇾", dial: "60" },
  { iso: "MX", name: "Mexico",               flag: "🇲🇽", dial: "52" },
  { iso: "NL", name: "Netherlands",          flag: "🇳🇱", dial: "31" },
  { iso: "NZ", name: "New Zealand",          flag: "🇳🇿", dial: "64" },
  { iso: "NG", name: "Nigeria",              flag: "🇳🇬", dial: "234" },
  { iso: "NO", name: "Norway",               flag: "🇳🇴", dial: "47" },
  { iso: "PE", name: "Peru",                 flag: "🇵🇪", dial: "51" },
  { iso: "PH", name: "Philippines",          flag: "🇵🇭", dial: "63" },
  { iso: "PL", name: "Poland",               flag: "🇵🇱", dial: "48" },
  { iso: "PT", name: "Portugal",             flag: "🇵🇹", dial: "351" },
  { iso: "RO", name: "Romania",              flag: "🇷🇴", dial: "40" },
  { iso: "RU", name: "Russia",               flag: "🇷🇺", dial: "7" },
  { iso: "SA", name: "Saudi Arabia",         flag: "🇸🇦", dial: "966" },
  { iso: "SG", name: "Singapore",            flag: "🇸🇬", dial: "65" },
  { iso: "SK", name: "Slovakia",             flag: "🇸🇰", dial: "421" },
  { iso: "ZA", name: "South Africa",         flag: "🇿🇦", dial: "27" },
  { iso: "KR", name: "South Korea",          flag: "🇰🇷", dial: "82" },
  { iso: "ES", name: "Spain",                flag: "🇪🇸", dial: "34" },
  { iso: "SE", name: "Sweden",               flag: "🇸🇪", dial: "46" },
  { iso: "CH", name: "Switzerland",          flag: "🇨🇭", dial: "41" },
  { iso: "TW", name: "Taiwan",               flag: "🇹🇼", dial: "886" },
  { iso: "TH", name: "Thailand",             flag: "🇹🇭", dial: "66" },
  { iso: "TR", name: "Turkey",               flag: "🇹🇷", dial: "90" },
  { iso: "UA", name: "Ukraine",              flag: "🇺🇦", dial: "380" },
  { iso: "AE", name: "United Arab Emirates", flag: "🇦🇪", dial: "971" },
  { iso: "GB", name: "United Kingdom",       flag: "🇬🇧", dial: "44" },
  { iso: "VN", name: "Vietnam",              flag: "🇻🇳", dial: "84" },
];

const PHONE_COUNTRY_BY_ISO: Record<string, PhoneCountry> = Object.fromEntries(
  PHONE_COUNTRIES.map((c) => [c.iso, c]),
);

// Match longest dial first; within equal-length, prefer US so "+1" lands
// on the US flag rather than Canada (both share +1).
const PHONE_DIALS_RANKED = [...PHONE_COUNTRIES].sort((a, b) => {
  if (b.dial.length !== a.dial.length) return b.dial.length - a.dial.length;
  if (a.iso === "US") return -1;
  if (b.iso === "US") return 1;
  return 0;
});

const PHONE_DEFAULT_ISO = "US";

function parsePhoneValue(value: string): { iso: string; rest: string } {
  if (!value) return { iso: PHONE_DEFAULT_ISO, rest: "" };
  const trimmed = value.trim();
  if (!trimmed.startsWith("+")) return { iso: PHONE_DEFAULT_ISO, rest: trimmed };
  const digits = trimmed.slice(1).replace(/\D/g, "");
  for (const c of PHONE_DIALS_RANKED) {
    if (digits.startsWith(c.dial)) {
      // Strip the +<dial> prefix from the original (preserving formatting),
      // then drop any leading separator the user had between dial and number.
      const after = trimmed.slice(1 + c.dial.length).replace(/^[\s\-.]+/, "");
      return { iso: c.iso, rest: after };
    }
  }
  return { iso: PHONE_DEFAULT_ISO, rest: trimmed };
}

function formatPhoneValue(iso: string, rest: string): string {
  const cleaned = rest.trim();
  if (!cleaned) return "";
  const country = PHONE_COUNTRY_BY_ISO[iso] ?? PHONE_COUNTRY_BY_ISO[PHONE_DEFAULT_ISO]!;
  return `+${country.dial} ${cleaned}`;
}

function PhoneInputWithCountry({
  id,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  // Parse the iso from the initial value once, then keep it in local state so
  // changing the country before the user types doesn't snap back to the
  // default on the next render (formatPhoneValue returns "" while rest is
  // empty, which would otherwise re-derive iso = US).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => parsePhoneValue(value), []);
  const [iso, setIso] = useState(initial.iso);
  const rest = useMemo(() => parsePhoneValue(value).rest, [value]);
  const country = PHONE_COUNTRY_BY_ISO[iso] ?? PHONE_COUNTRY_BY_ISO[PHONE_DEFAULT_ISO]!;

  return (
    <div className="flex gap-2">
      <Select
        value={iso}
        onValueChange={(v) => {
          if (!v) return;
          setIso(v);
          if (rest) onChange(formatPhoneValue(v, rest));
        }}
      >
        <SelectTrigger className="w-[150px] shrink-0">
          <SelectValue>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-base leading-none">{country.flag}</span>
              <span className="text-xs text-slate-500">+{country.dial}</span>
            </span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {PHONE_COUNTRIES.map((c) => (
            <SelectItem key={c.iso} value={c.iso}>
              <span className="inline-flex items-center gap-2">
                <span className="text-base leading-none">{c.flag}</span>
                <span>{c.name}</span>
                <span className="text-xs text-slate-400 ml-1">+{c.dial}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <input
        id={id}
        type="tel"
        value={rest}
        onChange={(e) => onChange(formatPhoneValue(iso, e.target.value))}
        placeholder={placeholder}
        className={`${inputCls} flex-1`}
      />
    </div>
  );
}

const TYPE_OPTIONS = [
  { value: "organization", label: "Organization", help: "A company, brand, or non-profit." },
  { value: "person", label: "Person", help: "A solo creator, freelancer, or personal brand." },
  { value: "local_business", label: "Local Business", help: "A storefront with a physical address." },
];

// Empty starting points keyed by discriminator. Switching type swaps the whole
// shape — easier than partial migration and matches Zod's discriminated union.
const EMPTY: Record<IdentityData["type"], IdentityData> = {
  organization: {
    type: "organization",
    name: "",
    logo: "",
    description: "",
    sameAs: [],
    contactEmail: "",
    contactPhone: "",
  },
  person: {
    type: "person",
    name: "",
    jobTitle: "",
    photo: "",
    sameAs: [],
  },
  local_business: {
    type: "local_business",
    name: "",
    streetAddress: "",
    addressLocality: "",
    addressRegion: "",
    postalCode: "",
    addressCountry: "",
    telephone: "",
    priceRange: "",
    openingHours: "",
    latitude: "",
    longitude: "",
  },
};

export function IdentityTab({ initial }: Props) {
  const [data, setData] = useState<IdentityData>(initial.data);
  const [schemaWebsite, setSchemaWebsite] = useState(initial.schemaWebsiteEnabled);
  const [schemaBreadcrumb, setSchemaBreadcrumb] = useState(initial.schemaBreadcrumbEnabled);
  const [schemaArticle, setSchemaArticle] = useState(initial.schemaArticleEnabled);
  const [pending, startTransition] = useTransition();

  function changeType(next: IdentityData["type"]) {
    if (next === data.type) return;
    // Carry the name across types — it's the one universal field.
    const carriedName = data.name;
    setData({ ...EMPTY[next], name: carriedName });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveIdentitySettings({
        data,
        schemaWebsiteEnabled: schemaWebsite,
        schemaBreadcrumbEnabled: schemaBreadcrumb,
        schemaArticleEnabled: schemaArticle,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Identity settings saved");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className={`${cardCls} lg:col-span-2`}>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Site type</h3>
        <p className="text-xs text-slate-500 mb-4">
          Helps Google and other search engines know who&rsquo;s behind your site, so they can show your
          logo, links, and contact info alongside your search results.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {TYPE_OPTIONS.map((opt) => {
            const active = data.type === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => changeType(opt.value as IdentityData["type"])}
                className={`text-left rounded-lg border p-3 transition ${
                  active
                    ? "border-brand-green bg-brand-light-green/40"
                    : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="text-sm font-medium text-slate-900">{opt.label}</div>
                <div className="text-xs text-slate-500 mt-0.5">{opt.help}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-900 mb-4">
          {data.type === "organization" && "Organization details"}
          {data.type === "person" && "Personal details"}
          {data.type === "local_business" && "Business details"}
        </h3>

        {data.type === "organization" && (
          <OrganizationFields data={data} setData={setData} />
        )}
        {data.type === "person" && <PersonFields data={data} setData={setData} />}
        {data.type === "local_business" && (
          <LocalBusinessFields data={data} setData={setData} />
        )}
      </div>

      <div className={cardCls}>
        <h3 className="text-sm font-semibold text-slate-900 mb-1">Per-page schema toggles</h3>
        <p className="text-xs text-slate-500 mb-4">
          Which JSON-LD blocks render across the site.
        </p>
        <div className="grid grid-cols-1 gap-3">
          <ToggleRow
            label="WebSite (homepage)"
            description="Site-wide identity + sitelinks search action."
            checked={schemaWebsite}
            onCheckedChange={setSchemaWebsite}
          />
          <ToggleRow
            label="BreadcrumbList"
            description="Auto-generated from URL hierarchy. Emitted on Posts and Pages with at least one ancestor."
            checked={schemaBreadcrumb}
            onCheckedChange={setSchemaBreadcrumb}
          />
          <ToggleRow
            label="Article (posts)"
            description="Per-post Article block emitted on every published Post."
            checked={schemaArticle}
            onCheckedChange={setSchemaArticle}
          />
          {/* FAQPage has no toggle — it auto-emits on every Page that has
              FAQ blocks. Removing the FAQ blocks removes the schema. */}
        </div>
      </div>

      <div className="lg:col-span-2">
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm shadow-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Saving…" : "Save identity"}
        </button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// Per-type field groups
// ---------------------------------------------------------------------------

interface OrganizationProps {
  data: Extract<IdentityData, { type: "organization" }>;
  setData: (next: IdentityData) => void;
}

function OrganizationFields({ data, setData }: OrganizationProps) {
  function patch(p: Partial<typeof data>) {
    setData({ ...data, ...p });
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Organization name" id="id-name">
        <input
          id="id-name"
          type="text"
          value={data.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Acme Corp"
          className={inputCls}
        />
      </Field>
      <Field label="Logo" id="id-logo">
        <MediaPickerInput
          id="id-logo"
          value={data.logo}
          onChange={(v) => patch({ logo: v })}
          placeholder="https://… or pick from your library"
        />
      </Field>
      <div className="md:col-span-2">
        <Field label="Description" id="id-description">
          <textarea
            id="id-description"
            rows={2}
            value={data.description}
            onChange={(e) => patch({ description: e.target.value })}
            placeholder="What you do, in one or two sentences."
            className={inputCls}
          />
        </Field>
      </div>
      <div className="md:col-span-2">
        <Field
          label="Social profile URLs"
          id="id-sameas"
          help="One URL per line — Twitter, LinkedIn, GitHub, Crunchbase, etc. Helps Google link your profiles together."
        >
          <textarea
            id="id-sameas"
            rows={4}
            value={data.sameAs.join("\n")}
            onChange={(e) =>
              patch({
                sameAs: e.target.value.split("\n").map((s) => s.trim()),
              })
            }
            placeholder={"https://twitter.com/yourhandle\nhttps://linkedin.com/company/yourorg"}
            className={`${inputCls} font-mono`}
          />
        </Field>
      </div>
      <Field label="Contact email" id="id-email" help="Optional">
        <input
          id="id-email"
          type="email"
          value={data.contactEmail}
          onChange={(e) => patch({ contactEmail: e.target.value })}
          placeholder="hello@example.com"
          className={inputCls}
        />
      </Field>
      <Field label="Contact phone" id="id-phone" help="Optional. Pick the country, type the local number.">
        <PhoneInputWithCountry
          id="id-phone"
          value={data.contactPhone}
          onChange={(next) => patch({ contactPhone: next })}
          placeholder="555 555 1234"
        />
      </Field>
    </div>
  );
}

interface PersonProps {
  data: Extract<IdentityData, { type: "person" }>;
  setData: (next: IdentityData) => void;
}

function PersonFields({ data, setData }: PersonProps) {
  function patch(p: Partial<typeof data>) {
    setData({ ...data, ...p });
  }
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Name" id="id-name">
        <input
          id="id-name"
          type="text"
          value={data.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Jane Doe"
          className={inputCls}
        />
      </Field>
      <Field label="Job title" id="id-job">
        <input
          id="id-job"
          type="text"
          value={data.jobTitle}
          onChange={(e) => patch({ jobTitle: e.target.value })}
          placeholder="Independent designer"
          className={inputCls}
        />
      </Field>
      <Field label="Photo" id="id-photo">
        <MediaPickerInput
          id="id-photo"
          value={data.photo}
          onChange={(v) => patch({ photo: v })}
          placeholder="https://… or pick from your library"
        />
      </Field>
      <div className="md:col-span-2">
        <Field
          label="Social profile URLs"
          id="id-sameas"
          help="One URL per line. Helps Google build your knowledge panel."
        >
          <textarea
            id="id-sameas"
            rows={4}
            value={data.sameAs.join("\n")}
            onChange={(e) =>
              patch({
                sameAs: e.target.value.split("\n").map((s) => s.trim()),
              })
            }
            placeholder={"https://twitter.com/janedoe\nhttps://github.com/janedoe"}
            className={`${inputCls} font-mono`}
          />
        </Field>
      </div>
    </div>
  );
}

interface LocalBusinessProps {
  data: Extract<IdentityData, { type: "local_business" }>;
  setData: (next: IdentityData) => void;
}

function LocalBusinessFields({ data, setData }: LocalBusinessProps) {
  function patch(p: Partial<typeof data>) {
    setData({ ...data, ...p });
  }

  const PRICE_OPTIONS = [
    { value: "", label: "—" },
    { value: "$", label: "$ (Inexpensive)" },
    { value: "$$", label: "$$ (Moderate)" },
    { value: "$$$", label: "$$$ (Expensive)" },
    { value: "$$$$", label: "$$$$ (Very expensive)" },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field label="Business name" id="id-name">
        <input
          id="id-name"
          type="text"
          value={data.name}
          onChange={(e) => patch({ name: e.target.value })}
          placeholder="Your Cafe"
          className={inputCls}
        />
      </Field>
      <Field label="Telephone" id="id-tel">
        <PhoneInputWithCountry
          id="id-tel"
          value={data.telephone}
          onChange={(next) => patch({ telephone: next })}
          placeholder="555 555 1234"
        />
      </Field>
      <div className="md:col-span-2">
        <Field label="Street address" id="id-street">
          <input
            id="id-street"
            type="text"
            value={data.streetAddress}
            onChange={(e) => patch({ streetAddress: e.target.value })}
            placeholder="123 Main St"
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="City / locality" id="id-locality">
        <input
          id="id-locality"
          type="text"
          value={data.addressLocality}
          onChange={(e) => patch({ addressLocality: e.target.value })}
          className={inputCls}
        />
      </Field>
      <Field label="Region / state" id="id-region">
        <input
          id="id-region"
          type="text"
          value={data.addressRegion}
          onChange={(e) => patch({ addressRegion: e.target.value })}
          className={inputCls}
        />
      </Field>
      <Field label="Postal code" id="id-postal">
        <input
          id="id-postal"
          type="text"
          value={data.postalCode}
          onChange={(e) => patch({ postalCode: e.target.value })}
          className={inputCls}
        />
      </Field>
      <Field label="Country" id="id-country" help="Two-letter country code (US, GB, DE, …).">
        <Select
          value={data.addressCountry || "US"}
          onValueChange={(v) => { if (v) patch({ addressCountry: v }); }}
        >
          <SelectTrigger id="id-country" className="w-full">
            <SelectValue>
              {(() => {
                const c = PHONE_COUNTRY_BY_ISO[data.addressCountry || "US"];
                if (!c) return <span className="text-slate-500 font-mono text-xs">{data.addressCountry || "—"}</span>;
                return (
                  <span className="inline-flex items-center gap-2">
                    <span className="text-base leading-none">{c.flag}</span>
                    <span>{c.name}</span>
                    <span className="text-xs text-slate-400 ml-1">({c.iso})</span>
                  </span>
                );
              })()}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {PHONE_COUNTRIES.map((c) => (
              <SelectItem key={c.iso} value={c.iso}>
                <span className="inline-flex items-center gap-2">
                  <span className="text-base leading-none">{c.flag}</span>
                  <span>{c.name}</span>
                  <span className="text-xs text-slate-400 ml-1">({c.iso})</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Latitude" id="id-lat" help="Optional, decimal">
        <input
          id="id-lat"
          type="text"
          value={data.latitude}
          onChange={(e) => patch({ latitude: e.target.value })}
          placeholder="37.7749"
          className={inputCls}
        />
      </Field>
      <Field label="Longitude" id="id-lon" help="Optional, decimal">
        <input
          id="id-lon"
          type="text"
          value={data.longitude}
          onChange={(e) => patch({ longitude: e.target.value })}
          placeholder="-122.4194"
          className={inputCls}
        />
      </Field>
      <Field label="Price range" id="id-price">
        <Select
          value={data.priceRange}
          onValueChange={(v) => patch({ priceRange: v ?? "" })}
        >
          <SelectTrigger id="id-price" className="h-10 text-sm">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {PRICE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
      <div className="md:col-span-2">
        <Field
          label="Opening hours"
          id="id-hours"
          help={"One block per line, e.g. Mo-Fr 09:00-17:00"}
        >
          <textarea
            id="id-hours"
            rows={3}
            value={data.openingHours}
            onChange={(e) => patch({ openingHours: e.target.value })}
            placeholder={"Mo-Fr 09:00-17:00\nSa 10:00-14:00"}
            className={`${inputCls} font-mono`}
          />
        </Field>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Tiny helpers
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  id: string;
  help?: string;
  children: React.ReactNode;
}

function Field({ label, id, help, children }: FieldProps) {
  return (
    <div>
      <label htmlFor={id} className={labelCls}>{label}</label>
      {children}
      {help ? <p className={helpCls}>{help}</p> : null}
    </div>
  );
}

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  pending?: string;
}

function ToggleRow({ label, description, checked, onCheckedChange, pending }: ToggleRowProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-2">
      <div className="min-w-0">
        <div className="text-sm font-medium text-slate-900">
          {label}
          {pending && (
            <span className="ml-2 text-[10px] uppercase tracking-wide text-slate-400">
              {pending}
            </span>
          )}
        </div>
        <div className="text-xs text-slate-500">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
