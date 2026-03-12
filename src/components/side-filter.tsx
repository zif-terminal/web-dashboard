"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SideFilterProps {
  value: "buy" | "sell" | null;
  onChange: (side: "buy" | "sell" | null) => void;
}

export function SideFilter({ value, onChange }: SideFilterProps) {
  const options: { label: string; side: "buy" | "sell" | null }[] = [
    { label: "All", side: null },
    { label: "Buy", side: "buy" },
    { label: "Sell", side: "sell" },
  ];

  return (
    <div className="flex items-center gap-1">
      {options.map((opt) => (
        <Button
          key={opt.label}
          variant="outline"
          size="sm"
          className={cn(
            "h-8 px-3 text-xs",
            value === opt.side && "bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground"
          )}
          onClick={() => onChange(opt.side)}
        >
          {opt.label}
        </Button>
      ))}
    </div>
  );
}
