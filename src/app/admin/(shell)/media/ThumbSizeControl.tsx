"use client";

import { Minus, Plus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { THUMB_SIZE_LEVELS } from "./thumb-size";

interface Props {
  level: number;
  onChange: (level: number) => void;
}

const MAX_LEVEL = THUMB_SIZE_LEVELS.length - 1;

const btnCls =
  "inline-flex items-center justify-center size-7 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed";

export function ThumbSizeControl({ level, onChange }: Props) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5">
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => onChange(level + 1)}
              disabled={level >= MAX_LEVEL}
              aria-label="Smaller thumbnails"
              className={btnCls}
            >
              <Minus className="size-3.5" />
            </button>
          }
        />
        <TooltipContent>Smaller thumbnails</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              type="button"
              onClick={() => onChange(level - 1)}
              disabled={level <= 0}
              aria-label="Larger thumbnails"
              className={btnCls}
            >
              <Plus className="size-3.5" />
            </button>
          }
        />
        <TooltipContent>Larger thumbnails</TooltipContent>
      </Tooltip>
    </div>
  );
}
