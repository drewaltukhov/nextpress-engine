"use client";

import { MediaPickerInput } from "@core/components/MediaPicker";
import { SOCIAL_PLATFORMS, type Socials } from "./socials";

const inputCls =
  "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-green/30 focus:border-brand-green transition";

interface Props {
  fullName: string;
  bio: string;
  socials: Socials;
  avatarUrl: string;
  onFullNameChange: (v: string) => void;
  onBioChange: (v: string) => void;
  onSocialChange: (id: string, v: string) => void;
  onAvatarUrlChange: (v: string) => void;
}

export function UserDetailsFields({
  fullName,
  bio,
  socials,
  avatarUrl,
  onFullNameChange,
  onBioChange,
  onSocialChange,
  onAvatarUrlChange,
}: Props) {
  return (
    <div className="space-y-5">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1.5">
          Profile image <span className="text-slate-400 font-normal">— optional</span>
        </label>
        {/* Same `MediaPickerInput` the SEO + Posts editors use — pick from
            library or quick-upload. The upload path enforces the
            site-wide media settings (extensions + max size) at the
            action layer, so no extra validation is needed here. */}
        <MediaPickerInput
          value={avatarUrl}
          onChange={onAvatarUrlChange}
          allowUpload
          variant="preview"
        />
        <p className="mt-1 text-xs text-slate-500">
          Shown next to the user&apos;s name across the admin and on public
          author pages.
        </p>
      </div>

      <div>
        <label htmlFor="ud-full-name" className="block text-sm font-medium text-slate-700 mb-1.5">
          Full name <span className="text-slate-400 font-normal">— optional</span>
        </label>
        <input
          id="ud-full-name"
          type="text"
          placeholder="Jane Smith"
          value={fullName}
          onChange={(e) => onFullNameChange(e.target.value)}
          className={inputCls}
          maxLength={200}
        />
      </div>

      <div>
        <label htmlFor="ud-bio" className="block text-sm font-medium text-slate-700 mb-1.5">
          Bio <span className="text-slate-400 font-normal">— optional</span>
        </label>
        <textarea
          id="ud-bio"
          placeholder="A short description that appears on the public profile."
          value={bio}
          onChange={(e) => onBioChange(e.target.value)}
          className={`${inputCls} min-h-[140px] resize-y`}
          maxLength={2000}
        />
      </div>

      <div>
        <div className="block text-sm font-medium text-slate-700 mb-2">
          Social links <span className="text-slate-400 font-normal">— optional</span>
        </div>
        <div className="space-y-2.5">
          {SOCIAL_PLATFORMS.map((p) => (
            <div key={p.id} className="grid grid-cols-[100px_1fr] items-center gap-3">
              <label
                htmlFor={`ud-social-${p.id}`}
                className="text-sm font-medium text-slate-600"
              >
                {p.label}
              </label>
              <input
                id={`ud-social-${p.id}`}
                type="text"
                placeholder={p.placeholder}
                value={socials[p.id] ?? ""}
                onChange={(e) => onSocialChange(p.id, e.target.value)}
                className={inputCls}
                maxLength={500}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
