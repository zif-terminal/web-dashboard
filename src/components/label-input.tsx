"use client";

import { useState, useRef, useEffect } from "react";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface LabelInputProps {
  label: string | null | undefined;
  fallbackText: string;
  onLabelChange: (label: string | null) => Promise<void>;
  className?: string;
}

export function LabelInput({
  label,
  fallbackText,
  onLabelChange,
  className,
}: LabelInputProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(label || "");
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const displayValue = label && label.trim().length > 0 ? label : fallbackText;
  const hasLabel = label && label.trim().length > 0;

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditValue(label || "");
    setIsEditing(true);
  };

  const handleSave = async () => {
    const trimmedValue = editValue.trim();
    const newLabel = trimmedValue.length > 0 ? trimmedValue : null;

    // Only save if value changed
    if (newLabel !== (label || null)) {
      setIsSaving(true);
      try {
        await onLabelChange(newLabel);
      } finally {
        setIsSaving(false);
      }
    }
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditValue(label || "");
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  const handleBlur = () => {
    handleSave();
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        onClick={(e) => e.stopPropagation()}
        disabled={isSaving}
        placeholder="Enter label..."
        className={cn(
          "w-full max-w-[180px] px-1.5 py-0.5 text-sm bg-background border rounded outline-none focus:ring-1 focus:ring-ring",
          isSaving && "opacity-50",
          className
        )}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={handleStartEdit}
      className={cn(
        "group flex items-center gap-1 text-sm hover:bg-muted/50 rounded px-1 py-0.5 transition-colors text-left",
        !hasLabel && "text-muted-foreground font-mono",
        hasLabel && "font-medium",
        className
      )}
    >
      <span className="truncate max-w-[160px]">{displayValue}</span>
      <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-50 flex-shrink-0" />
    </button>
  );
}
