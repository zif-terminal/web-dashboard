"use client";

import { useState, useRef } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface OmniCsvUploadProps {
  exchangeAccountId: string;
}

interface UploadResult {
  csv_type: string;
  batch_id: string;
  total_rows: number;
  inserted: number;
  duplicates: number;
  parse_errors: string[];
}

export function OmniCsvUpload({
  exchangeAccountId,
}: OmniCsvUploadProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [lastResult, setLastResult] = useState<UploadResult | null>(
    null
  );
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setLastResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("exchange_account_id", exchangeAccountId);

    try {
      const response = await fetch("/api/import/omni", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        toast.error(data.error || "Upload failed");
        return;
      }

      setLastResult(data);
      toast.success(
        `Imported ${data.inserted} rows (${data.duplicates} duplicates skipped)`
      );
    } catch {
      toast.error("Failed to upload CSV");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleUpload(file);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import OMNI CSV</CardTitle>
        <CardDescription>
          Upload trades, transfers, or funding CSV exports from
          Variational/OMNI
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-4">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={onFileChange}
            className="hidden"
            id="omni-csv-input"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? "Uploading..." : "Select CSV File"}
          </Button>
        </div>

        {lastResult && (
          <div className="p-3 bg-muted rounded-md text-sm space-y-1">
            <p>
              <span className="font-medium">Type:</span>{" "}
              {lastResult.csv_type}
            </p>
            <p>
              <span className="font-medium">Inserted:</span>{" "}
              {lastResult.inserted} / {lastResult.total_rows}
            </p>
            {lastResult.duplicates > 0 && (
              <p>
                <span className="font-medium">Duplicates skipped:</span>{" "}
                {lastResult.duplicates}
              </p>
            )}
            {lastResult.parse_errors.length > 0 && (
              <p className="text-destructive">
                <span className="font-medium">Parse errors:</span>{" "}
                {lastResult.parse_errors.length}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
