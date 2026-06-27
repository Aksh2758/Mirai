"use client";

import React from "react";
import Link from "next/link";

export default function Sidebar({ onClose }: { onClose?: () => void }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        nirmaan<span>.</span>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Main</div>
        <Link href="/dashboard" className="nav-item active">
          <span className="icon">⊞</span> Dashboard
        </Link>
        <Link href="/forge" className="nav-item">
          <span className="icon">🔨</span> Studio
          <span className="badge">1</span>
        </Link>
        <Link href="/projects" className="nav-item">
          <span className="icon">📊</span> My Projects
        </Link>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Opportunities</div>
        <Link href="/internships" className="nav-item">
          <span className="icon">🎯</span> Internships
        </Link>
        <Link href="/hackathons" className="nav-item">
          <span className="icon">🏆</span> Hackathons
        </Link>
      </div>

      <div className="sidebar-section">
        <div className="sidebar-label">Growth</div>
        <Link href="/grooming" className="nav-item">
          <span className="icon">💼</span> Grooming Lab
        </Link>
        <Link href="/skills" className="nav-item">
          <span className="icon">⚡</span> Skill Hub
        </Link>
      </div>

      <div className="sidebar-spacer"></div>

      <div className="sidebar-user">
        <div className="user-avatar">AK</div>
        <div className="user-info">
          <div className="name">Arjun K.</div>
          <div className="role">Backend Eng.</div>
        </div>
      </div>
    </aside>
  );
}
