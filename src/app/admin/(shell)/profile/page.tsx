import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getMyProfile } from "./actions";
import { getUser, getRoles } from "../users/actions";
import { ProfileEmailCard } from "./ProfileEmailCard";
import { ProfilePasswordCard } from "./ProfilePasswordCard";
import { ProfileDetailsCard } from "./ProfileDetailsCard";

export const metadata: Metadata = { title: "Your profile" };

export default async function ProfilePage() {
  const profile = await getMyProfile();
  if (!profile) {
    redirect("/admin/login");
  }

  const [detail, roles] = await Promise.all([
    getUser(profile.id),
    getRoles(),
  ]);

  return (
    <>
      <h1 className="font-display text-4xl tracking-tight text-brand-navy">Your profile</h1>
      <p className="mt-1 text-sm text-slate-500">
        Account-level settings for {profile.displayName}.
      </p>

      <div className="mt-8 space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <ProfileEmailCard profile={profile} />
          <ProfilePasswordCard userId={profile.id} email={profile.email} />
        </div>
        {detail && <ProfileDetailsCard user={detail} roles={roles} />}
      </div>
    </>
  );
}
