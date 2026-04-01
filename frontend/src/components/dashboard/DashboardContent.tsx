"use client";

import React from "react";
import {
  TodoCard,
  InternshipCard,
  ProjectCard,
  HackathonCard,
  GroomingCard,
  SkillCard,
} from "./DashboardCards";
import ChatbotBubble from "./ChatbotBubble";

export default function DashboardContent() {
  return (
    <div className="content">
      {/* WELCOME */}
      <div className="welcome-row">
        <div>
          <div className="welcome-title">
            Welcome back, <span>Arjun.</span>
          </div>
          <div className="welcome-sub">You're 40% through your REST API project. Keep going.</div>
        </div>
        <button className="continue-btn">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
          Continue building
        </button>
      </div>

      {/* GRID */}
      <div className="dashboard-grid">
        <TodoCard />
        <InternshipCard />
        <ProjectCard />
        <HackathonCard />
        <GroomingCard />
        <SkillCard />
      </div>

      {/* CHATBOT */}
      <ChatbotBubble />
    </div>
  );
}
