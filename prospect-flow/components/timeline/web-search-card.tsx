import { Check, Globe } from "lucide-react";
import { FieldLabel, ToolCard } from "@/components/timeline/tool-card";
import { cn } from "@/lib/utils";
import type { Company, CompanySearchData } from "@/lib/types";

type WebSearchCardProps = {
  data: CompanySearchData;
  running: boolean;
  /** True while the flow is paused for the user to choose a company. */
  selectionActive: boolean;
  selectedCompany: string | null;
  onSelect: (company: Company) => void;
};

export function WebSearchCard({
  data,
  running,
  selectionActive,
  selectedCompany,
  onSelect,
}: WebSearchCardProps) {
  return (
    <ToolCard
      icon={Globe}
      name="Web search"
      runningLabel="finding companies that match…"
      doneLabel={`${data.companies.length} companies found`}
      running={running}
    >
      <FieldLabel>Query</FieldLabel>
      <div className="mb-4 rounded-lg bg-secondary/70 p-3 font-mono text-[12px] leading-relaxed text-foreground/80">
        {data.query}
      </div>

      <FieldLabel>{selectionActive ? "Choose an account" : "Matches"}</FieldLabel>
      <div className="flex flex-col gap-1.5">
        {data.companies.map((company) => {
          const isSelected = selectedCompany === company.name;
          const dimmed = selectedCompany !== null && !isSelected;
          const className = cn(
            "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors",
            isSelected
              ? "border-brand/40 bg-brand-soft/60"
              : selectionActive
                ? "border-border hover:border-brand/40 hover:bg-brand-soft/30"
                : "border-transparent bg-secondary/40",
            dimmed && "opacity-55",
          );
          const inner = (
            <>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="font-medium text-foreground">{company.name}</span>
                  {company.top && !selectedCompany && (
                    <span className="rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold tracking-wide text-brand-foreground uppercase">
                      Top match
                    </span>
                  )}
                </div>
                <div className="truncate text-[12px] text-muted-foreground">
                  {company.location} · {company.blurb}
                </div>
              </div>
              {isSelected && (
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-brand text-brand-foreground">
                  <Check className="size-3.5" />
                </span>
              )}
            </>
          );

          return selectionActive ? (
            <button
              key={company.name}
              type="button"
              onClick={() => onSelect(company)}
              className={className}
            >
              {inner}
            </button>
          ) : (
            <div key={company.name} className={className}>
              {inner}
            </div>
          );
        })}
      </div>
    </ToolCard>
  );
}
