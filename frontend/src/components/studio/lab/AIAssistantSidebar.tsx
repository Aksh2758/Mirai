"use client"

import { useState, useRef, useEffect } from "react"
import { Bot, Send, Loader2, Code2, AlertTriangle, UserCircle, Cpu, Zap, Lightbulb, HelpCircle, BrainCircuit, Terminal, Fingerprint, Minus, X } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useLabStore } from "./store"
import { getGroqStreamingCompletion } from "./groq"

interface AIAssistantSidebarProps {
  code: string;
  language: string;
  fileName: string | null;
}

// Idle pause before the copilot offers a short nudge
const IDLE_HINT_MS = 8000
// If the user is still idle this long after the nudge, the copilot gives the full answer
const IDLE_ANSWER_MS = 10000
// Cursor resting on one line this long triggers the auto line explanation (when toggled on)
const EXPLAIN_DWELL_MS = 3000
// The floating explanation shrinks to a pill after this long
const EXPLAIN_AUTOHIDE_MS = 15000

type ExplainCard = { line: number; concept: string; text: string; loading: boolean }

export default function AIAssistantSidebar({ code, language, fileName }: AIAssistantSidebarProps) {
  const { struggleScore, personality, addAgentInsight, lastActionLine, lastActionTimestamp, agentInsights } = useLabStore()
  const [input, setInput] = useState("")
  const [isThinking, setIsThinking] = useState(false)
  const [isProactive, setIsProactive] = useState(false)
  const [chatHistory, setChatHistory] = useState<{role: 'user'|'assistant', content: string}[]>([])
  const [currentStream, setCurrentStream] = useState("")
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [chatHistory, currentStream])

  const handleSend = async (forcedInput?: string) => {
    const userMessage = forcedInput || input
    if (!userMessage.trim() || isThinking) return

    if (!forcedInput) setInput("")

    setChatHistory(prev => [...prev, { role: 'user', content: userMessage }])
    setIsThinking(true)
    setCurrentStream("")

    // REVERSE LEARNING PROMPT LOGIC
    const systemPrompt = `You are the Mirai Reverse Learning Mentor.
    Personality: ${personality}.
    Current User Struggle Score: ${struggleScore}/100.

    RULES FOR REVERSE LEARNING:
    1. NEVER give the full solution immediately.
    2. SOCRATIC METHOD: Ask questions that guide the user to the answer.
    3. HINTING: If the user asks for a hint or struggleScore > 60, provide a CONCEPTUAL HINT.
    4. CODE SNIPPETS: Only provide small syntax examples. Avoid logic-heavy snippets unless struggleScore > 85.
    5. IDENTIFY CONCEPTS: Explicitly name the coding concepts involved (e.g., "Closure", "Box Model", "Flexbox").
    6. REVERSAL: Ask the user "What do you think happens if we change X?" or "Why did you choose this approach?"

    CROSS-AGENT NEURAL CONTEXT:
    Other agents in the Grooming Lab have observed the following:
    ${agentInsights.length > 0 ? agentInsights.map(a => `[${a.source}]: ${a.insight}`).join("\n") : "No shared insights yet."}

    Instruction: Reference these findings if they are relevant to the current user struggle. It makes the system feel unified.

    Context (open file: ${fileName ?? "none"}):
    \`\`\`${language}
    ${code}
    \`\`\``

    try {
      let fullResponse = ""
      await getGroqStreamingCompletion([
        { role: "system", content: systemPrompt },
        ...chatHistory,
        { role: "user", content: userMessage }
      ], (chunk) => {
        fullResponse += chunk
        setCurrentStream(fullResponse)
      })

      setChatHistory(prev => [...prev, { role: 'assistant', content: fullResponse }])
      addAgentInsight("Mentor", `Diagnostic query handled at ${struggleScore}% struggle.`);
    } catch (e: any) {
      setChatHistory(prev => [...prev, { role: 'assistant', content: `🚨 Neural Link Error: ${e.message}` }])
    } finally {
      setIsThinking(false)
      setIsProactive(false)
      setCurrentStream("")
    }
  }

  // "nudge": short suggestion first. "answer": the full solution, if the user is still idle after the nudge.
  const handleProactiveHint = async (mode: "nudge" | "answer") => {
    if (isThinking) return
    setIsThinking(true)
    setIsProactive(true)
    setCurrentStream("")

    const task = mode === "nudge"
      ? `They have paused for a few seconds on line ${lastActionLine}.
    From the code so far, infer what they are most likely trying to build, then suggest in 1-2 short sentences what they could do next (name the concept or the next step).
    Do NOT write the full solution; a tiny syntax hint is fine.`
      : `They have stayed stuck on line ${lastActionLine} even after a nudge.
    Infer what they are trying to build and give the complete answer: the finished or corrected code for this file in one fenced code block, then 1-2 sentences on how it works.`

    const observerPrompt = `You are the Mirai coding copilot watching the user write ${language.toUpperCase()} in the file "${fileName ?? "untitled"}".
    ${task}

    Code:
    \`\`\`${language}
    ${code}
    \`\`\``

    try {
      let fullResponse = ""
      await getGroqStreamingCompletion([
        { role: "system", content: observerPrompt }
      ], (chunk) => {
        fullResponse += chunk
        setCurrentStream(fullResponse)
      }, mode === "nudge" ? "fast" : "deep")

      const label = mode === "nudge" ? "💡 Suggestion" : "✅ Full answer"
      setChatHistory(prev => [...prev, { role: 'assistant', content: `${label}\n${fullResponse}` }])
      addAgentInsight("Observer", `Proactive ${mode} delivered for line ${lastActionLine}.`);
    } catch (e: any) {
      // silent fail for proactive
    } finally {
      setIsThinking(false)
      setIsProactive(false)
      setCurrentStream("")
    }
  }

  // Idle suggestions: a nudge after IDLE_HINT_MS, then the full answer IDLE_ANSWER_MS later if the
  // user still hasn't touched anything. Any activity changes lastActionTimestamp and restarts both.
  // Only activity from this session counts: the store persists lastActionTimestamp, so an old
  // value must not fire a hint on load.
  const mountedAt = useRef(Date.now())
  const hintRef = useRef(handleProactiveHint)
  hintRef.current = handleProactiveHint
  const codeRef = useRef(code)
  codeRef.current = code

  useEffect(() => {
    if (lastActionTimestamp <= mountedAt.current || !fileName || !code.trim()) return
    const nudge = setTimeout(() => hintRef.current("nudge"), IDLE_HINT_MS)
    const answer = setTimeout(() => hintRef.current("answer"), IDLE_HINT_MS + IDLE_ANSWER_MS)
    return () => {
      clearTimeout(nudge)
      clearTimeout(answer)
    }
  }, [lastActionTimestamp, fileName])

  // Auto line explanation (toggle): cursor rests on a line -> floating card
  const [autoExplain, setAutoExplain] = useState(true)
  const [card, setCard] = useState<ExplainCard | null>(null)
  const [cardMinimized, setCardMinimized] = useState(false)
  const explainCache = useRef<Map<string, { concept: string; text: string }>>(new Map())

  useEffect(() => {
    if (!autoExplain) {
      setCard(null)
      return
    }
    if (lastActionTimestamp <= mountedAt.current || !fileName) return
    const lineText = codeRef.current.split("\n")[lastActionLine - 1]?.trim()
    if (!lineText) return

    let cancelled = false
    const timer = setTimeout(async () => {
      const key = `${language}:${lineText}`
      const cached = explainCache.current.get(key)
      if (cached) {
        setCard({ line: lastActionLine, ...cached, loading: false })
        setCardMinimized(false)
        return
      }
      setCard({ line: lastActionLine, concept: "Analyzing", text: "Reading this line...", loading: true })
      setCardMinimized(false)
      try {
        const res = await fetch("/api/studio/explain-line", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: codeRef.current, line: lastActionLine, language, lineText })
        })
        const data = await res.json()
        if (!res.ok || !data.explanation) throw new Error(data.error || "No explanation returned")
        const result = { concept: data.concept || "Code Logic", text: data.explanation }
        explainCache.current.set(key, result)
        if (!cancelled) setCard({ line: lastActionLine, ...result, loading: false })
      } catch (e: any) {
        if (!cancelled) setCard({ line: lastActionLine, concept: "Error", text: `Couldn't explain this line: ${e.message}`, loading: false })
      }
    }, EXPLAIN_DWELL_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [autoExplain, lastActionTimestamp, lastActionLine, fileName, language])

  // Shrink the card to a pill a while after it finishes loading
  useEffect(() => {
    if (!card || card.loading || cardMinimized) return
    const timer = setTimeout(() => setCardMinimized(true), EXPLAIN_AUTOHIDE_MS)
    return () => clearTimeout(timer)
  }, [card, cardMinimized])

  const handleHintRequest = () => {
    handleSend("Can you give me a small hint on what to do next? Don't give me the code, just a nudge.")
  }

  return (
    <div className="flex flex-col h-full bg-[#020308] relative overflow-hidden min-w-0 break-words w-full">
      {/* Header */}
      <div className="h-14 flex flex-shrink-0 items-center justify-between px-8 border-b border-white/5 bg-[#020308]/40 backdrop-blur-3xl z-20">
        <div className="flex flex-col">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400">AI Copilot</span>
          <span className="text-[8px] font-mono text-slate-500 uppercase tracking-widest mt-0.5 truncate max-w-[180px]">{fileName ? `Watching: ${fileName}` : "No file open"}</span>
        </div>
        <div className="flex items-center gap-2.5 px-3 py-1 bg-white/5 rounded-full border border-white/5">
           <div className={`h-2 w-2 rounded-full ${struggleScore > 60 ? 'bg-rose-500 animate-pulse' : 'bg-cyan-500 shadow-[0_0_8px_var(--neural-cyan)]'}`} />
           <span className="text-[9px] font-black text-slate-400 tracking-tighter">{struggleScore}%</span>
        </div>
      </div>

      {/* Floating line explanation (minimizable, auto-minimizes) */}
      <AnimatePresence>
        {autoExplain && card && (
          cardMinimized ? (
            <motion.button
              key="pill"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              onClick={() => setCardMinimized(false)}
              className="absolute top-16 right-3 z-30 max-w-[85%] truncate px-3 py-1.5 bg-[#050a15]/95 border border-cyan-500/30 rounded-full text-[10px] font-black uppercase tracking-widest text-cyan-400 shadow-lg"
            >
              Line {card.line} · {card.concept}
            </motion.button>
          ) : (
            <motion.div
              key="card"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-16 left-3 right-3 z-30 p-4 bg-[#050a15]/95 border border-cyan-500/30 rounded-2xl shadow-[0_20px_60px_rgba(6,182,212,0.2)] backdrop-blur-3xl"
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  {card.loading && <Loader2 className="h-3 w-3 animate-spin text-cyan-400 shrink-0" />}
                  <span className="text-[9px] font-black uppercase text-cyan-400 tracking-[0.2em] shrink-0">Line {card.line}</span>
                  <span className="text-[9px] font-mono text-slate-400 uppercase tracking-widest truncate">{card.concept}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => setCardMinimized(true)} aria-label="Minimize" className="p-1 rounded hover:bg-white/10 text-slate-400"><Minus className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setCard(null)} aria-label="Dismiss" className="p-1 rounded hover:bg-white/10 text-slate-400"><X className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              <p className="text-[12px] text-slate-200 leading-relaxed">{card.text}</p>
            </motion.div>
          )
        )}
      </AnimatePresence>

      {/* Chat Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-8 space-y-10 scrollbar-hide bg-transparent relative z-10">
          {chatHistory.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-full flex flex-col items-center justify-center text-center px-4"
            >
              <div className="h-20 w-20 rounded-[2rem] bg-cyan-500/5 border border-cyan-500/10 flex items-center justify-center mb-8 shadow-2xl relative group">
                <div className="absolute inset-0 bg-cyan-500/10 blur-2xl rounded-full opacity-50 group-hover:opacity-100 transition-opacity" />
                <Bot className="h-10 w-10 text-cyan-400 relative z-10" />
              </div>
              <h3 className="text-white text-[14px] font-black uppercase tracking-[0.3em] mb-4">Neural Mentor</h3>
              <p className="text-[11px] text-slate-500 leading-relaxed max-w-[260px] font-medium">
                Calibrating growth path. I will provide conceptual guidance without direct logic leakage.
              </p>
              <button
                onClick={() => handleSend("I'm ready. Analyze my current code and ask me a diagnostic question.")}
                className="mt-10 px-8 py-3 bg-white text-black rounded-2xl text-[10px] font-black hover:scale-105 active:scale-95 transition-all uppercase tracking-[0.3em] shadow-[0_0_30px_rgba(255,255,255,0.15)]"
              >
                Sync consciousness
              </button>
            </motion.div>
          ) : (
            <>
              {chatHistory.map((msg, i) => (
                <motion.div initial={{ opacity: 0, x: msg.role === 'user' ? 10 : -10 }} animate={{ opacity: 1, x: 0 }} key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-2 mb-3 text-[9px] font-black uppercase tracking-[0.25em] text-slate-600">
                    {msg.role === 'user' ? (
                      <span className="flex items-center gap-2"><UserCircle className="h-3.5 w-3.5" /> Aspirant</span>
                    ) : (
                      <span className="flex items-center gap-2 text-cyan-400"><Cpu className="h-3.5 w-3.5" /> Mentor</span>
                    )}
                  </div>
                  <div className={`text-[12px] leading-relaxed p-5 rounded-[2rem] max-w-[92%] shadow-2xl ${
                    msg.role === 'user'
                    ? 'bg-cyan-500/10 text-cyan-100 border border-cyan-500/20 backdrop-blur-3xl'
                    : 'bg-white/5 text-slate-300 border border-white/5 backdrop-blur-3xl whitespace-pre-wrap'
                  }`}>
                    {msg.content}
                  </div>
                </motion.div>
              ))}

              {(isThinking || currentStream) && (
                <div className="flex flex-col items-start">
                  <div className={`flex items-center gap-2 mb-3 text-[9px] font-black uppercase tracking-[0.25em] ${isProactive ? 'text-magenta-400' : 'text-cyan-400'}`}>
                    <Loader2 className={`h-3.5 w-3.5 ${isProactive ? '' : 'animate-spin'}`} />
                    {isProactive ? 'Neural Pulse Detected' : 'Synthesizing Response'}
                  </div>
                  <div className={`text-[12px] p-5 rounded-[2rem] border whitespace-pre-wrap leading-relaxed max-w-[92%] min-h-[56px] shadow-2xl ${
                    isProactive
                    ? 'bg-magenta-500/10 border-magenta-500/20 text-magenta-200 backdrop-blur-3xl'
                    : 'bg-white/5 border-white/5 text-slate-300 backdrop-blur-3xl'
                  }`}>
                    {currentStream}
                    <span className={`inline-block w-1.5 h-3.5 ml-1 animate-pulse ${isProactive ? 'bg-magenta-500' : 'bg-cyan-400'}`} />
                  </div>
                </div>
              )}
            </>
          )}
      </div>

      {/* Control Area */}
      <div className="p-8 bg-[#020308]/60 backdrop-blur-3xl border-t border-white/5 relative z-20">
        <div className="flex gap-3 mb-5">
           <button
             onClick={() => setAutoExplain(v => !v)}
             aria-pressed={autoExplain}
             title="When on, resting your cursor on a line explains it in a floating card"
             className={`flex-1 flex items-center justify-center gap-2.5 py-3 border rounded-2xl text-[9px] font-black transition-all uppercase tracking-widest ${
               autoExplain ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-white/5 border-white/10 text-slate-500"
             }`}
           >
             <Code2 className="h-3.5 w-3.5" />
             Explain line: {autoExplain ? "On" : "Off"}
           </button>
           <button
             onClick={handleHintRequest}
             className="flex-1 flex items-center justify-center gap-2.5 py-3 bg-cyan-500/5 border border-cyan-500/10 rounded-2xl text-[9px] font-black text-cyan-400 hover:bg-cyan-500/10 transition-all uppercase tracking-widest"
           >
             <Lightbulb className="h-3.5 w-3.5" />
             Small Hint
           </button>
           <button
             onClick={() => handleSend("Explain the core concepts I'm currently using.")}
             className="flex-1 flex items-center justify-center gap-2.5 py-3 bg-magenta-500/5 border border-magenta-500/10 rounded-2xl text-[9px] font-black text-magenta-400 hover:bg-magenta-500/10 transition-all uppercase tracking-widest"
           >
             <Fingerprint className="h-3.5 w-3.5" />
             Core Logic
           </button>
        </div>
        <div className="relative group">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            placeholder="Talk to your growth coach..."
            className="w-full bg-[#050508] border border-white/10 rounded-2xl pl-6 pr-14 py-5 text-[12px] text-white placeholder:text-slate-600 focus:outline-none focus:border-cyan-500/40 focus:ring-1 focus:ring-cyan-500/20 transition-all resize-none h-24 scrollbar-hide shadow-2xl"
          />
          <button
            onClick={() => handleSend()}
            disabled={isThinking || !input.trim()}
            className="absolute right-5 bottom-5 p-2.5 bg-white text-black rounded-xl transition-all shadow-lg active:scale-90 disabled:opacity-30"
          >
            <Send className="h-4.5 w-4.5" />
          </button>
        </div>
      </div>
    </div>
  )
}
