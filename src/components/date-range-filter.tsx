"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

export type DateRangePreset = "24h" | "7d" | "30d" | "90d" | "all" | "custom";

export interface DateRangeValue {
  preset: DateRangePreset;
  customRange?: { from: Date; to: Date };
}

interface DateRangeFilterProps {
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  className?: string;
}

const presets: { value: DateRangePreset; label: string }[] = [
  { value: "24h", label: "24h" },
  { value: "7d", label: "7d" },
  { value: "30d", label: "30d" },
  { value: "90d", label: "90d" },
  { value: "all", label: "All" },
];

export function getTimestampFromDateRange(value: DateRangeValue): number | undefined {
  if (value.preset === "all") return undefined;

  if (value.preset === "custom" && value.customRange) {
    // Return the start of the custom range
    return value.customRange.from.getTime();
  }

  const now = Date.now();
  const hours: Record<string, number> = {
    "24h": 24,
    "7d": 24 * 7,
    "30d": 24 * 30,
    "90d": 24 * 90,
  };

  return now - hours[value.preset] * 60 * 60 * 1000;
}

// Legacy function for backwards compatibility
export function getTimestampFromPreset(preset: DateRangePreset): number | undefined {
  return getTimestampFromDateRange({ preset });
}

export function DateRangeFilter({
  value,
  onChange,
  className,
}: DateRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [tempRange, setTempRange] = useState<DateRange | undefined>(
    value.customRange ? { from: value.customRange.from, to: value.customRange.to } : undefined
  );

  const handlePresetClick = (preset: DateRangePreset) => {
    if (preset !== "custom") {
      onChange({ preset });
    }
  };

  const handleRangeSelect = (range: DateRange | undefined) => {
    setTempRange(range);
  };

  const handleApply = () => {
    if (tempRange?.from && tempRange?.to) {
      onChange({
        preset: "custom",
        customRange: { from: tempRange.from, to: tempRange.to },
      });
      setIsOpen(false);
    }
  };

  const formatCustomRange = () => {
    if (value.preset === "custom" && value.customRange) {
      return `${format(value.customRange.from, "MMM d")} - ${format(value.customRange.to, "MMM d")}`;
    }
    return "Custom";
  };

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {presets.map((preset) => (
        <button
          key={preset.value}
          onClick={() => handlePresetClick(preset.value)}
          className={cn(
            "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
            value.preset === preset.value
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          )}
        >
          {preset.label}
        </button>
      ))}

      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={value.preset === "custom" ? "default" : "outline"}
            size="sm"
            className={cn(
              "justify-start text-left font-medium h-[34px]",
              value.preset !== "custom" && "text-muted-foreground"
            )}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {formatCustomRange()}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="end">
          <div className="p-3 border-b">
            <p className="text-sm font-medium">Select date range</p>
          </div>
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={tempRange?.from}
            selected={tempRange}
            onSelect={handleRangeSelect}
            numberOfMonths={2}
            disabled={{ after: new Date() }}
          />
          <div className="flex items-center justify-end gap-2 p-3 border-t">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTempRange(undefined);
                setIsOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleApply}
              disabled={!tempRange?.from || !tempRange?.to}
            >
              Apply
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
