"use client";

interface GitHubInputProps {
  value: string;
  onChange: (value: string) => void;
}

export default function GitHubInput({ value, onChange }: GitHubInputProps) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B6B6B] mb-2">
          GitHub Profile URL
        </label>
        <div className="flex items-center gap-3 bg-white border border-[#E0DDD8] rounded-xl px-4 py-3 focus-within:border-[#1A6B3C] transition-colors">
          {/* GitHub Icon */}
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#6B6B6B">
            <path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" />
          </svg>
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="https://github.com/username"
            className="flex-1 text-sm text-[#0D0D0D] placeholder:text-[#C0BCB8] outline-none bg-transparent"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold uppercase tracking-wide text-[#6B6B6B] mb-2">
          LinkedIn PDF{" "}
          <span className="ml-2 normal-case bg-[#E8F5EE] text-[#1A6B3C] text-xs font-semibold px-2 py-0.5 rounded-full">
            Recommended
          </span>
        </label>
        <div className="bg-[#F0EDE8] border border-[#E0DDD8] rounded-xl px-4 py-3 text-sm text-[#6B6B6B]">
          Switch to PDF Upload tab to upload your LinkedIn profile
        </div>
      </div>
    </div>
  );
}