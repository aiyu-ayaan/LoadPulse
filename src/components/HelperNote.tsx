import { Info } from "lucide-react";
import type { ReactNode } from "react";

type HelperNoteProps = {
  title: string;
  children: ReactNode;
  tone?: "default" | "soft";
};

export const HelperNote = ({ title, children, tone = "default" }: HelperNoteProps) => {
  const toneClass =
    tone === "soft"
      ? "border-white/10 bg-white/[0.03] text-slate-300"
      : "border-primary/20 bg-primary/8 text-slate-200";

  return (
    <div className={`rounded-2xl border px-4 py-3 ${toneClass}`}>
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-primary">
          <Info className="h-4 w-4" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-white">{title}</p>
          <div className="text-sm leading-6">{children}</div>
        </div>
      </div>
    </div>
  );
};
