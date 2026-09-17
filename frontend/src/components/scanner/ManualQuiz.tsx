"use client";

interface ManualQuizProps {
  answers: Record<string, string>;
  onAnswer: (questionId: string, answer: string) => void;
}

export default function ManualQuiz({ answers, onAnswer }: ManualQuizProps) {
  const QUESTIONS = [
    {
      id: "q1",
      text: "Which of these sounds most like you?",
      options: ["I build backend APIs", "I design UIs", "I work with data", "I'm just starting out"],
    },
    {
      id: "q2",
      text: "Which language have you used the most?",
      options: ["Python", "JavaScript", "Java / C++", "None yet"],
    },
    {
      id: "q3",
      text: "What kind of projects interest you most?",
      options: ["Web apps", "ML / AI models", "Mobile apps", "DevOps / Cloud"],
    },
    {
      id: "q4",
      text: "How comfortable are you with databases?",
      options: ["Very comfortable", "Basic CRUD", "Heard of them", "Not at all"],
    },
    {
      id: "q5",
      text: "How long have you been coding?",
      options: ["Less than 6 months", "6–12 months", "1–2 years", "3+ years"],
    },
    {
      id: "q6",
      text: "Do you have any deployed projects?",
      options: ["Yes, multiple", "One project", "In progress", "Not yet"],
    },
    {
      id: "q7",
      text: "What's your main goal right now?",
      options: ["Get an internship", "Build a portfolio", "Learn a new skill", "Switch careers"],
    },
  ];

  const answered = Object.keys(answers).length;

  return (
    <div className="flex flex-col gap-4">
      {/* Progress */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-[#6B6B6B]">{answered} of {QUESTIONS.length} answered</span>
        <div className="w-32 h-1.5 bg-[#E0DDD8] rounded-full overflow-hidden">
          <div
            className="h-full bg-[#1A6B3C] rounded-full transition-all duration-300"
            style={{ width: `${(answered / QUESTIONS.length) * 100}%` }}
          />
        </div>
      </div>

      {QUESTIONS.map((q, i) => (
        <div
          key={q.id}
          className="bg-white border border-[#E0DDD8] rounded-xl p-4"
          style={{ animationDelay: `${i * 60}ms` }}
        >
          <p className="text-sm font-medium text-[#0D0D0D] mb-3">
            <span className="text-[#6B6B6B] mr-1">{i + 1}.</span> {q.text}
          </p>
          <div className="flex flex-wrap gap-2">
            {q.options.map((opt) => (
              <button
                key={opt}
                onClick={() => onAnswer(q.id, opt)}
                className={`text-xs px-3 py-1.5 rounded-full border transition-all duration-150 ${
                  answers[q.id] === opt
                    ? "bg-[#1A6B3C] text-white border-[#1A6B3C]"
                    : "bg-white text-[#0D0D0D] border-[#E0DDD8] hover:border-[#1A6B3C] hover:text-[#1A6B3C]"
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}