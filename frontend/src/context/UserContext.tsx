"use client";

import React, { createContext, useContext, useState, ReactNode } from "react";
import { User, SkillDNA } from "@/lib/types";

interface UserContextType {
  // State
  user: User | null;
  skillDNA: SkillDNA | null;
  currentProject: string | null;
  xpScore: number;

  // Actions
  setUser: (user: User) => void;
  setSkillDNA: (skillDNA: SkillDNA) => void;
  setCurrentProject: (project: string) => void;
  setXpScore: (score: number) => void;
  incrementXpScore: (amount: number) => void;
  clearUserData: () => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [skillDNA, setSkillDNA] = useState<SkillDNA | null>(null);
  const [currentProject, setCurrentProject] = useState<string | null>(null);
  const [xpScore, setXpScore] = useState(0);

  const incrementXpScore = (amount: number) => {
    setXpScore((prev) => prev + amount);
  };

  const clearUserData = () => {
    setUser(null);
    setSkillDNA(null);
    setCurrentProject(null);
    setXpScore(0);
  };

  return (
    <UserContext.Provider
      value={{
        user,
        skillDNA,
        currentProject,
        xpScore,
        setUser,
        setSkillDNA,
        setCurrentProject,
        setXpScore,
        incrementXpScore,
        clearUserData,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
