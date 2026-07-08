import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import { BuilderCard } from "@core/blocks/BuilderCard";

export type NotFoundMessageProps = {
  title: string;
  body: string;
  ctaText: string;
  ctaHref: string;
};

export const NotFoundMessage: ComponentConfig<NotFoundMessageProps> = {
  label: "404 Message",
  fields: {
    title: { type: "text", label: "Title" },
    body: { type: "textarea", label: "Body text" },
    ctaText: { type: "text", label: "Button text (optional)" },
    ctaHref: { type: "text", label: "Button link" },
  },
  defaultProps: {
    title: "Page not found",
    body: "We couldn't find the page you're looking for.",
    ctaText: "Back to homepage",
    ctaHref: "/",
  },
  permissions: { delete: false, duplicate: false },
  render: ({ title, body, ctaText, ctaHref, puck }) => {
    if (puck?.isEditing) {
      return <BuilderCard name="NotFoundMessage" title="404 Message" description='Friendly "page not found" message with an optional CTA.' />;
    }
    return (
      <div className="np-not-found-message not-prose flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 py-12 text-center">
        <h1 className="text-3xl font-bold text-brand-navy md:text-5xl">{title}</h1>
        {body ? <p className="max-w-md text-base text-slate-600">{body}</p> : null}
        {ctaText && ctaHref ? (
          <a
            href={ctaHref}
            className="mt-2 inline-flex items-center justify-center rounded-lg bg-brand-green px-5 py-2.5 text-sm font-semibold text-white no-underline transition hover:bg-brand-green/90"
          >
            {ctaText}
          </a>
        ) : null}
      </div>
    );
  },
};

export const NotFoundMessageBlock: Omit<RegisteredBlock, "source"> = {
  name: "NotFoundMessage",
  config: NotFoundMessage,
  surfaces: ["template-not-found"],
  category: "Template",
  essential: true,
};
