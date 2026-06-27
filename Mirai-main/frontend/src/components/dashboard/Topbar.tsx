"use client";

import React, { useState } from "react";

interface XPData {
  total: number;
  percent: number;
  breakdown: Array<{ label: string; xp: number }>;
}

interface TopbarProps {
  xpData?: XPData;
  onToggleSidebar?: () => void;
  isDarkMode?: boolean;
  onToggleTheme?: () => void;
}

export default function Topbar({ xpData, onToggleSidebar, isDarkMode = true, onToggleTheme }: TopbarProps) {
  const [showXpTooltip, setShowXpTooltip] = useState(false);
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  const defaultXP: XPData = {
    total: 1090,
    percent: 72,
    breakdown: [
      { label: "Projects completed", xp: 420 },
      { label: "PSI score avg.", xp: 310 },
      { label: "Streak bonus", xp: 180 },
      { label: "Deploy + LinkedIn", xp: 180 },
    ],
  };

  const xp = xpData || defaultXP;

  return (
    <div className="topbar">
      <div className="topbar-left">
        <button className="sidebar-toggle" onClick={onToggleSidebar} title="Toggle sidebar">
          ≡
        </button>
        <span style={{ fontSize: "13px", color: "var(--muted)" }}>Dashboard</span>
      </div>

      <div className="topbar-right">
        {/* XP WIDGET */}
        <div
          className="xp-widget"
          onMouseEnter={() => setShowXpTooltip(true)}
          onMouseLeave={() => setShowXpTooltip(false)}
        >
          <div className="xp-ring-wrap">
            <svg width="40" height="40" viewBox="0 0 40 40">
              <circle className="xp-bg" cx="20" cy="20" r="15" />
              <circle className="xp-fill" cx="20" cy="20" r="15" />
            </svg>
            <div className="xp-num">{xp.percent}</div>
          </div>
          {showXpTooltip && (
            <div className="xp-tooltip">
              <h4>{xp.total.toLocaleString()} XP</h4>
              <div className="xp-subtitle">Overall Growth Score</div>
              <div className="xp-breakdown">
                {xp.breakdown.map((item, idx) => (
                  <div key={idx} className="xp-row">
                    <span>{item.label}</span>
                    <span>+{item.xp} XP</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <button className="theme-btn" onClick={onToggleTheme} title={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}>
          {isDarkMode ? "☽" : "☀"}
        </button>

        {/* PROFILE */}
        <div
          className="profile-btn"
          onMouseEnter={() => setShowProfileDropdown(true)}
          onMouseLeave={() => setShowProfileDropdown(false)}
        >
          AK
          {showProfileDropdown && (
            <div className="profile-dropdown">
              <div className="dd-item">👤 Profile</div>
              <div className="dd-item">🏅 Badges</div>
              <div className="dd-item">📈 Activity</div>
              <div className="dd-item">⚙️ Settings</div>
              <div className="dd-divider"></div>
              <div className="dd-item danger">↪ Log out</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
