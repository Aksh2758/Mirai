"use client";
import * as React from "react"
import { cn } from "@/lib/utils"

const DropdownContext = React.createContext<{ isOpen: boolean, setIsOpen: (v: boolean) => void }>({ isOpen: false, setIsOpen: () => {} });

export function DropdownMenu({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = React.useState(false);
  
  // Close on click outside
  React.useEffect(() => {
    const handleClickOutside = () => setIsOpen(false);
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <DropdownContext.Provider value={{ isOpen, setIsOpen }}>
      <div className="relative inline-block text-left" onClick={(e) => e.stopPropagation()}>{children}</div>
    </DropdownContext.Provider>
  )
}

export function DropdownMenuTrigger({ children, asChild }: { children: React.ReactNode, asChild?: boolean }) {
  const { isOpen, setIsOpen } = React.useContext(DropdownContext);
  return (
    <div onClick={() => setIsOpen(!isOpen)} className="cursor-pointer">
      {children}
    </div>
  )
}

export function DropdownMenuContent({ children, className, align = "end" }: { children: React.ReactNode, className?: string, align?: "start" | "center" | "end" }) {
  const { isOpen } = React.useContext(DropdownContext);
  if (!isOpen) return null;
  return (
    <div className={cn("absolute z-50 mt-2 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95", align === "end" ? "right-0" : align === "center" ? "left-1/2 -translate-x-1/2" : "left-0", className)}>
      {children}
    </div>
  )
}

export function DropdownMenuItem({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <div className={cn("relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50", className)}>
      {children}
    </div>
  )
}
