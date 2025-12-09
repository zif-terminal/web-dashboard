import { useState, useEffect, useRef, useCallback } from "react";

interface UseNewItemsOptions {
  /** Duration in ms to keep items marked as new. Default: 3000 */
  highlightDuration?: number;
  /** Whether to skip highlighting on initial load. Default: true */
  skipInitialLoad?: boolean;
}

interface UseNewItemsReturn<T> {
  /** Set of IDs that are currently marked as new */
  newItemIds: Set<string>;
  /** Call this when new data arrives to update tracking */
  updateItems: (items: T[]) => void;
  /** Check if a specific item is new */
  isNew: (id: string) => boolean;
}

/**
 * Hook to track newly added items and highlight them temporarily.
 * Works with any data type that has an id field.
 */
export function useNewItems<T extends { id: string }>(
  options: UseNewItemsOptions = {}
): UseNewItemsReturn<T> {
  const { highlightDuration = 3000, skipInitialLoad = true } = options;

  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());
  const previousIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);
  const timeoutIdsRef = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      timeoutIdsRef.current.forEach((timeoutId) => clearTimeout(timeoutId));
    };
  }, []);

  const updateItems = useCallback(
    (items: T[]) => {
      const currentIds = new Set(items.map((item) => item.id));

      // Skip highlighting on initial load if configured
      if (isInitialLoadRef.current && skipInitialLoad) {
        isInitialLoadRef.current = false;
        previousIdsRef.current = currentIds;
        return;
      }

      isInitialLoadRef.current = false;

      // Find new items (in current but not in previous)
      const newIds: string[] = [];
      currentIds.forEach((id) => {
        if (!previousIdsRef.current.has(id)) {
          newIds.push(id);
        }
      });

      if (newIds.length > 0) {
        // Add new IDs to the set
        setNewItemIds((prev) => {
          const updated = new Set(prev);
          newIds.forEach((id) => updated.add(id));
          return updated;
        });

        // Schedule removal of highlight after duration
        newIds.forEach((id) => {
          // Clear existing timeout if any
          const existingTimeout = timeoutIdsRef.current.get(id);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }

          const timeoutId = setTimeout(() => {
            setNewItemIds((prev) => {
              const updated = new Set(prev);
              updated.delete(id);
              return updated;
            });
            timeoutIdsRef.current.delete(id);
          }, highlightDuration);

          timeoutIdsRef.current.set(id, timeoutId);
        });
      }

      // Update previous IDs for next comparison
      previousIdsRef.current = currentIds;
    },
    [highlightDuration, skipInitialLoad]
  );

  const isNew = useCallback(
    (id: string) => newItemIds.has(id),
    [newItemIds]
  );

  return {
    newItemIds,
    updateItems,
    isNew,
  };
}
