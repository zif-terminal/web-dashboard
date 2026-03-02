import { ReactNode } from "react";

interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  prefix?: ReactNode;
}

export function PageHeader({ title, description, action, prefix }: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      {prefix && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
          {prefix}
          <div className="flex-1 min-w-0">
            <h1 className="text-xl md:text-3xl font-bold">{title}</h1>
            {description && (
              <p className="text-sm text-muted-foreground truncate">{description}</p>
            )}
          </div>
        </div>
      )}
      {!prefix && (
        <div>
          <h1 className="text-xl md:text-3xl font-bold">{title}</h1>
          {description && (
            <p className="text-sm text-muted-foreground">{description}</p>
          )}
        </div>
      )}
      {action}
    </div>
  );
}
