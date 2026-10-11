import { useState, useEffect, useCallback } from 'react'
import {
  Award,
  Vote,
  Users,
  ShieldCheck,
  CheckCircle2,
  ExternalLink,
  ArrowRight,
  QrCode,
  X,
} from 'lucide-react'
import type { UserAccount } from '../authService'
import { api, API_BASE, getToken, errorMessage } from '../apiClient'
import { useLiveRefresh } from '../useRealtimeUpdates'

interface Props {
  user: UserAccount
  onGoToEvents?: () => void
  onGoToShop?: () => void
}

interface PollOption {
  option_id: number
  label: string
  display_order: number
  votes: number
}

interface PollData {
  poll_id: number
  title: string
  description?: string | null
  is_active: boolean
  total_votes: number
  options: PollOption[]
  user_voted_option_id?: number | null
}

const FONT = { fontFamily: '"TT Firs Neue", sans-serif' }

export default function MemberPortalPanel({ user, onGoToEvents }: Props) {
  const [showQrModal, setShowQrModal] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)

  // Dynamic Poll State from Backend
  const [poll, setPoll] = useState<PollData | null>(null)
  const [pollLoading, setPollLoading] = useState(true)
  const [pollVoting, setPollVoting] = useState(false)
  const [pollError, setPollError] = useState<string | null>(null)
  const [voteSuccess, setVoteSuccess] = useState<string | null>(null)

  const loadPoll = useCallback(async () => {
    try {
      const data = await api<PollData | null>('/polls/active')
      setPoll(data)
    } catch {
      // offline or network issue
    } finally {
      setPollLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPoll()
  }, [loadPoll])

  useLiveRefresh(['dashboard', 'members'], loadPoll)

  const handleVote = async (optionId: number) => {
    if (!poll || pollVoting) return
    setPollVoting(true)
    setPollError(null)
    try {
      const updated = await api<PollData>(`/polls/${poll.poll_id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ option_id: optionId }),
      })
      setPoll(updated)
      setVoteSuccess('Your vote has been officially recorded in the database!')
      setTimeout(() => setVoteSuccess(null), 5000)
    } catch (e: any) {
      setPollError(errorMessage(e, 'Could not cast vote. Active paid membership required.'))
    } finally {
      setPollVoting(false)
    }
  }

  const handleCopyInvite = () => {
    navigator.clipboard.writeText('https://chat.whatsapp.com/skyline-active-members-exclusive')
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 3000)
  }

  const token = getToken() ?? ''
  const qrPassUrl = `${API_BASE}/members/${user.memberId}/pass-qr.png?token=${encodeURIComponent(token)}`

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
                Valid: {user.validUntil ? new Date(user.validUntil).toLocaleDateString() : (user.isActive ? 'Active Semester Member' : 'Pending Activation')}
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

      {/* QR Code Modal - Real Dynamic QR Pass */}
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
              {/* Dynamic Scannable QR Code */}
              <div className="w-48 h-48 bg-white rounded-xl p-2 flex items-center justify-center border border-neutral-200 shadow-sm">
                <img
                  src={qrPassUrl}
                  alt={`Digital Pass for ${user.name}`}
                  className="w-44 h-44 object-contain"
                  onError={(e) => {
                    // Fallback to text if network glitch
                    (e.target as HTMLImageElement).style.display = 'none'
                  }}
                />
              </div>
              <div className="text-center font-mono text-[10px] tracking-widest text-[#714B67] font-bold py-2">
                SKYLINE-MEMBER-{user.memberId}
              </div>
            </div>
            <div>
              <h4 className="font-bold text-base text-neutral-900">{user.name}</h4>
              <p className="text-xs text-neutral-500 font-mono">Member #{user.memberId} · {user.email}</p>
              <p className="text-[11px] text-emerald-600 font-semibold mt-1">
                Show at door for instant QR door check-in & member benefits.
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
            <div className="text-xs font-bold text-neutral-900">Member Ticket Pricing</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">Exclusive discounted rates applied automatically at checkout.</div>
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
          <div className="p-2.5 rounded-xl bg-purple-100 text-[#714B67] shrink-0">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-bold text-neutral-900">Digital QR Pass</div>
            <div className="text-[11px] text-neutral-500 mt-0.5">Instant door check-in at club events and meetings.</div>
            <button
              onClick={() => setShowQrModal(true)}
              className="text-[11px] font-bold text-[#714B67] hover:underline mt-1.5 flex items-center gap-1 bg-transparent border-none p-0 cursor-pointer"
            >
              Show Pass <ArrowRight className="w-3 h-3" />
            </button>
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

      {/* Club Governance & Polls (Dynamic from database) */}
      <div className="bg-white rounded-3xl border border-neutral-200 p-6 sm:p-8 shadow-sm space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
              <Vote className="w-5 h-5 text-[#714B67]" />
              Official Member Voting Ballot
            </h3>
            <p className="text-xs text-neutral-500 mt-0.5">
              Live semester poll stored and tallied directly in the club database.
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold self-start sm:self-auto">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Verified Paid Member Voting Rights</span>
          </div>
        </div>

        {pollLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-7 h-7 rounded-full border-2 border-[#714B67] border-t-transparent animate-spin" />
          </div>
        ) : !poll ? (
          <div className="text-center py-10 bg-neutral-50 rounded-2xl border border-neutral-200">
            <Vote className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-neutral-700">No Active Polls Right Now</p>
            <p className="text-xs text-neutral-500 mt-1">Check back soon when executive officers publish the next semester ballot.</p>
          </div>
        ) : (
          <div className="space-y-5">
            <div className="p-5 rounded-2xl bg-neutral-50 border border-neutral-200 space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <span className="text-[10px] uppercase font-bold tracking-wider text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-full">
                  Semester Ballot #{poll.poll_id}
                </span>
                <span className="text-xs font-semibold text-neutral-500">
                  {poll.total_votes} {poll.total_votes === 1 ? 'vote cast' : 'total votes cast'}
                </span>
              </div>
              <h4 className="text-sm sm:text-base font-bold text-neutral-900">
                {poll.title}
              </h4>
              {poll.description && (
                <p className="text-xs text-neutral-600 leading-relaxed">
                  {poll.description}
                </p>
              )}

              {pollError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {pollError}
                </div>
              )}
              {voteSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{voteSuccess}</span>
                </div>
              )}

              <div className="space-y-3 pt-2">
                {poll.options.map((opt) => {
                  const isSelected = poll.user_voted_option_id === opt.option_id
                  const pct = poll.total_votes > 0 ? Math.round((opt.votes / poll.total_votes) * 100) : 0
                  return (
                    <div key={opt.option_id} className="space-y-1.5">
                      <button
                        type="button"
                        disabled={pollVoting}
                        onClick={() => handleVote(opt.option_id)}
                        className={`w-full p-3.5 rounded-2xl border text-left text-xs font-semibold transition-all cursor-pointer flex items-center justify-between relative overflow-hidden ${
                          isSelected
                            ? 'bg-[#714B67] text-white border-[#714B67] shadow-md'
                            : 'bg-white text-neutral-800 border-neutral-200 hover:border-neutral-300 hover:bg-neutral-50/80'
                        }`}
                      >
                        <span className="relative z-10 flex items-center gap-2">
                          <span>{opt.label}</span>
                          {isSelected && (
                            <span className="px-2 py-0.5 rounded-full bg-white/20 text-white text-[10px] font-bold">
                              Your Choice
                            </span>
                          )}
                        </span>
                        <div className="relative z-10 flex items-center gap-3 shrink-0">
                          <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-neutral-500'}`}>
                            {opt.votes} ({pct}%)
                          </span>
                          {isSelected && <CheckCircle2 className="w-4 h-4 text-white" />}
                        </div>
                      </button>

                      {/* Dynamic Vote Tally Progress Bar */}
                      <div className="h-1.5 w-full bg-neutral-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isSelected ? 'bg-[#714B67]' : 'bg-neutral-400'
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="p-3.5 rounded-2xl bg-neutral-50 border border-neutral-200 flex items-center gap-3 text-xs text-neutral-600">
              <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>
                Votes are validated cryptographically against your member ID and stored permanently in PostgreSQL.
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
