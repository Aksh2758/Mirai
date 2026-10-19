"use client";

import React, { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import Topbar from "./Topbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(true);

  // Apply theme to document root
  useEffect(() => {
    const root = document.documentElement;
    if (isDarkMode) {
      root.setAttribute("data-theme", "dark");
      root.style.colorScheme = "dark";
    } else {
      root.setAttribute("data-theme", "light");
      root.style.colorScheme = "light";
    }
  }, [isDarkMode]);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {sidebarOpen && <Sidebar onClose={() => setSidebarOpen(false)} />}
      <div className="main" style={{ marginLeft: sidebarOpen ? "var(--sidebar-w)" : "0" }}>
        <Topbar 
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)} 
          isDarkMode={isDarkMode}
          onToggleTheme={() => setIsDarkMode(!isDarkMode)}
        />
        {children}
      </div>
    </div>
  );
}
