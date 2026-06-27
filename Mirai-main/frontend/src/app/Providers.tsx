"use client";

import React, { ReactNode } from "react";

/**
 * Providers shell for the Nirmaan Platform.
 * Legacy Forge and User contexts have been replaced by Zustand-based
 * state management for better performance and smaller bundle sizes.
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <>
      {children}
    </>
  );
}
