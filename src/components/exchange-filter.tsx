"use client";

import { useEffect, useState } from "react";
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
import { api } from "@/lib/api";
import { Exchange } from "@/lib/queries";

interface ExchangeFilterProps {
  value: string[];
  onChange: (exchangeIds: string[]) => void;
  className?: string;
}

export function ExchangeFilter({
  value,
  onChange,
  className,
}: ExchangeFilterProps) {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchExchanges = async () => {
      try {
        const data = await api.getExchanges();
        setExchanges(data);
      } catch (error) {
        console.error("Failed to fetch exchanges:", error);
      } finally {
        setIsLoading(false);
      }
    };
    fetchExchanges();
  }, []);

  const handleToggle = (exchangeId: string) => {
    if (value.includes(exchangeId)) {
      onChange(value.filter((id) => id !== exchangeId));
    } else {
      onChange([...value, exchangeId]);
    }
  };

  const handleSelectAll = () => {
    onChange([]);
  };

  const getButtonLabel = () => {
    if (value.length === 0) return "All Exchanges";
    if (value.length === 1) {
      const ex = exchanges.find((e) => e.id === value[0]);
      return ex?.display_name ?? "1 exchange";
    }
    return `${value.length} exchanges`;
  };

  // Don't render if no exchanges loaded yet (avoids flash of empty dropdown)
  if (!isLoading && exchanges.length === 0) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant={value.length > 0 ? "default" : "outline"}
          size="sm"
          className={cn("h-[34px] w-full sm:w-auto sm:min-w-[140px] justify-between", className)}
          disabled={isLoading}
        >
          <span>{isLoading ? "Loading..." : getButtonLabel()}</span>
          <ChevronDown className="ml-2 h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[180px]">
        <DropdownMenuLabel>Filter by Exchange</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={value.length === 0}
          onCheckedChange={handleSelectAll}
        >
          All Exchanges
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {exchanges.map((exchange) => (
          <DropdownMenuCheckboxItem
            key={exchange.id}
            checked={value.includes(exchange.id)}
            onCheckedChange={() => handleToggle(exchange.id)}
          >
            {exchange.display_name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
