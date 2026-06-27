"use client";
import { useScanner } from "@/hooks/useScanner";
import GitHubInput from "./GitHubInput";
import PDFDropzone from "./PDFDropzone";
import ManualQuiz from "./ManualQuiz";

export default function ScannerTabs() {
  const { activeTab, setActiveTab, githubUrl, setGithubUrl, uploadedFile, setUploadedFile, quizAnswers, addQuizAnswer } = useScanner();

  const tabs: { id: typeof activeTab; label: string }[] = [
    { id: "github", label: "GitHub" },
    { id: "pdf", label: "PDF Upload" },
    { id: "manual", label: "Manual Quiz" },
  ];

  return (
    <div>
      {/* Tab Bar */}
      <div className="flex gap-1 bg-[#F0EDE8] rounded-xl p-1 mb-7">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 text-center py-2 text-sm font-medium rounded-lg transition-all duration-150 ${activeTab === tab.id
              ? "bg-white text-[#0D0D0D] shadow-sm"
              : "text-[#6B6B6B] hover:text-[#0D0D0D]"
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "github" && <GitHubInput value={githubUrl} onChange={setGithubUrl} />}
        {activeTab === "pdf" && <PDFDropzone file={uploadedFile} onFileChange={setUploadedFile} />}
        {activeTab === "manual" && <ManualQuiz answers={quizAnswers} onAnswer={addQuizAnswer} />}
      </div>
    </div>
  );
}