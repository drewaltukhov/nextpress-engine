// Augment NextAuth's session/user types so consumers get typed access to
// our custom fields (roles, status, emailVerifiedAt).
//
// next-auth uses module augmentation. This file is loaded by the project's
// tsconfig include, so the augmentations are global.

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      roles: string[];
      emailVerifiedAt: string | null;
      status: string;
      /** Unix seconds — JWT issued-at, used by the admin shell soft-expiry gate. */
      iat: number | null;
    };
  }

  interface User {
    id: string;
    email: string;
    name: string;
    roles?: string[];
    emailVerifiedAt?: string | null;
    status?: string;
  }
}

// JWT augmentation lives implicitly — next-auth's JWT type is a Record so
// custom fields work at runtime. Type-checking inside callbacks uses the
// inferred token shape.
export {};
