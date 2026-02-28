import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Normalize tags from DB — handles both array and object formats */
export function normalizeTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags;
  if (tags && typeof tags === "object") return Object.values(tags as Record<string, string>);
  return [];
}
