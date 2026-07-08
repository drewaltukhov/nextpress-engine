"use client";

import { useState, type ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export interface AdminTab {
  value: string;
  label: string;
  icon?: ReactNode;
  content: ReactNode;
  /** Right-aligned action shown on the tabs line while this tab is active. */
  tabsAction?: ReactNode;
}

interface AdminSectionProps {
  /** Header title. Omit to render only the tabs — useful when the
   *  page wants its own custom header above the tab strip (e.g. the
   *  per-theme settings page mirrors the builder's title styling). */
  title?: string;
  description?: string;
  tabs: AdminTab[];
  defaultTab?: string;
}

export function AdminSection({ title, description, tabs, defaultTab }: AdminSectionProps) {
  const [active, setActive] = useState<string>(defaultTab ?? tabs[0]?.value ?? "");
  const activeTab = tabs.find((t) => t.value === active);

  return (
    <div>
      {title ? (
        <div className="mb-6">
          <h1 className="font-display text-4xl tracking-tight text-brand-navy">{title}</h1>
          {description && (
            <p className="mt-1 text-sm text-slate-500">{description}</p>
          )}
        </div>
      ) : null}

      <Tabs value={active} onValueChange={setActive} className="flex flex-col">
        {/* Tabs row: scrolls horizontally on overflow rather than wrapping
            to a second line. min-w-0 on the scroller lets the right-aligned
            action keep its space while the tab strip shrinks; overscroll-x
            keeps the rest of the page still while the user pans the tabs. */}
        <div className="border-b border-brand-light-green flex items-center justify-between gap-4">
          <div className="min-w-0 flex-1 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]">
            <TabsList className="!inline-flex !w-auto flex-nowrap gap-1 bg-transparent p-0 mb-0">
              {tabs.map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="!flex-initial !rounded-none !border-0 !shadow-none px-4 py-2 text-sm font-medium whitespace-nowrap text-slate-500 transition-colors hover:text-slate-700 data-[active]:bg-brand-light-green/50 data-[active]:text-brand-navy data-[active]:font-semibold"
                >
                  {tab.icon && <span className="mr-1.5">{tab.icon}</span>}
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          {activeTab?.tabsAction && (
            <div className="pb-1.5 shrink-0">{activeTab.tabsAction}</div>
          )}
        </div>

        {tabs.map((tab) => (
          <TabsContent key={tab.value} value={tab.value} className="pt-6">
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
