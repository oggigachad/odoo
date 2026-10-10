import { motion } from 'motion/react'

type PhoneUIProps = {
  width?: number
  style?: React.CSSProperties
}

const EASE = [0.22, 1, 0.36, 1] as const

export default function PhoneUI({ width = 280, style }: PhoneUIProps) {
  const height = width * 2.05
  const borderRadius = width * 0.16
  const scale = width / 280

  return (
    <motion.div
      initial={{ opacity: 0, y: 40, scale: 0.92 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 1.4, delay: 0.55, ease: EASE }}
      className="relative select-none inline-block text-left"
      style={{
        width,
        height,
        borderRadius,
        padding: Math.max(3.5, Math.round(width * 0.016)),
        background:
          'linear-gradient(155deg, rgba(235, 205, 222, 0.85) 0%, rgba(145, 95, 130, 0.5) 45%, rgba(255, 255, 255, 0.75) 100%)',
        boxShadow: `
          0 0 0 1px rgba(255, 255, 255, 0.45),
          0 28px 60px -12px rgba(35, 12, 28, 0.75),
          0 12px 28px -6px rgba(0, 0, 0, 0.45)
        `,
        ...style,
      }}
    >
      {/* Side Hardware Buttons */}
      <div
        className="absolute -left-[3px] top-[22%] w-[3px] rounded-l-sm bg-[#b895aa]/80"
        style={{ height: Math.round(26 * scale) }}
      />
      <div
        className="absolute -left-[3px] top-[32%] w-[3px] rounded-l-sm bg-[#b895aa]/80"
        style={{ height: Math.round(44 * scale) }}
      />
      <div
        className="absolute -left-[3px] top-[43%] w-[3px] rounded-l-sm bg-[#b895aa]/80"
        style={{ height: Math.round(44 * scale) }}
      />
      <div
        className="absolute -right-[3px] top-[28%] w-[3px] rounded-r-sm bg-[#b895aa]/80"
        style={{ height: Math.round(64 * scale) }}
      />

      {/* Inner Screen Bezel - Landing page theme (#714B67 base) */}
      <div
        className="w-full h-full relative overflow-hidden flex flex-col justify-between"
        style={{
          borderRadius: borderRadius - Math.max(3.5, Math.round(width * 0.016)),
          background: 'linear-gradient(180deg, #5c3553 0%, #44243d 50%, #2f152a 100%)',
          color: '#ffffff',
          fontFamily:
            '-apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", "Inter", sans-serif',
        }}
      >
        {/* Subtle Ambient Glow */}
        <div
          className="absolute -top-10 left-1/2 -translate-x-1/2 pointer-events-none"
          style={{
            width: width * 0.9,
            height: width * 0.55,
            background:
              'radial-gradient(circle at center, rgba(235, 130, 185, 0.25) 0%, transparent 70%)',
            filter: 'blur(18px)',
          }}
        />

        {/* 1. Status Bar & Dynamic Island */}
        <div
          className="relative z-30 flex items-center justify-between px-5 pt-3 pb-1"
          style={{ fontSize: Math.max(10, Math.round(11 * scale)) }}
        >
          {/* Time */}
          <span className="font-semibold tracking-tight text-white/95">9:41</span>

          {/* Dynamic Island */}
          <div
            className="absolute left-1/2 top-2.5 -translate-x-1/2 flex items-center justify-between px-2.5 bg-black rounded-full border border-white/10 shadow-sm"
            style={{
              width: Math.round(82 * scale),
              height: Math.round(23 * scale),
            }}
          >
            <div className="w-2.5 h-2.5 rounded-full bg-[#181818] border border-white/10 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-[#0a1e38]/90" />
            </div>
            <div className="flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            </div>
          </div>

          {/* Cellular / WiFi / Battery */}
          <div className="flex items-center gap-1.5 opacity-90 text-white">
            <svg width={13 * scale} height={9 * scale} viewBox="0 0 17 11" fill="none">
              <rect x="0" y="7" width="2.5" height="4" rx="0.5" fill="currentColor" opacity="0.4" />
              <rect x="3.5" y="5" width="2.5" height="6" rx="0.5" fill="currentColor" opacity="0.6" />
              <rect x="7" y="3" width="2.5" height="8" rx="0.5" fill="currentColor" opacity="0.8" />
              <rect x="10.5" y="1" width="2.5" height="10" rx="0.5" fill="currentColor" />
            </svg>
            <svg width={12 * scale} height={9 * scale} viewBox="0 0 16 12" fill="currentColor">
              <path d="M8 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z" />
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M3.2 4.8a6.8 6.8 0 019.6 0 .8.8 0 001.1-1.1 8.4 8.4 0 00-11.8 0 .8.8 0 001.1 1.1z"
                opacity="0.7"
              />
            </svg>
            <svg width={18 * scale} height={9 * scale} viewBox="0 0 24 11" fill="none">
              <rect
                x="0.5"
                y="0.5"
                width="20"
                height="10"
                rx="2.5"
                stroke="currentColor"
                strokeWidth="1"
                opacity="0.4"
              />
              <rect x="2" y="2" width="14" height="7" rx="1.5" fill="currentColor" />
              <rect x="22" y="3.5" width="1.5" height="4" rx="0.75" fill="currentColor" opacity="0.6" />
            </svg>
          </div>
        </div>

        {/* 2. Top App Header with Odoo Skyline Logo & Center Campus Chapter */}
        <div className="px-4 pt-1.5 flex items-center justify-between z-20">
          <div className="flex items-center">
            <img
              src="/logo.png"
              alt="Odoo Skyline"
              className="h-5 w-auto object-contain"
              style={{ filter: 'brightness(0) invert(1)' }}
            />
          </div>

          <div className="flex-1 text-center px-1">
            <span
              className="text-white/60 font-semibold leading-none text-[9px] uppercase tracking-wider text-center"
            >
              Campus Chapter
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <div
              className="flex items-center gap-1 rounded-full px-2 py-0.5 bg-white/10 border border-white/15"
              style={{ fontSize: Math.round(9 * scale) }}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span className="text-white/90 font-medium">Online</span>
            </div>
          </div>
        </div>

        {/* 3. Screen Body Content */}
        <div className="px-4 flex-1 flex flex-col justify-start py-1.5 z-10 overflow-hidden">
          {/* Greeting & Headline */}
          <div className="relative mt-1">
            <span
              className="text-white/60 block font-normal leading-tight"
              style={{ fontSize: Math.round(10.5 * scale) }}
            >
              Good evening,
            </span>
            <div className="flex items-center justify-between">
              <h2
                className="font-bold text-white tracking-tight leading-tight mt-0.5"
                style={{
                  fontSize: Math.round(19 * scale),
                  fontFamily: 'var(--font-display), sans-serif',
                }}
              >
                How's the club today?
              </h2>
            </div>
            <p
              className="text-white/50 mt-0.5"
              style={{ fontSize: Math.round(8.5 * scale) }}
            >
              Fall Semester 2026 • 248 Active Members
            </p>
          </div>

          {/* Quick Stat Tiles - Clean SVG icons, NO emojis */}
          <div className="grid grid-cols-2 gap-2 mt-2">
            <div
              className="rounded-2xl p-2.5 flex flex-col text-left border border-white/15"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <div
                className="flex items-center justify-between text-white/60"
                style={{ fontSize: Math.round(8 * scale) }}
              >
                <div className="flex items-center gap-1.5">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8" />
                    <path d="M12 18V6" />
                  </svg>
                  <span>Dues Collected</span>
                </div>
                <span className="text-emerald-300 font-semibold">live</span>
              </div>
              <span
                className="font-bold text-white mt-1 tracking-tight"
                style={{ fontSize: Math.round(14 * scale) }}
              >
                ₹ ••••
              </span>
            </div>

            <div
              className="rounded-2xl p-2.5 flex flex-col text-left border border-white/15"
              style={{
                background: 'rgba(255, 255, 255, 0.08)',
                backdropFilter: 'blur(10px)',
              }}
            >
              <div
                className="flex items-center justify-between text-white/60"
                style={{ fontSize: Math.round(8 * scale) }}
              >
                <div className="flex items-center gap-1.5">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  <span>Event RSVPs</span>
                </div>
                <span className="text-pink-300 font-semibold">+38</span>
              </div>
              <span
                className="font-bold text-white mt-1 tracking-tight"
                style={{ fontSize: Math.round(14 * scale) }}
              >
                142 Attending
              </span>
            </div>
          </div>

          {/* Upcoming Event Featured Card */}
          <div
            className="rounded-2xl p-2.5 mt-2 relative overflow-hidden border border-white/15"
            style={{
              background: 'linear-gradient(135deg, rgba(113, 75, 103, 0.75) 0%, rgba(65, 35, 60, 0.85) 100%)',
            }}
          >
            <div className="flex items-center justify-between">
              <div>
                <span
                  className="text-pink-200 uppercase tracking-wider font-semibold block text-[8px]"
                >
                  UPCOMING EVENT
                </span>
                <span
                  className="font-bold text-white mt-0.5 block leading-tight text-xs"
                >
                  Your next event
                </span>
              </div>
              <div
                className="rounded-full border border-pink-300/60 flex items-center justify-center text-center px-1.5 py-0.5 bg-white/10"
              >
                <span className="font-bold text-white text-[9px]">Seats live</span>
              </div>
            </div>

            <div
              className="flex items-center gap-2 text-white/70 mt-1"
              style={{ fontSize: Math.round(8 * scale) }}
            >
              <span>Tomorrow • 6:30 PM</span>
              <span>•</span>
              <span>Main Auditorium</span>
            </div>

            {/* Event Artwork Preview Banner */}
            <div
              className="mt-1.5 rounded-xl overflow-hidden relative"
              style={{ height: Math.round(58 * scale) }}
            >
              <img
                src="/sunset.png"
                alt="Event"
                className="w-full h-full object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end justify-end p-1.5">
                <span
                  className="w-4 h-4 rounded-full bg-white/25 backdrop-blur-sm flex items-center justify-center text-white text-[10px]"
                >
                  ›
                </span>
              </div>
            </div>
          </div>

          {/* Recent Activity List - Filled gap seamlessly */}
          <div className="mt-2 flex-1 flex flex-col justify-start">
            <div className="flex items-center justify-between text-white/60 mb-1">
              <span
                className="font-semibold text-white/90"
                style={{ fontSize: Math.round(9.5 * scale) }}
              >
                Recent Activity
              </span>
              <span
                className="text-white/50 cursor-pointer"
                style={{ fontSize: Math.round(8 * scale) }}
              >
                See all
              </span>
            </div>

            {/* Tight, gap-free list */}
            <div className="space-y-1 mt-0.5">
              {/* Item 1 */}
              <div className="flex items-center justify-between bg-white/5 hover:bg-white/10 transition-colors rounded-xl px-2 py-1.5 border border-white/5">
                <div className="flex items-center gap-2">
                  <div
                    className="rounded-full bg-violet-400/20 border border-white/15 flex items-center justify-center text-white font-semibold flex-shrink-0"
                    style={{ width: Math.round(20 * scale), height: Math.round(20 * scale), fontSize: Math.round(8.5 * scale) }}
                  >
                    AW
                  </div>
                  <div className="text-left leading-tight">
                    <span className="text-white/95 font-medium block" style={{ fontSize: Math.round(8.5 * scale) }}>
                      A member bought a ticket
                    </span>
                    <span className="text-white/50 block" style={{ fontSize: Math.round(7.5 * scale) }}>
                      Event ticket • booked
                    </span>
                  </div>
                </div>
                <span className="text-emerald-300 font-medium" style={{ fontSize: Math.round(7.5 * scale) }}>
                  2m ago
                </span>
              </div>

              {/* Item 2 */}
              <div className="flex items-center justify-between bg-white/5 hover:bg-white/10 transition-colors rounded-xl px-2 py-1.5 border border-white/5">
                <div className="flex items-center gap-2">
                  <div
                    className="rounded-full bg-pink-400/20 border border-white/15 flex items-center justify-center text-white font-semibold flex-shrink-0"
                    style={{ width: Math.round(20 * scale), height: Math.round(20 * scale), fontSize: Math.round(8.5 * scale) }}
                  >
                    MS
                  </div>
                  <div className="text-left leading-tight">
                    <span className="text-white/95 font-medium block" style={{ fontSize: Math.round(8.5 * scale) }}>
                      Maya S. renewed membership
                    </span>
                    <span className="text-white/50 block" style={{ fontSize: Math.round(7.5 * scale) }}>
                      Active Member • Annual
                    </span>
                  </div>
                </div>
                <span className="text-white/40" style={{ fontSize: Math.round(7.5 * scale) }}>
                  1h ago
                </span>
              </div>

              {/* Item 3 */}
              <div className="flex items-center justify-between bg-white/5 hover:bg-white/10 transition-colors rounded-xl px-2 py-1.5 border border-white/5">
                <div className="flex items-center gap-2">
                  <div
                    className="rounded-full bg-amber-400/20 border border-white/15 flex items-center justify-center text-white font-semibold flex-shrink-0"
                    style={{ width: Math.round(20 * scale), height: Math.round(20 * scale), fontSize: Math.round(8.5 * scale) }}
                  >
                    RL
                  </div>
                  <div className="text-left leading-tight">
                    <span className="text-white/95 font-medium block" style={{ fontSize: Math.round(8.5 * scale) }}>
                      Ryan L. ordered a hoodie
                    </span>
                    <span className="text-white/50 block" style={{ fontSize: Math.round(7.5 * scale) }}>
                      Merch Store • Size M
                    </span>
                  </div>
                </div>
                <span className="text-white/40" style={{ fontSize: Math.round(7.5 * scale) }}>
                  2h ago
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Native Glass Navigation Bar */}
        <div
          className="relative z-20 px-4 py-2 border-t border-white/10 flex items-center justify-around"
          style={{
            background: 'rgba(50, 25, 45, 0.85)',
            backdropFilter: 'blur(16px)',
          }}
        >
          {/* Home */}
          <button className="flex flex-col items-center gap-0.5 text-white">
            <svg width={14 * scale} height={14 * scale} viewBox="0 0 24 24" fill="currentColor">
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z" />
            </svg>
            <span className="font-semibold" style={{ fontSize: Math.round(7 * scale) }}>
              Home
            </span>
          </button>

          {/* Events */}
          <button className="flex flex-col items-center gap-0.5 text-white/50 hover:text-white">
            <svg
              width={14 * scale}
              height={14 * scale}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span style={{ fontSize: Math.round(7 * scale) }}>Events</span>
          </button>

          {/* Plus Action */}
          <button
            className="rounded-full flex items-center justify-center text-white shadow-lg border border-white/30"
            style={{
              width: Math.round(26 * scale),
              height: Math.round(26 * scale),
              background: 'linear-gradient(135deg, #e879f9 0%, #a855f7 100%)',
            }}
          >
            <span className="text-base leading-none font-light mb-0.5">+</span>
          </button>

          {/* Members */}
          <button className="flex flex-col items-center gap-0.5 text-white/50 hover:text-white">
            <svg
              width={14 * scale}
              height={14 * scale}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
            <span style={{ fontSize: Math.round(7 * scale) }}>Members</span>
          </button>

          {/* Finance */}
          <button className="flex flex-col items-center gap-0.5 text-white/50 hover:text-white">
            <svg
              width={14 * scale}
              height={14 * scale}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <span style={{ fontSize: Math.round(7 * scale) }}>Finance</span>
          </button>
        </div>

        {/* 5. Home Bar Indicator */}
        <div className="w-full flex justify-center pb-1 pt-0.5">
          <div
            className="bg-white/40 rounded-full"
            style={{
              width: Math.round(72 * scale),
              height: 3,
            }}
          />
        </div>
      </div>
    </motion.div>
  )
}
