"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Activity, Brain, Code2, Terminal } from "lucide-react"
import { useLabStore } from "./store"

interface AlgorithmVisualizerProps {
  code: string;
  language: string;
  isExecuting: boolean;
  onExecutionComplete: () => void;
}

export default function AlgorithmVisualizer({ code, language, isExecuting, onExecutionComplete }: AlgorithmVisualizerProps) {
  const { lastActionLine } = useLabStore()

  // Execution State
  const [outputHtml, setOutputHtml] = useState("")
  const [runId, setRunId] = useState(0) // remounts the iframe so re-running identical code re-executes it

  // 1. Live Output Execution
  useEffect(() => {
    if (isExecuting) {
      setRunId(r => r + 1)
      if (language === "html") {
        setOutputHtml(code)
        setTimeout(() => onExecutionComplete(), 500)
      } else if (language === "javascript" || language === "typescript") {
        // Robust Local JS/TS Sandbox using Babel for TS compilation
        const wrappedCode = `
          <html>
            <head>
              ${language === "typescript" ? '<script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>' : ''}
              <style>
                body { background: #05070f; color: #e2e8f0; font-family: 'JetBrains Mono', monospace; padding: 24px; margin: 0; font-size: 13px; line-height: 1.6; }
                .log { color: #a5b4fc; }
                .err { color: #f43f5e; }
                .sys { color: #06b6d4; font-weight: bold; }
                #logs { white-space: pre-wrap; }
              </style>
            </head>
            <body>
              <div id="logs"><div class="sys">> Booting Neural ${language === "typescript" ? "TypeScript" : "JS"} Engine...</div></div>
              <script>
                const logDiv = document.getElementById('logs');
                function printLog(msg, className) {
                  const el = document.createElement('div');
                  el.textContent = '> ' + msg;
                  if(className) el.className = className;
                  logDiv.appendChild(el);
                }

                const originalLog = console.log;
                const originalError = console.error;

                console.log = function(...args) {
                  originalLog.apply(console, args);
                  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
                  printLog(msg, 'log');
                };

                console.error = function(...args) {
                  originalError.apply(console, args);
                  const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
                  printLog(msg, 'err');
                };

                window.onerror = function(msg, url, lineNo, columnNo, error) {
                  printLog(msg, 'err');
                  return false;
                };

                setTimeout(() => {
                  try {
                    let execCode = ${JSON.stringify(code)};
                    ${language === "typescript" ? `
                      printLog("Transpiling TypeScript to JavaScript...", "sys");
                      execCode = Babel.transform(execCode, { filename: 'script.ts', presets: ['typescript'] }).code;
                    ` : ''}

                    // Execute the code securely
                    const runner = new Function(execCode);
                    runner();
                  } catch(e) {
                    printLog(e.name + ": " + e.message, 'err');
                  }
                }, 100);
              </script>
            </body>
          </html>
        `
        setOutputHtml(wrappedCode)
        setTimeout(() => onExecutionComplete(), 500)
      } else if (language === "python") {
        // Pyodide Python WebAssembly Sandbox
        const pyodideCode = `
          <html>
            <head>
              <script src="https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js"></script>
              <style>
                body { background: #05070f; color: #a5b4fc; font-family: 'JetBrains Mono', monospace; padding: 24px; margin: 0; font-size: 13px; line-height: 1.6; }
                .err { color: #f43f5e; }
                .sys { color: #06b6d4; font-weight: bold; }
                .success { color: #34d399; font-weight: bold; }
                #logs { white-space: pre-wrap; }
              </style>
            </head>
            <body>
              <div id="logs">
                <div class="sys">> Booting Pyodide WebAssembly Runtime...</div>
                <div class="sys" id="status-msg">> Loading standard library (this may take a few seconds)...</div>
              </div>
              <script>
                const logDiv = document.getElementById('logs');
                const statusMsg = document.getElementById('status-msg');

                function printLog(msg, className) {
                  const el = document.createElement('div');
                  el.textContent = '> ' + msg;
                  if(className) el.className = className;
                  logDiv.appendChild(el);
                }

                async function main() {
                  try {
                    let pyodide = await loadPyodide();
                    statusMsg.style.display = 'none';
                    printLog("Runtime Ready. Executing script...", "success");

                    pyodide.setStdout({ batched: (str) => printLog(str) });
                    pyodide.setStderr({ batched: (str) => printLog(str, "err") });

                    await pyodide.runPythonAsync(${JSON.stringify(code)});
                  } catch(e) {
                    statusMsg.style.display = 'none';
                    printLog(e.message, "err");
                  }
                }
                main();
              </script>
            </body>
          </html>
        `
        setOutputHtml(pyodideCode)
        setTimeout(() => onExecutionComplete(), 500)
      } else {
        // Fallback for compiled languages like C++ and Java that need a backend
        // Since Piston is locked down, we use Groq to mathematically simulate the execution!
        const executeSimulation = async () => {
          const loadingHtml = `
            <html>
              <head>
                <style>
                  body { background: #05070f; color: #a5b4fc; font-family: 'JetBrains Mono', monospace; padding: 24px; margin: 0; font-size: 13px; line-height: 1.6; }
                  .sys { color: #d946ef; font-weight: bold; }
                  .pulse { animation: pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite; color: #eab308; margin-top: 12px; }
                  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .5; } }
                </style>
              </head>
              <body>
                <div><span class="sys">> Booting Neural Predictive Engine...</span></div>
                <div class="pulse">> Simulating ${language.toUpperCase()} execution via LLM mapping...</div>
              </body>
            </html>
          `;
          setOutputHtml(loadingHtml);

          try {
            const res = await fetch('/api/studio/predict-output', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ language, code })
            });

            const data = await res.json();
            const outputText = data.output || data.message || "No output generated.";

            const resultHtml = `
              <html>
                <head>
                  <style>
                    body { background: #05070f; color: #e2e8f0; font-family: 'JetBrains Mono', monospace; padding: 24px; margin: 0; font-size: 13px; line-height: 1.6; white-space: pre-wrap; }
                    .sys { color: #d946ef; font-weight: bold; margin-bottom: 16px; }
                    .output { color: #e2e8f0; }
                  </style>
                </head>
                <body>
                  <div class="sys">> Neural Execution Simulation ${res.ok ? "Complete" : "Failed"}</div>
                  <div class="output">${outputText.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                </body>
              </html>
            `;
            setOutputHtml(resultHtml);
          } catch (error: any) {
            setOutputHtml(`
              <html>
                <head><style>body { background: #05070f; color: #f43f5e; font-family: 'JetBrains Mono', monospace; padding: 24px; margin: 0; font-size: 13px; }</style></head>
                <body>> [NEURAL ERROR] Failed to simulate execution: ${error.message}</body>
              </html>
            `);
          } finally {
            setTimeout(() => onExecutionComplete(), 500);
          }
        };

        executeSimulation();
      }
    }
  }, [isExecuting, code, language, onExecutionComplete])

  return (
    <div className="flex flex-col h-full bg-[#020308] text-[#e2e8f0] overflow-hidden relative">
      {/* Terminal header */}
      <div className="h-9 flex items-center gap-3 px-4 border-b border-white/5 flex-shrink-0 z-20">
        <Terminal className="h-3.5 w-3.5 text-emerald-400" />
        <span className="text-[10px] font-black uppercase tracking-[0.25em] text-emerald-400">Output</span>
        {isExecuting && <Activity className="h-3.5 w-3.5 text-amber-400 animate-pulse" />}
      </div>

      <div className="flex-1 relative overflow-hidden flex flex-col z-10">
        <div className="flex-1 bg-[#05070f] overflow-hidden relative">
          {outputHtml ? (
            <iframe
              key={runId}
              srcDoc={outputHtml}
              className="w-full h-full bg-transparent border-none"
              title="Code Output"
              // Pyodide needs same-origin to load; kept to Python only since it weakens isolation
              sandbox={language === "python" ? "allow-scripts allow-same-origin" : "allow-scripts"}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-slate-500 opacity-60">
              <span className="text-[11px] font-black uppercase tracking-[0.4em] text-emerald-500/50">Awaiting Execution</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
