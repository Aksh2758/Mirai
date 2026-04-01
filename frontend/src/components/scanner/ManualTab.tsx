'use client'
import { useState } from 'react'
import { scanManual } from '@/lib/api'
import type { ExtractedPdfData, ManualAnswer } from '@/lib/types'

interface Props {
  onDataProcessed: (data: ExtractedPdfData) => void
}

const QUESTIONS = [
  { id: 1, question: "Which programming languages do you know? (list them)", type: 'text' },
  { id: 2, question: "Which domain interests you most?", options: ["Web Development", "Machine Learning / AI", "Mobile Apps", "Data Analysis", "DevOps / Cloud", "Not sure yet"], type: 'select' },
  { id: 3, question: "How many years have you been coding?", options: ["Less than 1 year", "1-2 years", "2-4 years", "4+ years"], type: 'select' },
  { id: 4, question: "How many personal/college projects have you built so far?", options: ["0", "1-2", "3-5", "More than 5"], type: 'select' },
  { id: 5, question: "What is your main goal right now?", options: ["Get an internship", "Get a full-time job", "Freelancing", "Just learning"], type: 'select' },
  { id: 6, question: "How many hours per week can you dedicate to building?", options: ["Less than 5 hours", "5-10 hours", "10-20 hours", "More than 20 hours"], type: 'select' },
  { id: 7, question: "Have you worked with databases before?", options: ["No", "Yes, basic SQL", "Yes, SQL and NoSQL", "Yes, advanced (indexing, optimization)"], type: 'select' },
  { id: 8, question: "Have you deployed anything to the internet?", options: ["No", "Yes, a static website", "Yes, a backend/API", "Yes, a full-stack app"], type: 'select' },
]

export default function ManualTab({ onDataProcessed }: Props) {
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const [loading, setLoading] = useState(false)
  const [processed, setProcessed] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    if (Object.keys(answers).length < 5) {
      setError('Please answer at least 5 questions.')
      return
    }

    setLoading(true)
    setError(null)

    const answerList: ManualAnswer[] = Object.entries(answers).map(([id, answer]) => ({
      question_id: parseInt(id),
      question: QUESTIONS.find(q => q.id === parseInt(id))?.question || '',
      answer,
    }))

    try {
      const data = await scanManual(answerList)
      onDataProcessed(data)
      setProcessed(true)
    } catch (e: any) {
      setError(`Failed to process quiz: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  if (processed) {
    return (
      <div style={{ background: '#E8F5EE', border: '1px solid #1A6B3C', borderRadius: 12, padding: '16px 20px' }}>
        <p style={{ color: '#1A6B3C', fontWeight: 600, fontSize: 14 }}>✓ Manual quiz completed and processed successfully</p>
      </div>
    )
  }

  return (
    <div style={{ background: '#fff', border: '1px solid #E0DDD8', borderRadius: 12, padding: '24px' }}>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Skill Quiz</h3>
      <p style={{ fontSize: 13, color: '#6B6B6B', marginBottom: 24 }}>Answer these questions to help us identify your skill level.</p>

      <div style={{ display: 'grid', gap: 20 }}>
        {QUESTIONS.map(q => (
          <div key={q.id}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{q.question}</label>
            {q.type === 'text' ? (
              <input 
                type="text" 
                placeholder="e.g. Python, SQL, React"
                value={answers[q.id] || ''}
                onChange={e => setAnswers({ ...answers, [q.id]: e.target.value })}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 8, border: '1px solid #E0DDD8', fontSize: 13, outline: 'none' }}
              />
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {q.options?.map(opt => (
                  <button
                    key={opt}
                    onClick={() => setAnswers({ ...answers, [q.id]: opt })}
                    style={{
                      padding: '8px 14px', borderRadius: 20, border: '1px solid',
                      fontSize: 12, cursor: 'pointer', transition: 'all 0.15s',
                      borderColor: answers[q.id] === opt ? '#0D0D0D' : '#E0DDD8',
                      background: answers[q.id] === opt ? '#0D0D0D' : '#fff',
                      color: answers[q.id] === opt ? '#fff' : '#6B6B6B',
                    }}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading || Object.keys(answers).length < 5}
        style={{
          marginTop: 24, width: '100%', padding: '12px 0', background: '#0D0D0D', color: '#fff', border: 'none',
          borderRadius: 10, fontSize: 14, fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer',
          opacity: (Object.keys(answers).length < 5) ? 0.5 : 1
        }}
      >
        {loading ? 'Processing...' : 'Submit Quiz Answers'}
      </button>

      {error && <p style={{ color: '#B91C1C', fontSize: 12, marginTop: 12 }}>{error}</p>}
    </div>
  )
}
