import type { ComponentConfig } from "@measured/puck";
import type { RegisteredBlock } from "@core/blocks/registry";
import type { TopicListItem } from "@core-plugins/topics";
import { BuilderCard } from "@core/blocks/BuilderCard";

export type TopicArchiveHeaderProps = {
  showDescription: boolean;
};

interface PuckMetadataShape {
  topic?: TopicListItem;
}

export const TopicArchiveHeader: ComponentConfig<TopicArchiveHeaderProps> = {
  label: "Topic Archive Header",
  fields: {
    showDescription: {
      type: "radio",
      label: "Show description",
      options: [
        { label: "Yes", value: true },
        { label: "No", value: false },
      ],
    },
  },
  defaultProps: { showDescription: true },
  render: ({ showDescription, puck }) => {
    if (puck?.isEditing) {
      return <BuilderCard name="TopicArchiveHeader" title="Topic Header" description="Shows the topic name and description." />;
    }
    const md = (puck?.metadata ?? {}) as PuckMetadataShape;
    const topic = md.topic;
    if (!topic) {
      return <></>;
    }
    return (
      <header className="np-topic-archive-header not-prose mb-6 border-b border-slate-200 pb-4">
        <p className="text-xs uppercase tracking-wider text-slate-400">Topic</p>
        <h1 className="text-3xl font-bold text-brand-navy">{topic.name}</h1>
        {showDescription && topic.description ? (
          <p className="mt-2 text-base text-slate-600">{topic.description}</p>
        ) : null}
      </header>
    );
  },
};

export const TopicArchiveHeaderBlock: Omit<RegisteredBlock, "source"> = {
  name: "TopicArchiveHeader",
  config: TopicArchiveHeader,
  surfaces: ["template-topic-archive"],
  category: "Template",
};
