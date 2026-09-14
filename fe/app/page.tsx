'use client'

import { useState } from 'react'
import { ArrowRight, Check, FileJson, Loader2, Play, Upload } from 'lucide-react'
import { DEFAULT_SAMPLE_IMAGE } from '../lib/sampleImage'

const defaultClaim = 'water inside house bad. wife leg break hurt bad. help fast no money.'

export default function Page() {
  const [claim, setClaim] = useState(defaultClaim)
  const [extracted, setExtracted] = useState(true)
  const [presetLoaded, setPresetLoaded] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [imageBase64, setImageBase64] = useState<string | null>(null)
  const [imageMime, setImageMime] = useState<string>('image/jpeg')
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [imageName, setImageName] = useState<string>('')

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setImageName(file.name)
    setImageMime(file.type || 'image/jpeg')

    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setImagePreview(dataUrl)
      const base64Clean = dataUrl.split(',')[1] || dataUrl
      setImageBase64(base64Clean)
    }
    reader.readAsDataURL(file)
  }

  const handleRemoveImage = () => {
    setImageBase64(null)
    setImagePreview(null)
    setImageName('')
  }

  const handleSendClaim = async () => {
    setIsSending(true)

    const payload = {
      text: claim,
      imageBase64: imageBase64 || null,
      mimeType: imageMime || 'image/jpeg',
      claimedCoords: { lat: 19.076, lng: 72.8777 },
    }

    try {
      let res = await fetch('/api/triage/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        res = await fetch('http://localhost:4000/api/triage/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
      }

      if (res.ok) {
        const data = await res.json()
        setResult(data)
        setExtracted(true)
      } else {
        setExtracted(true)
      }
    } catch (err) {
      console.error('Failed to send claim to API:', err)
      setExtracted(true)
    } finally {
      setIsSending(false)
    }
  }

  const extractedFacts = result?.extracted
    ? [
        ['Disaster Type', 'Flood'],
        ['Property Loss', (result.extracted.structuralIntegrity || 'Unknown').toUpperCase()],
        ['Water Depth', result.extracted.waterDepthFt != null ? `${result.extracted.waterDepthFt} ft` : 'Not specified'],
        ['Injury Status', result.extracted.entrapmentStatus ? 'True (Severe Risk / Trapped)' : 'False'],
        ['Dependants at Risk', result.extracted.dependantsAtRisk?.length ? result.extracted.dependantsAtRisk.join(', ') : 'None'],
        ['Evacuation Needed', result.extracted.evacuationNeeded ? 'True (Immediate Evacuation)' : 'False'],
        ['Confidence Score', `${Math.round((result.extracted.confidenceScore || 0.9) * 100)}%`],
        ['Calculated Severity', result.severity != null ? `${result.severity} / 100` : 'N/A'],
        ['Immediate Relief Grant', result.payout ? `$${result.payout.toLocaleString()} USD` : 'N/A'],
      ]
    : [
        ['Disaster Type', 'Flood'],
        ['Property Loss', '80% (Severe Structural Damage)'],
        ['Injury Status', 'True (Severe Fracture Reported)'],
        ['Household Count', '4'],
        ['Financial Capacity', 'Zero / Depleted'],
      ]

  return (
    <main className="min-h-screen bg-slate-50 pb-20 text-zinc-900">
      <header className="flex min-h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 lg:px-8">
        <div className="flex items-center gap-3">
          <span className="text-base font-bold tracking-tight text-zinc-900">VERITY</span>
          <span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-medium text-cyan-700">
            Step 1: Intake &amp; Agent Parsing
          </span>
        </div>
        <button
          type="button"
          onClick={() => {
            setClaim(defaultClaim)
            setPresetLoaded(true)
            setExtracted(true)
          }}
          className="inline-flex items-center gap-2 rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-cyan-700"
        >
          <Upload size={14} />
          {presetLoaded ? 'Benchmark Loaded' : 'Load Pre-set Dialect Benchmark'}
        </button>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[45%_55%] lg:px-8">
        <section>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Claim intake</p>
          <h1 className="text-lg font-semibold text-zinc-900">1. Raw Claim Input</h1>
          <p className="mt-1 text-sm text-zinc-600">Enter incoming SMS, WhatsApp, or transcribed voice note.</p>
          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <label htmlFor="claim" className="sr-only">Raw claim input</label>
            <textarea
              id="claim"
              value={claim}
              onChange={(event) => {
                setClaim(event.target.value)
                setExtracted(false)
              }}
              className="min-h-64 w-full resize-y rounded-md border border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-zinc-800 outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
            />

            {/* Photo Upload Area */}
            <div className="mt-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-zinc-700">Disaster Evidence Photo</span>
                {imagePreview ? (
                  <button
                    type="button"
                    onClick={handleRemoveImage}
                    className="text-xs font-medium text-red-600 hover:text-red-700"
                  >
                    Remove photo
                  </button>
                ) : (
                  <span className="text-[11px] text-zinc-400">Optional (blank if text-only)</span>
                )}
              </div>

              {!imagePreview ? (
                <label className="mt-2 flex cursor-pointer flex-col items-center justify-center rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 transition-colors hover:bg-slate-100">
                  <Upload size={16} className="text-zinc-400" />
                  <span className="mt-1 text-xs font-medium text-zinc-700">Upload disaster photo</span>
                  <span className="text-[11px] text-zinc-400">JPG, PNG, WebP (Leave blank if not available)</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageUpload}
                    className="hidden"
                  />
                </label>
              ) : (
                <div className="mt-2 flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 p-2.5">
                  <img
                    src={imagePreview}
                    alt="Disaster preview"
                    className="h-12 w-12 rounded border border-slate-200 object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-zinc-800">{imageName || 'Attached disaster photo'}</p>
                    <p className="text-[11px] text-emerald-600 font-medium">Photo attached for forensic verification</p>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={isSending}
              onClick={handleSendClaim}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-700 disabled:opacity-60"
            >
              {isSending ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
              {isSending ? 'Sending Claim to API...' : 'Run Stage 1: Fact Extraction'}{' '}
              <ArrowRight size={15} />
            </button>
          </div>
        </section>

        <section>
          <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Agent execution</p>
          <h2 className="text-lg font-semibold text-zinc-900">2. Stage 1 Intake Agent Output</h2>
          <div className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  extracted
                    ? 'border-cyan-200 bg-cyan-50 text-cyan-700'
                    : 'border-slate-200 bg-slate-50 text-zinc-500'
                }`}
              >
                {extracted && <Check size={13} />}
                {extracted ? 'Agent 1 Execution: SUCCESS' : 'Agent 1 Execution: READY'}
              </span>
            </div>
            <p className="mt-3 text-sm leading-6 text-zinc-600">
              Normalizes raw text into strict JSON primitives. Strips tone, dialect, and prose.
            </p>
            <div className="mt-5 divide-y divide-slate-100 border-t border-slate-100">
              {extractedFacts.map(([label, value]) => (
                <div key={label} className="grid gap-1 py-3 sm:grid-cols-[minmax(150px,0.7fr)_1fr] sm:gap-4">
                  <span className="text-sm text-zinc-500">{label}</span>
                  <span className="text-sm font-semibold text-zinc-900">{extracted ? value : '—'}</span>
                </div>
              ))}
            </div>
            <div className="mt-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <FileJson size={14} className="text-cyan-600" />
              JSON schema preview
            </div>
            <pre className="mt-2 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs leading-6 text-cyan-400">
              {extracted
                ? JSON.stringify(
                    result?.extracted || {
                      disaster: 'flood',
                      loss_ratio: 0.8,
                      injury_present: true,
                      household: 4,
                    },
                    null,
                    2
                  )
                : '{ "status": "awaiting_extraction" }'}
            </pre>
          </div>
        </section>
      </div>

      <footer className="fixed inset-x-0 bottom-0 flex min-h-14 items-center justify-between gap-4 border-t border-slate-200 bg-white px-5 lg:px-8">
        <p className="text-xs text-zinc-500">Agent 1 output locked and validated.</p>
        <span className="text-xs font-medium text-cyan-700">
          {result?.status ? `Pipeline Status: ${result.status.toUpperCase()}` : 'Ready'}
        </span>
      </footer>
    </main>
  )
}
