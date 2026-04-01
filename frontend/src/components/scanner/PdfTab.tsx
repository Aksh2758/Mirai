'use client'
import { useState, useRef } from 'react'
import { scanPdf } from '@/lib/api'
import type { ExtractedPdfData } from '@/lib/types'

interface Props {
  onDataExtracted: (data: ExtractedPdfData) => void
}

export default function PdfTab({ onDataExtracted }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [extracted, setExtracted] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (file.type !== 'application/pdf') {
      setError('Please upload a PDF file.')
      return
    }

    setFileName(file.name)
    setLoading(true)
    setError(null)

    try {
      const data = await scanPdf(file)
      onDataExtracted(data)
      setExtracted(true)
    } catch (e: any) {
      setError(`Extraction failed: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  if (extracted) {
    return (
      <div style={{ background: '#E8F5EE', border: '1px solid #1A6B3C', borderRadius: 12, padding: '16px 20px' }}>
        <p style={{ color: '#1A6B3C', fontWeight: 600, fontSize: 14 }}>✓ PDF analyzed successfully — {fileName}</p>
      </div>
    )
  }

  return (
    <div 
      onClick={() => !loading && fileInputRef.current?.click()}
      style={{
        background: '#fff', border: '2px dashed #E0DDD8', borderRadius: 12, padding: '40px 24px',
        textAlign: 'center', cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s',
      }}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        accept=".pdf" 
        style={{ display: 'none' }} 
      />
      
      <div style={{ fontSize: 32, marginBottom: 12 }}>📄</div>
      <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>
        {loading ? 'Analyzing...' : 'Upload Resume/LinkedIn PDF'}
      </h3>
      <p style={{ fontSize: 13, color: '#6B6B6B' }}>
        {fileName || 'Drag and drop or click to browse'}
      </p>
      
      {error && <p style={{ color: '#B91C1C', fontSize: 12, marginTop: 12 }}>{error}</p>}
    </div>
  )
}
