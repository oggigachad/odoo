import { Check } from 'lucide-react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import BlurText from './BlurText'

const EASE = [0.22, 1, 0.36, 1] as const

interface AboutPillar {
  id: number
  title: string
  subtitle: string
  metric: string
  metricLabel: string
  content: string
  bullets: string[]
}

const pillars: AboutPillar[] = [
  {
    id: 1,
    title: 'Designed for Student Leaders',
    subtitle: 'Built From Direct Campus Experience',
    metric: '100%',
    metricLabel: 'Student-Run Focus',
    content:
      'Student organizations are the lifeblood of campus culture. Yet officers spend countless hours managing messy group chats, split spreadsheets, and cash bags instead of building great experiences.',
    bullets: [
      'Zero manual bookkeeping or spreadsheet reconciliations',
      'Fast onboarding for incoming executive board members each year',
      'Centralized archive of club records, finances, and member rosters',
    ],
  },
  {
    id: 2,
    title: 'Financial Transparency & Accountability',
    subtitle: 'Clear Ledgers That Everyone Trusts',
    metric: '₹0',
    metricLabel: 'Hidden Discrepancies',
    content:
      'Every rupee collected in membership dues, merch sales, and ticket checkout is accounted for. Real-time receipts protect treasurers and build institutional credibility.',
    bullets: [
      'Live audit logs with automated expense receipts',
      'One-tap reimbursements for authorized student purchases',
      'Clear budget reports ready for faculty advisors and department chairs',
    ],
  },
  {
    id: 3,
    title: 'High-Impact Community & Engagement',
    subtitle: 'Connecting Members in Real Life',
    metric: '3.4x',
    metricLabel: 'Higher Event Attendance',
    content:
      'From freshman orientation to alumni graduation mixers, keep members engaged with seamless mobile RSVPs, instant digital entry, and personalized updates.',
    bullets: [
      'Instant camera QR scan entry at the door with no bottleneck',
      'Automated calendar invites and push event notifications',
      'Exclusive member perks, discounts, and custom merch sizing',
    ],
  },
]

export default function AboutPage() {
  const [currentPillar, setCurrentPillar] = useState(0)

  const nextPillar = () => setCurrentPillar((prev) => (prev + 1) % pillars.length)
  const prevPillar = () => setCurrentPillar((prev) => (prev - 1 + pillars.length) % pillars.length)

  const active = pillars[currentPillar]

  return (
    <div className="min-h-screen text-white pt-24 pb-20 px-4 sm:px-6 md:px-10 max-w-6xl mx-auto flex flex-col justify-center">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="text-white/70 text-xs sm:text-sm font-semibold tracking-widest uppercase mb-3"
        >
          Our Mission & Philosophy
        </motion.p>
        <h1
          className="text-white text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight mb-6"
          style={{ letterSpacing: '-0.04em' }}
        >
          <BlurText text="About Odoo Skyline" delay={140} direction="bottom" stepDuration={0.5} />
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
          className="text-white/80 text-base sm:text-lg leading-relaxed font-normal"
        >
          The unified operating system for collegiate clubs, student councils, and campus communities.
        </motion.p>
      </div>

      {/* Main Interactive Carousel Card */}
      <div className="relative max-w-4xl mx-auto w-full">
        <div className="rounded-[28px] bg-white text-[#212529] p-6 sm:p-10 md:p-12 shadow-[0_24px_60px_rgba(0,0,0,0.35)] relative overflow-hidden">
          {/* Header indicator */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#E8E0E8]">
            <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#F7F3F8] text-[#714B67]">
              {active.subtitle}
            </span>
            <span className="text-xs font-semibold text-[#714B67]/70 tracking-widest uppercase">
              {currentPillar + 1} / {pillars.length}
            </span>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={active.id}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.35, ease: EASE }}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
                <div>
                  <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#212529] tracking-tight">
                    {active.title}
                  </h2>
                </div>

                <div className="bg-[#FAF7FA] border border-[#EDE5ED] rounded-2xl p-4 sm:px-6 text-center md:text-right flex-shrink-0">
                  <div className="text-3xl sm:text-4xl font-extrabold text-[#714B67]">{active.metric}</div>
                  <div className="text-[11px] font-bold text-[#714B67]/70 uppercase tracking-wider mt-0.5">
                    {active.metricLabel}
                  </div>
                </div>
              </div>

              <div className="bg-[#FAF7FA] p-5 sm:p-6 rounded-2xl mb-8 border border-[#EDE5ED]">
                <p className="text-sm sm:text-base text-[#3F3F46] leading-relaxed font-normal mb-6">
                  {active.content}
                </p>
                <div className="space-y-2.5 border-t border-[#EDE5ED] pt-5">
                  {active.bullets.map((b, i) => (
                    <div key={i} className="flex items-center gap-3 text-xs sm:text-sm text-[#52525B]">
                      <span className="w-5 h-5 rounded-full bg-[#714B67] text-white flex items-center justify-center text-[10px] flex-shrink-0">
                        <Check className="w-3 h-3" />
                      </span>
                      <span>{b}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Carousel Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-[#E8E0E8]">
            <div className="flex gap-2">
              {pillars.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentPillar(i)}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    currentPillar === i ? 'w-8 bg-[#714B67]' : 'w-2.5 bg-[#D4C4CE] hover:bg-[#B5A4B0]'
                  }`}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={prevPillar}
                className="w-10 h-10 rounded-xl bg-[#FAF7FA] hover:bg-[#F0EBF0] text-[#714B67] flex items-center justify-center font-bold active:scale-95 transition-all border border-[#EDE5ED]"
                aria-label="Previous pillar"
              >
                ←
              </button>
              <button
                onClick={nextPillar}
                className="w-10 h-10 rounded-xl bg-[#714B67] hover:bg-[#5C3D54] text-white flex items-center justify-center font-bold active:scale-95 transition-all shadow-md"
                aria-label="Next pillar"
              >
                →
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
