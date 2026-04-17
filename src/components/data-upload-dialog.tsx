"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { api } from "@/lib/api";
import { ExchangeAccount } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

/** Exchanges that support manual CSV upload (no sync API). */
const MANUAL_UPLOAD_EXCHANGES = ["variational"];

interface UploadResult {
  csv_type: string;
  batch_id: string;
  total_rows: number;
  inserted: number;
  duplicates: number;
  parse_errors: string[];
}

export function DataUploadDialog() {
  const [open, setOpen] = useState(false);
  const [accounts, setAccounts] = useState<ExchangeAccount[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [isUploading, setIsUploading] = useState(false);
  const [lastResult, setLastResult] = useState<UploadResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    // Reset state when dialog opens
    setSelectedAccountId("");
    setLastResult(null);
    // Fetch accounts and filter to uploadable ones
    api.getAccounts().then((data) => {
      const uploadable = data.filter(
        (a) => a.exchange?.name && MANUAL_UPLOAD_EXCHANGES.includes(a.exchange.name)
      );
      setAccounts(uploadable);
      if (uploadable.length === 1) {
        setSelectedAccountId(uploadable[0].id);
      }
    });
  }, [open]);

  const handleUpload = async (file: File) => {
    if (!selectedAccountId) {
      toast.error("Select an account first");
      return;
    }

    setIsUploading(true);
    setLastResult(null);

    const formData = new FormData();
    formData.append("file", file);
    formData.append("exchange_account_id", selectedAccountId);

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

  const accountLabel = (account: ExchangeAccount) => {
    const exchange = account.exchange?.display_name || "Unknown";
    const label = account.label || account.account_identifier;
    return `${exchange} - ${label}`;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Upload className="h-4 w-4 mr-2" />
          Upload Data
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload Data</DialogTitle>
          <DialogDescription>
            Upload trades, transfers, or funding CSV exports for exchanges
            without API sync.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {accounts.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No accounts support manual upload. Data for other exchanges syncs
              automatically.
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="upload-account">Account</Label>
                <Select
                  value={selectedAccountId}
                  onValueChange={setSelectedAccountId}
                >
                  <SelectTrigger id="upload-account" className="w-full">
                    <SelectValue placeholder="Select an account" />
                  </SelectTrigger>
                  <SelectContent>
                    {accounts.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {accountLabel(account)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>CSV File</Label>
                <p className="text-xs text-muted-foreground">
                  The file format is auto-detected (trades, transfers, or
                  funding).
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={onFileChange}
                  className="hidden"
                  id="data-upload-input"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading || !selectedAccountId}
                  className="w-full"
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
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
