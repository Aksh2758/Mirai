"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Home,
  Code2,
  BookOpen,
  Briefcase,
  Trophy,
  FlaskConical,
  User,
  X,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const sidebarLinks = [
  { label: "Home", href: "/dashboard", icon: Home },
  { label: "Studio", href: "/forge", icon: Code2 },
  { label: "Skill Hub", href: "/scanner", icon: BookOpen, badge: "6%" },
  { label: "Internships", href: "/discover", icon: Briefcase, dot: true },
  { label: "Hackathons", href: "/discover", icon: Trophy },
  { label: "Grooming Lab", href: "/dashboard", icon: FlaskConical },
  { label: "Profile", href: "/dashboard", icon: User },
];

interface DashboardSidebarProps {
  open: boolean;
  onClose: () => void;
}

export function DashboardSidebar({ open, onClose }: DashboardSidebarProps) {
  const pathname = usePathname();

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sidebar panel */}
          <motion.aside
            initial={{ x: -280 }}
            animate={{ x: 0 }}
            exit={{ x: -280 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed left-0 top-0 bottom-0 z-50 w-64 border-r border-border/50 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl flex flex-col shadow-2xl transition-colors"
          >
            {/* Header */}
            <div className="p-5 pb-4 flex items-center justify-between">
              <span className="font-heading font-extrabold text-xl tracking-tight text-zinc-900 dark:text-zinc-100">
                Menu
              </span>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors text-zinc-500 dark:text-zinc-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Nav */}
            <nav className="flex-1 px-3 space-y-1.5 overflow-y-auto mt-2">
              {sidebarLinks.map((link) => {
                const isActive = pathname === link.href || pathname?.startsWith(link.href + "/");
                const Icon = link.icon;
                return (
                  <Link
                    key={link.label}
                    href={link.href}
                    onClick={onClose}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 group",
                      isActive
                        ? "bg-zinc-900 text-white dark:bg-emerald-600"
                        : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800/50"
                    )}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="flex-1">{link.label}</span>
                    {link.badge && (
                      <span className="bg-emerald-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                        {link.badge}
                      </span>
                    )}
                    {link.dot && (
                      <span className="w-2 h-2 rounded-full bg-orange-500" />
                    )}
                  </Link>
                );
              })}
            </nav>

            {/* Pro banner */}
            <div className="p-4 mt-auto">
              <div className="rounded-2xl bg-zinc-900 dark:bg-zinc-800 p-5 text-zinc-50 space-y-3 shadow-xl">
                <p className="font-heading font-black text-sm text-emerald-400">PRO Hub</p>
                <p className="text-xs opacity-80 leading-relaxed font-medium">
                  Get access to mentorship and exclusive acceleration features.
                </p>
                <button className="w-full bg-white/10 hover:bg-white/20 text-white text-xs font-bold py-2.5 px-4 rounded-xl transition-colors shrink-0">
                  Upgrade View
                </button>
              </div>
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
