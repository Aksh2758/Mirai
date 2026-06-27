"use client"

import React, { createContext, useContext, useEffect, useState } from "react"

interface ThemeProviderState {
  theme: "dark" | "light" | "system"
  resolvedTheme: "dark" | "light"
  setTheme: (theme: "dark" | "light" | "system") => void
}

const ThemeProviderContext = createContext<ThemeProviderState>({
  theme: "system",
  resolvedTheme: "light",
  setTheme: () => null,
})

export function ThemeProvider({ children, defaultTheme = "system" }: { children: React.ReactNode, defaultTheme?: string }) {
  const [theme, setTheme] = useState<"dark" | "light" | "system">(defaultTheme as any)
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("light")

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove("light", "dark")
    const active = theme === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme
    root.classList.add(active)
    setResolvedTheme(active)
  }, [theme])

  return (
    <ThemeProviderContext.Provider value={{ theme, resolvedTheme, setTheme }}>
      {children}
    </ThemeProviderContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeProviderContext)
