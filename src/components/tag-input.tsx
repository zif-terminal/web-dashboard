"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { Plus } from "lucide-react";
import { TagBadge } from "./tag-badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TagInputProps {
  tags: string[];
  onTagsChange: (tags: string[]) => void;
  availableTags?: string[];
  maxTags?: number;
  disabled?: boolean;
  className?: string;
}

export function TagInput({
  tags,
  onTagsChange,
  availableTags = [],
  maxTags = 5,
  disabled = false,
  className,
}: TagInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const normalizedTags = tags.map((t) => t.toLowerCase());

  const filteredSuggestions = availableTags.filter(
    (tag) =>
      !normalizedTags.includes(tag.toLowerCase()) &&
      tag.toLowerCase().includes(inputValue.toLowerCase())
  );

  const handleAddTag = (tag: string) => {
    const trimmedTag = tag.trim().toLowerCase();
    if (
      trimmedTag &&
      !normalizedTags.includes(trimmedTag) &&
      tags.length < maxTags
    ) {
      onTagsChange([...tags, trimmedTag]);
      setInputValue("");
      setIsOpen(false);
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    onTagsChange(tags.filter((t) => t !== tagToRemove));
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleAddTag(inputValue);
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setInputValue("");
    }
  };

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  return (
    <div
      className={cn("flex flex-wrap items-center gap-1", className)}
      onClick={(e) => e.stopPropagation()}
    >
      {tags.map((tag) => (
        <TagBadge
          key={tag}
          tag={tag}
          onRemove={disabled ? undefined : () => handleRemoveTag(tag)}
        />
      ))}
      {!disabled && tags.length < maxTags && (
        <Popover open={isOpen} onOpenChange={setIsOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <Plus className="mr-1 h-3 w-3" />
              Add tag
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-2" align="start">
            <Input
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Enter tag..."
              className="h-8 text-sm"
            />
            {filteredSuggestions.length > 0 && (
              <div className="mt-2 max-h-32 overflow-y-auto">
                {filteredSuggestions.slice(0, 5).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => handleAddTag(suggestion)}
                    className="w-full rounded px-2 py-1 text-left text-sm hover:bg-accent"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
            {inputValue && !filteredSuggestions.includes(inputValue.toLowerCase()) && (
              <div className="mt-2 text-xs text-muted-foreground">
                Press Enter to add &quot;{inputValue}&quot;
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
