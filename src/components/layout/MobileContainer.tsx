import * as React from "react";
import { cn } from "@/lib/utils";

interface ContainerProps {
  children: React.ReactNode;
  className?: string;
}

export function MobileContainer({ children, className }: ContainerProps) {
  return (
    <div className="min-h-screen bg-[#F3F4F6] flex flex-col selection:bg-blue-100 selection:text-blue-900">
      <div className={cn("w-full flex-1 flex flex-col", className)}>
        {children}
      </div>
    </div>
  );
}
