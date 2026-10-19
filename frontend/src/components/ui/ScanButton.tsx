import React from "react";
import { Loader2 } from "lucide-react";

interface ScanButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  isLoading?: boolean;
}

export function ScanButton({ isLoading, children, className = "", ...props }: ScanButtonProps) {
  return (
    <button
      className={`w-full bg-dark text-white py-3 px-4 rounded-lg font-syne font-semibold 
      hover:bg-dark-surface transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading && <Loader2 className="w-5 h-5 animate-spin" />}
      {children}
    </button>
  );
};