"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => signOut({ callbackUrl: "/admin/login" })}
      className="text-sm text-white/50 hover:text-white transition px-1.5 py-0.5 rounded"
      title="Sign out"
    >
      Sign out
    </button>
  );
}
