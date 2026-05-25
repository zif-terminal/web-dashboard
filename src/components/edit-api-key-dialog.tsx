"use client";

import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadingButton } from "@/components/ui/loading-button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface EditApiKeyDialogProps {
  accountId: string;
  exchangeName: string;
  /** Current api_key value (used to prefill the input). Pass undefined / "" if unset. */
  currentApiKey?: string;
  /** Custom trigger element. If omitted, a default outline button labelled "Edit Key" is rendered. */
  trigger?: ReactNode;
  /** Called after a successful save so callers can re-fetch / refresh local state. */
  onSuccess?: () => void;
}

/**
 * Dialog for rotating / editing the API key on an existing exchange_account.
 *
 * Wraps POST /api/accounts/[id]/api-key (which routes through Hasura with the
 * user's JWT — admin secret is never exposed client-side).
 *
 * On success the API endpoint also flips sync_reset_requested=true and clears
 * last_sync_error so the next sync cycle picks up the new key cleanly.
 */
export function EditApiKeyDialog({
  accountId,
  exchangeName,
  currentApiKey,
  trigger,
  onSuccess,
}: EditApiKeyDialogProps) {
  const [open, setOpen] = useState(false);
  const [apiKey, setApiKey] = useState(currentApiKey ?? "");
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Reset the input back to the prefilled value each time the dialog opens
  // so cancelling discards in-progress edits.
  useEffect(() => {
    if (open) {
      setApiKey(currentApiKey ?? "");
      setShowKey(false);
    }
  }, [open, currentApiKey]);

  const handleSave = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      toast.error("API key cannot be empty");
      return;
    }
    if (trimmed === (currentApiKey ?? "")) {
      toast.info("API key unchanged");
      setOpen(false);
      return;
    }

    setIsSaving(true);
    try {
      const resp = await fetch(`/api/accounts/${accountId}/api-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: trimmed }),
      });

      const data = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        toast.error(data.error || "Failed to update API key");
        return;
      }

      toast.success("API key updated. Next sync will pick it up.");
      setOpen(false);
      onSuccess?.();
    } catch {
      toast.error("Failed to update API key");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline" size="sm">
            <KeyRound className="h-3.5 w-3.5 mr-1.5" />
            Edit Key
          </Button>
        )}
      </DialogTrigger>
      <DialogContent
        // Stop click events from bubbling to row click handlers (e.g.
        // accounts-table rows that navigate to the detail page).
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader>
          <DialogTitle>Edit {exchangeName} API Key</DialogTitle>
          <DialogDescription>
            Rotate or replace the API key for this account. The next sync cycle
            will pick up the new key.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="api-key-input">API Key</Label>
          <div className="relative">
            <Input
              id="api-key-input"
              type={showKey ? "text" : "password"}
              placeholder="Paste your API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              disabled={isSaving}
              autoComplete="off"
              className="pr-10 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
              aria-label={showKey ? "Hide API key" : "Show API key"}
            >
              {showKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            Stored in <code className="text-[10px]">account_type_metadata.api_key</code>.
            Saving requests a sync reset and clears the last sync error.
          </p>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setOpen(false)}
            disabled={isSaving}
          >
            Cancel
          </Button>
          <LoadingButton onClick={handleSave} loading={isSaving}>
            Save Key
          </LoadingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
