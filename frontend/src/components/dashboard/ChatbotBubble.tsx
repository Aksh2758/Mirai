"use client";

import React, { useState } from "react";

export default function ChatbotBubble() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="chatbot-bubble" onClick={() => setIsOpen(!isOpen)}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
        </svg>
      </div>

      {isOpen && (
        <div className="chat-panel open">
          <div className="chat-header">
            <div className="chat-avatar">✦</div>
            <div>
              <div className="chat-title">Nirmaan Copilot</div>
              <div className="chat-status">● Online</div>
            </div>
          </div>
          <div className="chat-body">
            <div className="chat-msg bot">
              👋 Hey Arjun! You're on Step 2 of your REST API project. Want me to help
              with JWT implementation?
            </div>
            <div className="chat-msg user">Yes, I'm stuck on token refresh</div>
            <div className="chat-msg bot">
              Got it. Here's the pattern for refresh tokens with FastAPI. Want me to
              apply it directly to your editor?
            </div>
          </div>
          <div className="chat-input-row">
            <input className="chat-input" placeholder="Ask anything..." />
            <button className="chat-send">↑</button>
          </div>
        </div>
      )}
    </>
  );
}
