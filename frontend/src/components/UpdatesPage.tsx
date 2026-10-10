import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import BlurText from './BlurText'

const EASE = [0.22, 1, 0.36, 1] as const

interface UpdateItem {
  id: number
  title: string
  date: string
  tag: string
  author: string
  summary: string
  details: string[]
  badgeColor?: string
}

const updates: UpdateItem[] = [
  {
    id: 1,
    title: 'Spring Semester Kickoff & Venue Reallocations',
    date: 'Yesterday, 4:30 PM',
    tag: 'Operational',
    author: 'President Council',
    summary:
      'Room reservations in Student Union Hall A are finalized for all upcoming bi-weekly club general meetings through May.',
    details: [
      'Tech crew clearance obtained for live audio equipment',
      'Sign-in kiosks will open 15 minutes before official start',
      'Digital attendance logging via QR code enabled in app',
    ],
  },
  {
    id: 2,
    title: 'Club Merchandise Delivery & Pickup Windows',
    date: '3 days ago',
    tag: 'Merchandise',
    author: 'Logistics Lead',
    summary:
      'Embroidered crewnecks and fleece hoodies have landed from the printers. Pickup tables will be active during lunch hours.',
    details: [
      'Bring your app digital receipt barcode at pickup',
      'Exchanges for remaining alternate sizes open on Friday',
      'Leftover inventory goes live for alumni purchase next week',
    ],
  },
  {
    id: 3,
    title: 'Executive Board Budget Mid-Term Ledger Audit',
    date: 'Oct 4, 2026',
    tag: 'Finance',
    author: 'Treasury Desk',
    summary:
      'The semester midterm books have been reconciled with university financial services with zero deficit variance.',
    details: [
      'All pending volunteer reimbursements disbursed to cards',
      'Ticket revenue from Welcome Gala deposited directly',
      'Detailed balance sheet published for all active dues-payers',
    ],
  },
  {
    id: 4,
    title: 'Guest Speaker Keynote: Product Leadership on Campus',
    date: 'Sep 28, 2026',
    tag: 'Events',
    author: 'Events Committee',
    summary:
      'Confirmed fireside chat with campus alumni leading systems engineering at modern technology studios.',
    details: [
      'Cap set at 150 live attendees with priority seating for members',
      'Live Q&A form submissions open inside the dashboard',
      'Networking mixer reception following talk with complimentary refreshments',
    ],
  },
]

const imgCard6 = '/6.png'

export default function UpdatesPage() {
  const [currentIndex, setCurrentIndex] = useState(0)

  const nextUpdate = () => setCurrentIndex((prev) => (prev + 1) % updates.length)
  const prevUpdate = () => setCurrentIndex((prev) => (prev - 1 + updates.length) % updates.length)

  const active = updates[currentIndex]

  return (
    <div className="min-h-screen text-white pt-24 pb-20 px-4 sm:px-6 md:px-10 max-w-6xl mx-auto flex flex-col justify-center">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-10 sm:mb-14 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.8, ease: EASE }}
          className="mb-4"
        >
          <img src={imgCard6} alt="Announcements" className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-xl" />
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="text-white/70 text-xs sm:text-sm font-semibold tracking-widest uppercase mb-3"
        >
          Announcements & Feed
        </motion.p>
        <h1
          className="text-white text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight mb-6"
          style={{ letterSpacing: '-0.04em' }}
        >
          <BlurText text="Club Updates" delay={140} direction="bottom" stepDuration={0.5} />
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
          className="text-white/80 text-base sm:text-lg leading-relaxed font-normal"
        >
          Never miss an urgent announcement, room revision, or release notice. Verified team communications in one timeline.
        </motion.p>
      </div>

      {/* Interactive Carousel Card */}
      <div className="relative max-w-4xl mx-auto w-full">
        <div className="rounded-[28px] bg-white text-[#212529] p-6 sm:p-10 md:p-12 shadow-[0_24px_60px_rgba(0,0,0,0.35)] relative overflow-hidden">
          {/* Metadata Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-6 pb-4 border-b border-[#E8E0E8]">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#F7F3F8] text-[#714B67]">
                {active.tag}
              </span>
              <span className="text-xs text-[#52525B] font-medium">{active.date}</span>
            </div>
            <span className="text-xs font-semibold text-[#714B67]/70 tracking-widest uppercase">
              {currentIndex + 1} / {updates.length}
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
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#212529] mb-3 tracking-tight">
                {active.title}
              </h2>
              <p className="text-xs text-[#714B67] font-semibold uppercase tracking-wider mb-6">
                Posted by {active.author}
              </p>

              <div className="bg-[#FAF7FA] p-5 sm:p-6 rounded-2xl mb-8 border border-[#EDE5ED]">
                <p className="text-sm sm:text-base text-[#3F3F46] leading-relaxed font-normal mb-4">
                  {active.summary}
                </p>
                <div className="space-y-2 border-t border-[#EDE5ED] pt-4">
                  {active.details.map((point, i) => (
                    <div key={i} className="flex items-start gap-2.5 text-xs sm:text-sm text-[#52525B]">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#714B67] mt-1.5 flex-shrink-0" />
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>

          {/* Carousel Navigation Controls */}
          <div className="flex items-center justify-between pt-4 border-t border-[#E8E0E8]">
            <div className="flex gap-2">
              {updates.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentIndex(i)}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    currentIndex === i ? 'w-8 bg-[#714B67]' : 'w-2.5 bg-[#D4C4CE] hover:bg-[#B5A4B0]'
                  }`}
                  aria-label={`Go to update ${i + 1}`}
                />
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={prevUpdate}
                className="w-10 h-10 rounded-xl bg-[#FAF7FA] hover:bg-[#F0EBF0] text-[#714B67] flex items-center justify-center font-bold active:scale-95 transition-all border border-[#EDE5ED]"
                aria-label="Previous update"
              >
                ←
              </button>
              <button
                onClick={nextUpdate}
                className="w-10 h-10 rounded-xl bg-[#714B67] hover:bg-[#5C3D54] text-white flex items-center justify-center font-bold active:scale-95 transition-all shadow-md"
                aria-label="Next update"
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
