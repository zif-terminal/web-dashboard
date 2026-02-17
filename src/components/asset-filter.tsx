"use client";

import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface AssetFilterProps {
  assets: string[];
  selectedAssets: string[];
  onSelectionChange: (assets: string[]) => void;
  isLoading?: boolean;
  className?: string;
}

export function AssetFilter({
  assets,
  selectedAssets,
  onSelectionChange,
  isLoading = false,
  className,
}: AssetFilterProps) {
  const handleAssetToggle = (asset: string) => {
    if (selectedAssets.includes(asset)) {
      onSelectionChange(selectedAssets.filter((a) => a !== asset));
    } else {
      onSelectionChange([...selectedAssets, asset]);
    }
  };

  const handleSelectAll = () => {
    onSelectionChange([]);
  };

  const getButtonLabel = () => {
    if (selectedAssets.length === 0) {
      return "All Assets";
    }
    if (selectedAssets.length === 1) {
      return selectedAssets[0];
    }
    return `${selectedAssets.length} assets`;
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={selectedAssets.length > 0 ? "default" : "outline"}
          size="sm"
          className={cn("h-[34px] w-full sm:w-auto sm:min-w-[120px] justify-between", className)}
          disabled={isLoading}
        >
          <span>{isLoading ? "Loading..." : getButtonLabel()}</span>
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[160px]">
        <DropdownMenuLabel>Filter by Asset</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={selectedAssets.length === 0}
          onCheckedChange={handleSelectAll}
        >
          All Assets
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {assets.map((asset) => (
          <DropdownMenuCheckboxItem
            key={asset}
            checked={selectedAssets.includes(asset)}
            onCheckedChange={() => handleAssetToggle(asset)}
          >
            {asset}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
