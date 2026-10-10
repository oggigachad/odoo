import { Check, X } from 'lucide-react'
import { useState } from 'react'
import {
  Award,
  Sparkles,
  Download,
  Calendar,
  Vote,
  Users,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  BookOpen,
  ArrowRight,
  QrCode,
} from 'lucide-react'
import type { UserAccount } from '../authService'

interface Props {
  user: UserAccount
  onGoToEvents?: () => void
  onGoToShop?: () => void
}

const FONT = { fontFamily: '"TT Firs Neue", sans-serif' }

export default function MemberPortalPanel({ user, onGoToEvents, onGoToShop }: Props) {
  const [selectedVaultTab, setSelectedVaultTab] = useState<'study' | 'career' | 'projects'>('study')
  const [votedPoll, setVotedPoll] = useState<string | null>(null)
  const [showQrModal, setShowQrModal] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  // Exclusive Academic Vault resources
  const vaultResources = {
    study: [
      { id: 1, title: 'Operating Systems & Concurrency — Exam Archive 2025-26', type: 'PDF', size: '4.2 MB', downloads: 142 },
      { id: 2, title: 'Distributed Systems & Microservices Cheatsheet', type: 'PDF', size: '2.1 MB', downloads: 98 },
      { id: 3, title: 'Algorithms & Data Structures Problem Bank (Solved)', type: 'PDF', size: '5.8 MB', downloads: 215 },
    ],
    career: [
      { id: 4, title: 'Skyline Member Resume Template (LaTeX + Docx)', type: 'ZIP', size: '1.4 MB', downloads: 310 },
      { id: 5, title: 'Technical Interview Prep Handbook (2026 Edition)', type: 'PDF', size: '3.6 MB', downloads: 189 },
      { id: 6, title: 'Referral Directory — Alumni at Google, Microsoft, Odoo', type: 'DOC', size: '820 KB', downloads: 275 },
    ],
    projects: [
      { id: 7, title: 'Autonomous Quadcopter Firmware Blueprint (C++)', type: 'REPO', size: '12 MB', downloads: 84 },
      { id: 8, title: 'Campus Roommate & Housing Matching Engine (FastAPI/React)', type: 'REPO', size: '8.4 MB', downloads: 120 },
      { id: 9, title: 'High-Frequency FinTech Backtester Source Code', type: 'REPO', size: '6.7 MB', downloads: 140 },
    ],
  }

  const handleVote = (option: string) => {
    setVotedPoll(option)
  }

  const handleCopyInvite = () => {
    navigator.clipboard.writeText('https://chat.whatsapp.com/skyline-active-members-exclusive')
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 3000)
  }

  return (
    <div style={FONT} className="space-y-6 animate-fadeIn pb-12">
      {/* Top Banner: Member Status */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#714B67] via-[#593450] to-[#3B1B34] p-6 sm:p-8 text-white shadow-xl border border-white/10">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-400/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span>OFFICIAL ACTIVE MEMBER</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight">
              Welcome to the Member Portal, {user.name}
            </h2>
            <p className="text-xs sm:text-sm text-white/80 max-w-xl">
              You have full, unlocked membership privileges: member prices on event tickets and merchandise, member-only events, and renewal reminders before your semester ends.
            </p>
          </div>

          {/* Digital Membership ID Card */}
          <div
            onClick={() => setShowQrModal(true)}
            className="cursor-pointer group relative w-72 rounded-2xl bg-white/10 backdrop-blur-md p-4 border border-white/20 shadow-2xl hover:border-white/40 transition-all hover:scale-[1.02]"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <img src="/logo.png" alt="Skyline" className="h-4 w-auto brightness-0 invert" />
                <span className="text-[10px] font-black tracking-widest uppercase text-white/90">MEMBER PASS</span>
              </div>
              <span className="text-[10px] font-bold text-emerald-300 bg-emerald-500/20 px-2 py-0.5 rounded-full">
                VERIFIED
              </span>
            </div>
            <div className="space-y-1">
              <div className="text-sm font-black truncate">{user.name}</div>
              <div className="text-[11px] text-white/70 font-mono">ID: {user.studentId || `SKY-${user.memberId}`}</div>
              <div className="text-[10px] text-white/60">
                Valid: {user.validUntil ? new Date(user.validUntil).toLocaleDateString() : 'Current Semester 2026'}
              </div>
            </div>
            <div className="mt-3 pt-2 border-t border-white/15 flex items-center justify-between text-[10px] text-white/80">
              <span className="flex items-center gap-1">
                <QrCode className="w-3.5 h-3.5 text-white/80" /> Click for QR Pass
              </span>
              <span className="font-mono text-emerald-400">#00{user.memberId}</span>
            </div>
          </div>
        </div>
      </div>

      {/* QR Code Modal */}
      {showQrModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white text-neutral-900 rounded-3xl max-w-sm w-full p-6 text-center space-y-4 shadow-2xl animate-scaleIn">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-[#714B67] uppercase tracking-wider">Official Digital Pass</span>
              <button
                onClick={() => setShowQrModal(false)}
                className="text-neutral-400 hover:text-neutral-900 bg-transparent border-none text-sm cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 bg-neutral-50 rounded-2xl border border-neutral-200 inline-block">
              {/* Simulated QR Matrix */}
              <div className="w-48 h-48 bg-neutral-900 rounded-xl p-2 flex flex-col justify-between items-center text-white">
                <div className="w-full flex justify-between">
                  <div className="w-10 h-10 border-4 border-white rounded-lg flex items-center justify-center">
                    <div className="w-4 h-4 bg-white rounded-sm" />
                  </div>
                  <div className="w-10 h-10 border-4 border-white rounded-lg flex items-center justify-center">
                    <div className="w-4 h-4 bg-white rounded-sm" />
                  </div>
                </div>
                <div className="text-center font-mono text-[10px] tracking-widest text-[#38bdf8] py-2">
                  SKYLINE-MEMBER-{user.memberId}
                </div>
                <div className="w-full flex justify-between">
                  <div className="w-10 h-10 border-4 border-white rounded-lg flex items-center justify-center">
                    <div className="w-4 h-4 bg-white rounded-sm" />
                  </div>
                  <div className="w-8 h-8 bg-emerald-400 rounded-full flex items-center justify-center text-neutral-900 font-bold text-xs">
                    <Check className="w-4 h-4" />
                  </div>
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-bold text-base text-neutral-900">{user.name}</h4>
              <p className="text-xs text-neutral-500 font-mono">Member #{user.memberId} · {user.email}</p>
              <p className="text-[11px] text-emerald-600 font-semibold mt-1">
                Show at door for instant QR door check-in & free member kit.
              </p>
            </div>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 rounded-xl bg-[#714B67] text-white text-xs font-bold hover:bg-[#5b3c53] border-none cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Quick Perks Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-neutral-200 shadow-sm flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-purple-100 text-[#714B67] shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-neutral-900">50% Ticket Discount</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">Applied automatically when purchasing event passes.</div>
            {onGoToEvents && (
              <button
                onClick={onGoToEvents}
                className="text-[11px] font-bold text-[#714B67] hover:underline mt-1.5 flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer"
              >
                Browse Events <ArrowRight className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-neutral-200 shadow-sm flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-sky-100 text-sky-600 shrink-0">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-neutral-900">Academic & Project Vault</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">Past exams, solved solutions, and project source codes.</div>
            <span className="text-[11px] font-bold text-sky-600 mt-1.5 inline-block">Included with membership</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-neutral-200 shadow-sm flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700 shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-neutral-900">Verified Member Community</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">Private Discord & WhatsApp channel for project teams.</div>
            <button
              onClick={handleCopyInvite}
              className="text-[11px] font-bold text-emerald-700 hover:underline mt-1.5 flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer"
            >
              {copiedLink ? 'Link Copied!' : 'Copy Channel Link'} <ExternalLink className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-neutral-200 shadow-sm flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700 shrink-0">
            <Vote className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-neutral-900">Voting & Club Elections</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">Direct voting rights on executive decisions and budget polls.</div>
            <span className="text-[11px] font-bold text-amber-700 mt-1.5 inline-block">Active voting member</span>
          </div>
        </div>
      </div>

      {/* Main Grid: Academic Vault & Governance Poll */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Academic Vault (2 cols) */}
        <div className="lg:col-span-2 bg-white rounded-3xl border border-neutral-200 p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-neutral-900 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#714B67]" />
                Skyline Academic & Career Vault
              </h3>
              <p className="text-xs text-neutral-500">Curated specifically for verified club members.</p>
            </div>

            {/* Tab switch */}
            <div className="flex p-1 rounded-xl bg-neutral-100 border border-neutral-200 text-xs font-bold">
              <button
                onClick={() => setSelectedVaultTab('study')}
                className={`px-3 py-1 rounded-lg border-none cursor-pointer transition-all ${
                  selectedVaultTab === 'study' ? 'bg-white text-[#714B67] shadow-sm' : 'bg-transparent text-neutral-600'
                }`}
              >
                Exam Banks
              </button>
              <button
                onClick={() => setSelectedVaultTab('career')}
                className={`px-3 py-1 rounded-lg border-none cursor-pointer transition-all ${
                  selectedVaultTab === 'career' ? 'bg-white text-[#714B67] shadow-sm' : 'bg-transparent text-neutral-600'
                }`}
              >
                Career & Resumes
              </button>
              <button
                onClick={() => setSelectedVaultTab('projects')}
                className={`px-3 py-1 rounded-lg border-none cursor-pointer transition-all ${
                  selectedVaultTab === 'projects' ? 'bg-white text-[#714B67] shadow-sm' : 'bg-transparent text-neutral-600'
                }`}
              >
                Code Blueprints
              </button>
            </div>
          </div>

          <div className="divide-y divide-neutral-100">
            {vaultResources[selectedVaultTab].map((res) => (
              <div key={res.id} className="py-3.5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-neutral-100 text-neutral-700 flex items-center justify-center text-[10px] font-black">
                    {res.type}
                  </div>
                  <div>
                    <div className="text-xs font-bold text-neutral-900">{res.title}</div>
                    <div className="text-[11px] text-neutral-500">
                      {res.size} · {res.downloads} member downloads
                    </div>
                  </div>
                </div>

                <a
                  href={`#download-${res.id}`}
                  onClick={(e) => {
                    e.preventDefault()
                    alert(`Downloading "${res.title}"... Exclusive member benefit verified.`)
                  }}
                  className="px-3 py-1.5 rounded-xl bg-neutral-100 hover:bg-[#714B67] text-neutral-700 hover:text-white text-xs font-bold transition-colors flex items-center gap-1.5 text-decoration-none"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Download</span>
                </a>
              </div>
            ))}
          </div>
        </div>

        {/* Club Governance & Polls (1 col) */}
        <div className="bg-white rounded-3xl border border-neutral-200 p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2">
            <Vote className="w-4 h-4 text-[#714B67]" />
            <h3 className="text-base font-bold text-neutral-900">Member Voting Ballot</h3>
          </div>
          <p className="text-xs text-neutral-500">
            Cast your vote as an active semester member. Decisions determine club semester funding allocation.
          </p>

          <div className="p-4 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-3">
            <span className="text-[10px] uppercase font-bold tracking-wider text-purple-700 bg-purple-100 px-2 py-0.5 rounded-full">
              Semester Poll #12
            </span>
            <div className="text-xs font-bold text-neutral-900">
              Which flagship workshop theme should Skyline prioritize next month?
            </div>

            <div className="space-y-2 pt-1">
              {[
                { key: 'ai', label: 'Autonomous AI Agents & Local LLMs', votes: 68 },
                { key: 'fintech', label: 'Algorithmic Trading & FinTech Systems', votes: 45 },
                { key: 'cloud', label: 'Kubernetes & Production Cloud Infrastructure', votes: 31 },
              ].map((opt) => {
                const isSelected = votedPoll === opt.key
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => handleVote(opt.key)}
                    className={`w-full p-2.5 rounded-xl border text-left text-xs font-semibold transition-all cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-[#714B67] text-white border-[#714B67]'
                        : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-300'
                    }`}
                  >
                    <span>{opt.label}</span>
                    {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                  </button>
                )
              })}
            </div>

            {votedPoll && (
              <div className="p-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-1.5">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Your ballot has been officially tallied!</span>
              </div>
            )}
          </div>

          <div className="p-3 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
            <div className="text-[11px] text-neutral-600">
              Only verified paid members can cast votes. Guest votes are automatically blocked by the server.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
