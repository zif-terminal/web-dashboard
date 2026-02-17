import { ReactNode } from "react";

interface FilterBarProps {
  children?: ReactNode;
  compact?: ReactNode;
}

export function FilterBar({ children, compact }: FilterBarProps) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center sm:gap-2">
      {children}
      {compact && (
        <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-2">
          {compact}
        </div>
      )}
    </div>
  );
}
