"use client";

import React, { useState } from "react";
import { DashboardSidebar } from "./DashboardSidebar";
import Topbar from "./Topbar";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      <DashboardSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="main" style={{ flex: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <button onClick={() => setSidebarOpen(true)} aria-label="Open navigation">Menu</button>
          <Topbar displayName="Student" xp={0} initials="S" />
        </div>
        {children}
      </div>
    </div>
  );
}
