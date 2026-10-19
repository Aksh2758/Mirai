"use client";

import React, { useState } from "react";
import { Moon, Sun, User, Cpu, Menu, X } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface DashboardNavbarProps {
  onMobileMenuClick: () => void;
  mobileOpen: boolean;
  userName?: string;
}

export function DashboardNavbar({
  onMobileMenuClick,
  mobileOpen,
  userName = "U",
}: DashboardNavbarProps) {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <header className="sticky top-0 z-30 bg-white/80 dark:bg-slate-950/80 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 h-14 flex items-center justify-between transition-colors">
      {/* Left: Logo */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center shadow-md">
          <Cpu className="w-4 h-4 text-white" />
        </div>
        <span className="font-heading font-bold text-lg tracking-tight hidden sm:inline text-slate-800 dark:text-slate-100">
          Nirmaan
        </span>
      </div>

      {/* Right: Theme, Mobile Menu, Profile */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
          className="rounded-xl mr-1 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          {resolvedTheme === "dark" ? (
            <Sun className="w-4 h-4" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          onClick={onMobileMenuClick}
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="w-9 h-9 rounded-full bg-blue-600 flex items-center justify-center text-white font-heading font-bold text-sm hover:opacity-90 transition-opacity focus:outline-none focus:ring-2 focus:ring-blue-500 ring-offset-2 dark:ring-offset-slate-950 ml-2">
              {userName[0]?.toUpperCase()}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-44 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xl"
          >
            <DropdownMenuItem className="gap-2 text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              <User className="w-4 h-4" /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              Badge
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              Activity
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2 text-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
              Settings
            </DropdownMenuItem>
            <div className="h-px bg-slate-200 dark:bg-slate-800 my-1"></div>
            <DropdownMenuItem className="gap-2 text-red-600 dark:text-red-400 dark:hover:bg-slate-800">
              Logout
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
