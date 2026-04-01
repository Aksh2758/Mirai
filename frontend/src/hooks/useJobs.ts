"use client";

import { useState, useEffect } from "react";
import { Job } from "@/lib/types";
import { fetchJobs } from "@/lib/api";
import { useUser } from "@/context/UserContext";

interface UseJobsReturn {
  jobs: Job[];
  isLoading: boolean;
  error: string | null;
  matchPercentage: (job: Job) => number;
}

const CACHE_KEY = "nirmaan_jobs_cache";
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

interface CachedJobs {
  jobs: Job[];
  timestamp: number;
}

/**
 * Fetch jobs based on user's skill DNA
 * Caches results in localStorage with 24h TTL
 * Gracefully returns empty array if endpoint 404s (backend not yet implemented)
 */
export function useJobs(): UseJobsReturn {
  const { skillDNA } = useUser();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!skillDNA) {
      setJobs([]);
      return;
    }

    const fetchJobsData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // Check cache first
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          const parsed: CachedJobs = JSON.parse(cached);
          const now = Date.now();
          if (now - parsed.timestamp < CACHE_TTL) {
            setJobs(parsed.jobs);
            setIsLoading(false);
            return;
          }
        }

        // Fetch from backend
        const skills = skillDNA.top_languages || [];
        const response = await fetchJobs(skills);

        // Ensure response.jobs is an array, cast to Job[]
        const jobsList: Job[] = (Array.isArray(response.jobs) ? response.jobs : []) as unknown as Job[];

        // Cache the result
        const cacheData: CachedJobs = {
          jobs: jobsList,
          timestamp: Date.now(),
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));

        setJobs(jobsList);
      } catch (err) {
        // Gracefully handle 404 or other errors (endpoint may not exist yet)
        if (err instanceof Error && err.message.includes("404")) {
          // Endpoint doesn't exist—return empty array
          setJobs([]);
          setError(null);
        } else {
          console.error("Jobs API error:", err);
          setError(err instanceof Error ? err.message : "Failed to fetch jobs");
          setJobs([]);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchJobsData();
  }, [skillDNA]);

  const matchPercentage = (job: Job): number => {
    if (!skillDNA || !job.skills) return 0;

    const matchedSkills = job.skills.filter((skill) =>
      skillDNA.top_languages.some((lang) =>
        lang.toLowerCase().includes(skill.toLowerCase()) ||
        skill.toLowerCase().includes(lang.toLowerCase())
      )
    );

    return Math.round((matchedSkills.length / job.skills.length) * 100);
  };

  return {
    jobs,
    isLoading,
    error,
    matchPercentage,
  };
}
