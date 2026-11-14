import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

/** Horizontal rhythm shared by every page: one max width, adaptive gutters. */
export function PageContainer({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("mx-auto w-full max-w-[1320px] px-5 sm:px-8 lg:px-12", className)} {...props} />;
}
