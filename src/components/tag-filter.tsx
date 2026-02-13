"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface TagFilterProps {
  availableTags: string[];
  selectedTags: string[];
  onSelectionChange: (tags: string[]) => void;
  isLoading?: boolean;
  className?: string;
}

export function TagFilter({
  availableTags,
  selectedTags,
  onSelectionChange,
  isLoading = false,
  className,
}: TagFilterProps) {
  const handleTagToggle = (tag: string) => {
    if (selectedTags.includes(tag)) {
      onSelectionChange(selectedTags.filter((t) => t !== tag));
    } else {
      onSelectionChange([...selectedTags, tag]);
    }
  };

  const handleSelectAll = () => {
    onSelectionChange([]);
  };

  const getButtonLabel = () => {
    if (selectedTags.length === 0) {
      return "All Tags";
    }
    if (selectedTags.length === 1) {
      return selectedTags[0];
    }
    return `${selectedTags.length} tags`;
  };

  if (availableTags.length === 0 && !isLoading) {
    return null;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={selectedTags.length > 0 ? "default" : "outline"}
          size="sm"
          className={cn("h-[34px] min-w-[100px] justify-between", className)}
          disabled={isLoading}
        >
          <span>{isLoading ? "Loading..." : getButtonLabel()}</span>
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[160px]">
        <DropdownMenuLabel>Filter by Tag</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={selectedTags.length === 0}
          onCheckedChange={handleSelectAll}
        >
          All Tags
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {availableTags.map((tag) => (
          <DropdownMenuCheckboxItem
            key={tag}
            checked={selectedTags.includes(tag)}
            onCheckedChange={() => handleTagToggle(tag)}
          >
            {tag}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
