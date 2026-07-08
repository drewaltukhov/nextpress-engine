"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Check } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { checkEmailAvailable, createUser } from "../actions";
import { UserDetailsFields } from "../UserDetailsFields";
import { emptySocials, type Socials } from "../socials";

interface Props {
  roles: Array<{ slug: string; label: string }>;
}

type EmailStatus = "idle" | "invalid" | "checking" | "available" | "taken";

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

export function NewUserPageClient({ roles }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(roles[0]?.slug ?? "author");
  const [sendInvite, setSendInvite] = useState(false);
  const [emailStatus, setEmailStatus] = useState<EmailStatus>("idle");

  const [fullName, setFullName] = useState("");
  const [bio, setBio] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [socials, setSocials] = useState<Socials>(() => emptySocials());

  function setSocial(id: string, value: string) {
    setSocials((prev) => ({ ...prev, [id]: value }));
  }

  // Debounced async availability check. The synchronous setState calls below
  // reset derived status when the input changes; the eslint rule flags them,
  // but deriving from props alone doesn't compose with the async fetch.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) {
      setEmailStatus("idle");
      return;
    }
    if (!/.+@.+\..+/.test(trimmed)) {
      setEmailStatus("invalid");
      return;
    }
    setEmailStatus("checking");
    let cancelled = false;
    const handle = setTimeout(async () => {
      const result = await checkEmailAvailable(trimmed);
      if (cancelled) return;
      setEmailStatus(result.available ? "available" : "taken");
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [email]);
  /* eslint-enable react-hooks/set-state-in-effect */

  function handleInviteToggle(next: boolean) {
    if (next && password.length > 0) {
      toast.warning("Password discarded — the invitee will set their own");
      setPassword("");
    }
    setSendInvite(next);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createUser({
        email,
        displayName,
        password: sendInvite ? "" : password,
        role,
        sendInvite,
        fullName,
        bio,
        avatarUrl,
        socials,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      if (result.warning) {
        toast.warning(result.warning);
      } else {
        toast.success(
          sendInvite
            ? `Invitation sent to ${email}`
            : `User ${displayName || email} created`
        );
      }
      router.push("/admin/users");
    });
  }

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand-navy transition"
        >
          <ArrowLeft className="size-4" /> Users
        </Link>
      </div>

      <h1 className="font-display text-4xl tracking-tight text-brand-navy">Add user</h1>
      <p className="mt-1 text-sm text-slate-500">
        Create a new account. Personal details on the right are optional.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8"
      >
        {/* Left: account fields */}
        <div className="space-y-5">
          <div>
            <label htmlFor="nu-email" className="block text-sm font-medium text-slate-700 mb-1.5">
              Email
            </label>
            <input
              id="nu-email"
              type="email"
              required
              placeholder="user@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
            />
            {emailStatus === "checking" && (
              <p className="mt-2 text-sm text-slate-400">Checking availability…</p>
            )}
            {emailStatus === "available" && (
              <p className="mt-2 flex items-center gap-1 text-sm text-brand-green">
                <Check className="size-3.5" strokeWidth={3} /> Email available
              </p>
            )}
            {emailStatus === "taken" && (
              <p className="mt-2 flex items-center gap-1 text-sm text-red-600">
                <AlertCircle className="size-3.5" /> A user with this email already exists
              </p>
            )}
          </div>

          <div>
            <label htmlFor="nu-display-name" className="block text-sm font-medium text-slate-700 mb-1.5">
              Display name
            </label>
            <input
              id="nu-display-name"
              type="text"
              required
              placeholder="Jane"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputCls}
            />
          </div>

          {!sendInvite && (
            <div>
              <label htmlFor="nu-password" className="block text-sm font-medium text-slate-700 mb-1.5">
                Password
              </label>
              <input
                id="nu-password"
                type="password"
                required
                placeholder="Strong password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={inputCls}
              />
            </div>
          )}

          <div>
            <label htmlFor="nu-role" className="block text-sm font-medium text-slate-700 mb-1.5">
              Role
            </label>
            <Select value={role} onValueChange={(v) => setRole(v ?? "")}>
              <SelectTrigger id="nu-role">
                <SelectValue placeholder="Pick a role">
                  {(value) =>
                    value ? roles.find((r) => r.slug === value)?.label ?? value : null
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {roles.map((r) => (
                  <SelectItem key={r.slug} value={r.slug}>
                    {r.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <div>
              <div className="text-sm font-medium text-slate-700">Send invite email</div>
              <div className="text-sm text-slate-500">
                The user picks their own password via a one-time link
              </div>
            </div>
            <Switch checked={sendInvite} onCheckedChange={handleInviteToggle} />
          </div>
        </div>

        {/* Right: personal details */}
        <UserDetailsFields
          fullName={fullName}
          bio={bio}
          socials={socials}
          avatarUrl={avatarUrl}
          onFullNameChange={setFullName}
          onBioChange={setBio}
          onSocialChange={setSocial}
          onAvatarUrlChange={setAvatarUrl}
        />

        {/* Buttons span both columns */}
        <div className="lg:col-span-2 flex items-center gap-3 pt-2">
          <button
            type="submit"
            disabled={pending || emailStatus === "taken"}
            className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending
              ? sendInvite
                ? "Sending…"
                : "Creating…"
              : sendInvite
                ? "Send invitation"
                : "Create user"}
          </button>
          <Link
            href="/admin/users"
            className="h-10 inline-flex items-center px-4 rounded-lg border border-slate-200 bg-white text-slate-700 font-medium text-sm transition-colors hover:bg-slate-50"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
