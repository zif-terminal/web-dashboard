import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface StatCardProps {
  title: string;
  /** Supports string, number, or arbitrary React nodes (e.g. a clickable link). */
  value: React.ReactNode;
  description?: string;
  isLoading?: boolean;
  valueClassName?: string;
}

export function StatCard({
  title,
  value,
  description,
  isLoading = false,
  valueClassName,
}: StatCardProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-8 w-24" />
        ) : (
          <div className={cn("text-2xl font-bold", valueClassName)}>
            {value}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export interface StatsGridProps {
  children: React.ReactNode;
  columns?: 2 | 3 | 4 | 5 | 6;
}

export function StatsGrid({ children, columns = 2 }: StatsGridProps) {
  const colsClass = {
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-4",
    5: "md:grid-cols-5",
    6: "md:grid-cols-6",
  }[columns];

  return <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-4", colsClass)}>{children}</div>;
}
