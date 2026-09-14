'use client'

import { useState } from 'react'
import { ArrowRight, Check, ChevronDown, FileJson, Play, Upload } from 'lucide-react'

const defaultClaim = 'water inside house bad. wife leg break hurt bad. help fast no money.'

const extractedFacts = [
  ['Disaster Type', 'Flood'],
  ['Property Loss', '80% (Severe Structural Damage)'],
  ['Injury Status', 'True (Severe Fracture Reported)'],
  ['Household Count', '4'],
  ['Financial Capacity', 'Zero / Depleted'],
]

function ChannelTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`rounded-md px-3 py-2 text-xs font-medium transition-colors ${active ? 'bg-cyan-50 text-cyan-700 ring-1 ring-cyan-200' : 'text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800'}`}>{label}</button>
}

export default function Page() {
  const [claim, setClaim] = useState(defaultClaim)
  const [channel, setChannel] = useState('SMS / WhatsApp')
  const [extracted, setExtracted] = useState(true)
  const [presetLoaded, setPresetLoaded] = useState(false)
  const [proceeded, setProceeded] = useState(false)

  return <main className="min-h-screen bg-slate-50 pb-20 text-zinc-900">
    <header className="flex min-h-14 items-center justify-between gap-4 border-b border-slate-200 bg-white px-5 lg:px-8">
      <div className="flex items-center gap-3"><span className="text-base font-bold tracking-tight text-zinc-900">VERITY</span><span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-[11px] font-medium text-cyan-700">Step 1: Intake &amp; Agent Parsing</span></div>
      <button type="button" onClick={() => { setClaim(defaultClaim); setPresetLoaded(true); setExtracted(true) }} className="inline-flex items-center gap-2 rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-cyan-700"><Upload size={14} />{presetLoaded ? 'Benchmark Loaded' : 'Load Pre-set Dialect Benchmark'}</button>
    </header>

    <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 lg:grid-cols-[45%_55%] lg:px-8">
      <section>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Claim intake</p>
        <h1 className="text-lg font-semibold text-zinc-900">1. Raw Claim Input</h1>
        <p className="mt-1 text-sm text-zinc-600">Enter incoming SMS, WhatsApp, or transcribed voice note.</p>
        <div className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <label htmlFor="claim" className="sr-only">Raw claim input</label>
          <textarea id="claim" value={claim} onChange={(event) => { setClaim(event.target.value); setExtracted(false) }} className="min-h-64 w-full resize-y rounded-md border border-slate-300 bg-slate-50 p-4 text-sm leading-6 text-zinc-800 outline-none transition focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500" />
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4"><div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1"><ChannelTab label="SMS / WhatsApp" active={channel === 'SMS / WhatsApp'} onClick={() => setChannel('SMS / WhatsApp')} /><ChannelTab label="Voice Transcript" active={channel === 'Voice Transcript'} onClick={() => setChannel('Voice Transcript')} /><ChannelTab label="IVR Hotline" active={channel === 'IVR Hotline'} onClick={() => setChannel('IVR Hotline')} /></div><span className="text-xs text-zinc-400">{channel}</span></div>
          <button type="button" onClick={() => setExtracted(true)} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-700"><Play size={15} />Run Stage 1: Fact Extraction <ArrowRight size={15} /></button>
        </div>
      </section>

      <section>
        <p className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-cyan-700">Agent execution</p>
        <h2 className="text-lg font-semibold text-zinc-900">2. Stage 1 Intake Agent Output</h2>
        <div className="mt-5 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${extracted ? 'border-cyan-200 bg-cyan-50 text-cyan-700' : 'border-slate-200 bg-slate-50 text-zinc-500'}`}>{extracted && <Check size={13} />}{extracted ? 'Agent 1 Execution: SUCCESS' : 'Agent 1 Execution: READY'}</span><span className="text-xs text-zinc-400">{channel}</span></div>
          <p className="mt-3 text-sm leading-6 text-zinc-600">Normalizes raw text into strict JSON primitives. Strips tone, dialect, and prose.</p>
          <div className="mt-5 divide-y divide-slate-100 border-t border-slate-100">{extractedFacts.map(([label, value]) => <div key={label} className="grid gap-1 py-3 sm:grid-cols-[minmax(150px,0.7fr)_1fr] sm:gap-4"><span className="text-sm text-zinc-500">{label}</span><span className="text-sm font-semibold text-zinc-900">{extracted ? value : '—'}</span></div>)}</div>
          <div className="mt-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-zinc-500"><FileJson size={14} className="text-cyan-600" />JSON schema preview</div>
          <pre className="mt-2 overflow-x-auto rounded-md bg-slate-900 p-3 text-xs leading-6 text-cyan-400">{extracted ? '{ "disaster": "flood", "loss_ratio": 0.80, "injury_present": true, "household": 4 }' : '{ "status": "awaiting_extraction" }'}</pre>
        </div>
      </section>
    </div>

    <footer className="fixed inset-x-0 bottom-0 flex min-h-14 items-center justify-between gap-4 border-t border-slate-200 bg-white px-5 lg:px-8"><p className="text-xs text-zinc-500">Agent 1 output locked and validated.</p><button type="button" onClick={() => setProceeded(true)} className="inline-flex items-center gap-2 rounded-md bg-cyan-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-cyan-700">{proceeded ? 'Triage Audit Ready' : 'Proceed to 4-Stage Triage & PRISM Audit'}<ChevronDown size={14} className="-rotate-90" /></button></footer>
  </main>
}
