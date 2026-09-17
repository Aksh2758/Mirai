"use client";
import * as React from "react"
import { cn } from "@/lib/utils"

const HoverCardContext = React.createContext<{ openDelay?: number, isOpen: boolean, setIsOpen: (v: boolean) => void }>({ isOpen: false, setIsOpen: () => {} });

export function HoverCard({ children, openDelay = 200 }: { children: React.ReactNode, openDelay?: number }) {
  const [isOpen, setIsOpen] = React.useState(false);
  return (
    <HoverCardContext.Provider value={{ isOpen, setIsOpen, openDelay }}>
      <div 
        className="relative inline-block"
        onMouseEnter={() => setIsOpen(true)}
        onMouseLeave={() => setIsOpen(false)}
      >
        {children}
      </div>
    </HoverCardContext.Provider>
  )
}

export function HoverCardTrigger({ children, asChild }: { children: React.ReactNode, asChild?: boolean }) {
  return <>{children}</>
}

export function HoverCardContent({ children, className }: { children: React.ReactNode, className?: string }) {
  const { isOpen } = React.useContext(HoverCardContext);
  if (!isOpen) return null;
  return (
    <div className={cn("absolute z-50 w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none animate-in zoom-in-95 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2", className)}>
      {children}
    </div>
  )
}
