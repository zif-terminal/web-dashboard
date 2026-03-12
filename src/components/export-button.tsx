"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ExportButtonProps {
  /** Base URL for the export endpoint */
  endpoint: string;
  /** Query parameters to include (filters) */
  params?: Record<string, string | undefined>;
}

export function ExportButton({ endpoint, params }: ExportButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: "csv" | "json") => {
    setIsExporting(true);
    try {
      const url = new URL(endpoint, window.location.origin);
      url.searchParams.set("format", format);
      if (params) {
        for (const [key, value] of Object.entries(params)) {
          if (value !== undefined && value !== "") {
            url.searchParams.set(key, value);
          }
        }
      }

      const response = await fetch(url.toString());
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `Export failed (${response.status})`);
      }

      // Extract filename from Content-Disposition header or generate one
      const disposition = response.headers.get("Content-Disposition");
      const filenameMatch = disposition?.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch?.[1] || `export.${format}`;

      const blob = await response.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (error) {
      console.error("Export failed:", error);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isExporting}>
          {isExporting ? "Exporting..." : "Export"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => handleExport("csv")}>
          Export as CSV
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => handleExport("json")}>
          Export as JSON
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
