"use client";

import * as React from "react";
import { Button, buttonVariants } from "./button";
import { Spinner } from "./spinner";
import { cn } from "@/lib/utils";
import { type VariantProps } from "class-variance-authority";

interface LoadingButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
  asChild?: boolean;
}

export function LoadingButton({
  children,
  loading = false,
  disabled,
  className,
  ...props
}: LoadingButtonProps) {
  return (
    <Button
      disabled={loading || disabled}
      className={cn(className)}
      {...props}
    >
      {loading && <Spinner size="sm" className="mr-2" />}
      {children}
    </Button>
  );
}
