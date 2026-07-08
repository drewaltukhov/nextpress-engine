"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateUser, type UserDetail } from "../users/actions";
import { UserDetailsFields } from "../users/UserDetailsFields";
import { type Socials } from "../users/socials";

interface Props {
  user: UserDetail;
  roles: Array<{ slug: string; label: string }>;
}

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

export function ProfileDetailsCard({ user, roles }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [displayName, setDisplayName] = useState(user.displayName);
  const [role, setRole] = useState(user.roles[0] ?? roles[0]?.slug ?? "author");
  const isSelfAdmin = user.roles.includes("admin");
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
      toast.success("Profile updated");
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl bg-white border border-slate-200 p-6"
    >
      <div className="text-[11px] uppercase tracking-wider text-slate-400 font-bold mb-4">
        Profile details
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: account fields */}
        <div className="space-y-5">
          <div>
            <label htmlFor="profile-display-name" className="block text-sm font-medium text-slate-700 mb-1.5">
              Display name
            </label>
            <input
              id="profile-display-name"
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label htmlFor="profile-role" className="block text-sm font-medium text-slate-700 mb-1.5">
              Role
            </label>
            <Select
              value={role}
              onValueChange={(v) => setRole(v ?? "")}
              disabled={isSelfAdmin}
            >
              <SelectTrigger id="profile-role">
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
            {isSelfAdmin && (
              <p className="mt-2 text-sm text-slate-400">
                You can&apos;t change your own admin role — guards against accidental lockout.
              </p>
            )}
          </div>
        </div>

        {/* Right: personal details (shared with /admin/users edit screens) */}
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
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="h-10 px-6 rounded-lg bg-brand-green text-white font-medium text-sm transition-colors hover:bg-brand-green/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
