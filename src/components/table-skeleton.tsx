import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
  columnWidths?: string[];
}

export function TableSkeleton({
  rows = 5,
  columns = 4,
  columnWidths,
}: TableSkeletonProps) {
  const defaultWidths = ["w-24", "w-32", "w-20", "w-16"];

  return (
    <Table>
      <TableHeader>
        <TableRow>
          {Array.from({ length: columns }).map((_, i) => (
            <TableHead key={i}>
              <Skeleton className={`h-4 ${columnWidths?.[i] || defaultWidths[i % defaultWidths.length]}`} />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <TableRow key={rowIndex}>
            {Array.from({ length: columns }).map((_, colIndex) => (
              <TableCell key={colIndex}>
                <Skeleton className={`h-4 ${columnWidths?.[colIndex] || defaultWidths[colIndex % defaultWidths.length]}`} />
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// Pre-configured skeleton for accounts table (3 columns)
export function AccountsTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <TableSkeleton
      rows={rows}
      columns={3}
      columnWidths={["w-24", "w-40", "w-16"]}
    />
  );
}

// Pre-configured skeleton for trades table (8 columns with account, 7 without)
export function TradesTableSkeleton({
  rows = 5,
  showAccount = false,
}: {
  rows?: number;
  showAccount?: boolean;
}) {
  const columns = showAccount ? 8 : 7;
  const widths = showAccount
    ? ["w-32", "w-28", "w-20", "w-14", "w-20", "w-20", "w-16", "w-20"]
    : ["w-32", "w-20", "w-14", "w-20", "w-20", "w-16", "w-20"];

  return <TableSkeleton rows={rows} columns={columns} columnWidths={widths} />;
}
