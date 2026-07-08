"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateUser, type UserDetail } from "../../actions";
import { UserDetailsFields } from "../../UserDetailsFields";
import { type Socials } from "../../socials";

interface Props {
  user: UserDetail;
  roles: Array<{ slug: string; label: string }>;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

export function EditUserPageClient({ user, roles }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [displayName, setDisplayName] = useState(user.displayName);
  const [role, setRole] = useState(user.roles[0] ?? roles[0]?.slug ?? "author");
  const isEditingAdmin = user.roles.includes("admin");
  const [fullName, setFullName] = useState(user.fullName);
  const [bio, setBio] = useState(user.bio);
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl);
  const [socials, setSocials] = useState<Socials>(user.socials);

  function setSocial(id: string, value: string) {
    setSocials((prev) => ({ ...prev, [id]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await updateUser({
        id: user.id,
        displayName,
        fullName,
        bio,
        avatarUrl,
        socials,
        role,
      });
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`${displayName || user.email} updated`);
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

      <h1 className="font-display text-4xl tracking-tight text-brand-navy">
        Edit {user.displayName}
      </h1>
      <p className="mt-1 text-sm text-slate-500">
        Update account details and personal info.
      </p>

      <form
        onSubmit={handleSubmit}
        className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-8"
      >
        {/* Left: account fields */}
        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Email
            </label>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
              {user.email}
            </div>
            <p className="mt-2 text-sm text-slate-400">
              Email is a login credential and changes through a dedicated flow.
            </p>
          </div>

          <div>
            <label htmlFor="eu-display-name" className="block text-sm font-medium text-slate-700 mb-1.5">
              Display name
            </label>
            <input
              id="eu-display-name"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="eu-role" className="block text-sm font-medium text-slate-700 mb-1.5">
              Role
            </label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v ?? "")}
              disabled={isEditingAdmin}
            >
              <SelectTrigger id="eu-role">
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
            {isEditingAdmin && (
              <p className="mt-2 text-sm text-slate-400">
                Admin role can&apos;t be changed here — guards against accidental downgrades.
              </p>
            )}
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
            disabled={pending}
            className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pending ? "Saving…" : "Save changes"}
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
