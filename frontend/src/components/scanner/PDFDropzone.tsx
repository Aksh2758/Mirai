"use client";
import { useRef, useState } from "react";

interface PDFDropzoneProps {
  file: File | null;
  onFileChange: (file: File | null) => void;
}

export default function PDFDropzone({ file, onFileChange }: PDFDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.type === "application/pdf") onFileChange(dropped);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) onFileChange(picked);
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-xs font-semibold uppercase tracking-wide text-[#6B6B6B]">
            Resume / LinkedIn PDF
          </label>
          <span className="bg-[#E8F5EE] text-[#1A6B3C] text-xs font-semibold px-2 py-0.5 rounded-full">
            ★ Recommended: LinkedIn PDF
          </span>
        </div>

        <div
          onClick={() => inputRef.current?.click()}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`cursor-pointer rounded-xl border-2 border-dashed p-10 text-center transition-all duration-200 ${
            isDragging
              ? "border-[#1A6B3C] bg-[#E8F5EE]"
              : file
              ? "border-[#1A6B3C] bg-[#F5FBF7]"
              : "border-[#E0DDD8] bg-white hover:border-[#1A6B3C] hover:bg-[#F9FCFA]"
          }`}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={handleFileChange}
          />

          {file ? (
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-[#E8F5EE] flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1A6B3C" strokeWidth="2">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[#1A6B3C]">{file.name}</p>
              <p className="text-xs text-[#6B6B6B]">
                {(file.size / 1024 / 1024).toFixed(2)} MB · Click to replace
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-[#F0EDE8] flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6B6B6B" strokeWidth="1.5">
                  <polyline points="16 16 12 12 8 16" />
                  <line x1="12" y1="12" x2="12" y2="21" />
                  <path d="M20.39 18.39A5 5 0 0018 9h-1.26A8 8 0 103 16.3" />
                </svg>
              </div>
              <p className="text-sm font-medium text-[#0D0D0D]">Drop your PDF here</p>
              <p className="text-xs text-[#6B6B6B]">Supports PDF up to 10MB</p>
            </div>
          )}
        </div>

        <p className="mt-2 text-right text-xs text-[#1A6B3C] underline cursor-pointer">
          ⓘ Don't know how to get LinkedIn profile PDF?
        </p>
      </div>
    </div>
  );
}