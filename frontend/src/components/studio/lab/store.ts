import { create } from 'zustand'

export type PersonalityType = 'strict' | 'chill' | 'interviewer'

// Small, non-persisted store shared by the Studio panels (editor, output, copilot).
interface LabState {
  personality: PersonalityType
  setPersonality: (p: PersonalityType) => void

  struggleScore: number
  setStruggleScore: (score: number) => void
  keystrokeLatency: number
  deleteFrequency: number
  lastKeystrokeTime: number
  logKeyPress: (timestamp: number) => void
  logDelete: () => void

  executionTrigger: number
  triggerExecution: () => void

  lastActionLine: number
  lastActionTimestamp: number
  setLastAction: (line: number, timestamp: number) => void

  agentInsights: { source: string; insight: string; timestamp: number }[]
  addAgentInsight: (source: string, insight: string) => void
}

export const useLabStore = create<LabState>()((set) => ({
  personality: 'strict',
  setPersonality: (p) => set({ personality: p }),

  struggleScore: 0,
  setStruggleScore: (score) => set({ struggleScore: score }),
  keystrokeLatency: 120,
  deleteFrequency: 5,
  lastKeystrokeTime: Date.now(),
  logKeyPress: (timestamp) => set((state) => {
    const latency = timestamp - state.lastKeystrokeTime
    const newLatency = state.keystrokeLatency === 0 ? latency : state.keystrokeLatency * 0.8 + latency * 0.2
    let newStruggle = state.struggleScore
    if (latency > 3000 && latency < 10000) newStruggle = Math.min(100, newStruggle + 5)
    return { lastKeystrokeTime: timestamp, keystrokeLatency: newLatency, struggleScore: newStruggle }
  }),
  logDelete: () => set((state) => {
    const newFreq = state.deleteFrequency + 1
    let newStruggle = state.struggleScore
    if (newFreq > 20) newStruggle = Math.min(100, newStruggle + 3)
    return { deleteFrequency: newFreq, struggleScore: newStruggle }
  }),

  executionTrigger: 0,
  triggerExecution: () => set((state) => ({ executionTrigger: state.executionTrigger + 1 })),

  lastActionLine: 1,
  lastActionTimestamp: Date.now(),
  setLastAction: (line, timestamp) => set({ lastActionLine: line, lastActionTimestamp: timestamp }),

  agentInsights: [],
  addAgentInsight: (source, insight) => set((state) => ({
    agentInsights: [...state.agentInsights, { source, insight, timestamp: Date.now() }],
  })),
}))
