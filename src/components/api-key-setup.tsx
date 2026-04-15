"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Key, Eye, EyeOff, CheckCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { LoadingButton } from "@/components/ui/loading-button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

interface ApiKeySetupProps {
  accountId: string;
  exchangeName: string;
  onSuccess: () => void;
}

export function ApiKeySetup({ accountId, exchangeName, onSuccess }: ApiKeySetupProps) {
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) {
      toast.error("Please enter an API key");
      return;
    }

    setIsSaving(true);
    try {
      const resp = await fetch(`/api/accounts/${accountId}/api-key`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: trimmed }),
      });

      const data = await resp.json();

      if (!resp.ok) {
        toast.error(data.error || "Failed to save API key");
        return;
      }

      toast.success("API key saved successfully");
      setApiKey("");
      onSuccess();
    } catch {
      toast.error("Failed to save API key");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Card className="border-yellow-500/50">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Key className="h-5 w-5 text-yellow-500" />
          <CardTitle>API Key Required</CardTitle>
        </div>
        <CardDescription>
          {exchangeName} requires an API key to sync your trading data.
          Enter your API key below to activate this account.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showKey ? "text" : "password"}
              placeholder="Enter your API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSave();
              }}
              disabled={isSaving}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              tabIndex={-1}
            >
              {showKey ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </button>
          </div>
          <LoadingButton onClick={handleSave} loading={isSaving}>
            Save Key
          </LoadingButton>
        </div>
      </CardContent>
    </Card>
  );
}

export function ApiKeyConnectedBadge() {
  return (
    <Badge variant="outline" className="text-green-600 border-green-600/30">
      <CheckCircle className="h-3 w-3 mr-1" />
      Connected
    </Badge>
  );
}
