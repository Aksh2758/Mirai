import { useState } from 'react';

export type ScannerTab = 'github' | 'pdf' | 'manual';

export interface ManualAnswer {
  questionId: string;
  answer: string | string[];
}

export function useScanner() {
  const [activeTab, setActiveTab] = useState<ScannerTab>('github');
  const [githubUrl, setGithubUrl] = useState('');
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({});

  const addQuizAnswer = (questionId: string, answer: string) => {
    setQuizAnswers((prev) => ({
      ...prev,
      [questionId]: answer,
    }));
  };

  return {
    activeTab,
    setActiveTab,
    githubUrl,
    setGithubUrl,
    uploadedFile,
    setUploadedFile,
    quizAnswers,
    addQuizAnswer,
  };
}
