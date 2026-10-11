import { useEffect, useRef, useState } from 'react'
import { motion, useScroll, useTransform, useInView, AnimatePresence } from 'motion/react'
import BlurText from './BlurText'
import PhoneUI from './PhoneUI'
import TruckLoader from './TruckLoader'
import FundraisersPage from './FundraisersPage'
import UpdatesPage from './UpdatesPage'
import AboutPage from './AboutPage'

// Assets
const imgSunset = '/sunset.png'
const imgLogo = '/logo.png'
const imgMiddle = '/middle.png'
const imgCard1 = '/1.png'
const imgCard2 = '/2.png'
const imgCard3 = '/3.png'
const imgCard4 = '/4.png'
const imgCard5 = '/5.png'
const imgCard6 = '/6.png'
const imgClouds = 'https://motionsites.org/assets/prompt-media/5bce3eecdbd8f8de8ccf.png'
const imgPeaceSymbol = 'https://motionsites.org/assets/prompt-media/5c46f33dc2b88499d929.png'
const imgMedThumb1 = 'https://motionsites.org/assets/prompt-media/71f12602a71782c3e4be.png'
const imgMedThumb2 = 'https://motionsites.org/assets/prompt-media/16d0e1e7a950db944cfa.png'
const imgMedThumb3 = 'https://motionsites.org/assets/prompt-media/200d8f14e85250f9ecbc.png'

const EASE = [0.22, 1, 0.36, 1] as const

// ---------- Skyline Logo ----------
function NoolaLogo() {
  return (
    <img
      src={imgLogo}
      alt="Odoo Skyline"
      className="h-7 sm:h-8 w-auto"
      style={{ filter: 'brightness(0) invert(1)' }}
    />
  )
}

// ---------- Hamburger <-> X ----------
function HamburgerButton({ open, onClick }: { open: boolean; onClick: () => void }) {
  return (
    <button
      aria-label="menu"
      onClick={onClick}
      className="md:hidden flex flex-col justify-center items-center w-10 h-10 gap-1.5 z-[60] relative"
      style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}
    >
      <span
        style={{
          width: 24,
          height: 2,
          background: 'white',
          borderRadius: 2,
          transform: open ? 'translateY(8px) rotate(45deg)' : 'none',
          transition: '0.35s cubic-bezier(0.4,0,0.2,1)',
        }}
      />
      <span
        style={{
          width: 24,
          height: 2,
          background: 'white',
          borderRadius: 2,
          opacity: open ? 0 : 1,
          transform: open ? 'scaleX(0)' : 'scaleX(1)',
          transition: '0.35s cubic-bezier(0.4,0,0.2,1)',
        }}
      />
      <span
        style={{
          width: 24,
          height: 2,
          background: 'white',
          borderRadius: 2,
          transform: open ? 'translateY(-8px) rotate(-45deg)' : 'none',
          transition: '0.35s cubic-bezier(0.4,0,0.2,1)',
        }}
      />
    </button>
  )
}

// ---------- Nav ----------
interface NavProps {
  currentPage: 'home' | 'fundraisers' | 'updates' | 'about'
  onNavigate: (page: 'home' | 'fundraisers' | 'updates' | 'about') => void
  onOpenAuth?: () => void
  currentUser?: { name: string; role: string } | null
  onOpenDashboard?: () => void
}

function Nav({ currentPage, onNavigate, onOpenAuth, currentUser, onOpenDashboard }: NavProps) {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [hoveredItem, setHoveredItem] = useState<string | null>(null)
  const [showFeaturesMenu, setShowFeaturesMenu] = useState(false)
  const navRef = useRef<HTMLDivElement>(null)

  const navLinks = [
    { name: 'Features', href: '#features', page: 'home' as const, hasDropdown: true },
    { name: 'Fundraisers', href: '#fundraisers', page: 'fundraisers' as const },
    { name: 'Updates', href: '#announcements', page: 'updates' as const },
    { name: 'About', href: '#about', page: 'about' as const },
  ]

  const featureDropdownItems = [
    {
      title: 'Digital Membership',
      desc: 'Instant registration & dues tracker',
      href: '#membership',
      tag: 'Core',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      ),
    },
    {
      title: 'Events & Ticketing',
      desc: 'RSVPs, door scanning & reminders',
      href: '#events',
      tag: 'Live',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
        </svg>
      ),
    },
    {
      title: 'Merchandise Store',
      desc: 'Hoodie sizes & live inventory',
      href: '#merchandise',
      tag: 'Sales',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
          <line x1="3" y1="6" x2="21" y2="6" />
          <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
      ),
    },
    {
      title: "Treasurer's Ledger",
      desc: 'Real-time inflows & reimbursements',
      href: '#treasury',
      tag: 'Finance',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="1" x2="12" y2="23" />
          <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
        </svg>
      ),
    },
  ]

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 24)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) {
        setShowFeaturesMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header className="fixed top-0 left-0 w-full z-50 px-3 sm:px-6 md:px-8 pt-3 sm:pt-4 transition-all duration-300">
      <div
        ref={navRef}
        className={`max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 rounded-2xl transition-all duration-300 border ${
          scrolled
            ? 'py-2.5 bg-[#2B1325]/95 backdrop-blur-2xl border-white/15 shadow-[0_18px_42px_rgba(0,0,0,0.45)]'
            : 'py-3 sm:py-3.5 bg-[#3B1B34]/90 backdrop-blur-2xl border-white/15 shadow-[0_12px_32px_rgba(0,0,0,0.30)]'
        }`}
      >
        {/* Brand */}
        <button
          onClick={() => onNavigate('home')}
          className="flex items-center gap-3 group relative transition-transform duration-300 hover:scale-[1.02] text-left cursor-pointer border-none bg-transparent outline-none focus:outline-none focus:ring-0"
        >
          <div className="relative flex items-center">
            <NoolaLogo />
          </div>
        </button>

        {/* Center Nav Links (Desktop) */}
        <nav className="hidden lg:flex items-center gap-2 relative">
          {navLinks.map((link) => {
            const isActive = link.hasDropdown ? currentPage === 'home' : currentPage === link.page

            if (link.hasDropdown) {
              return (
                <div
                  key={link.name}
                  className="relative"
                  onMouseEnter={() => {
                    setHoveredItem(link.name)
                    setShowFeaturesMenu(true)
                  }}
                  onMouseLeave={() => {
                    setHoveredItem(null)
                    setShowFeaturesMenu(false)
                  }}
                >
                  <button
                    onClick={() => {
                      onNavigate('home')
                      setShowFeaturesMenu(!showFeaturesMenu)
                    }}
                    className={`relative z-10 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs uppercase tracking-wider font-semibold transition-all duration-200 cursor-pointer border-none ${
                      isActive || showFeaturesMenu ? 'bg-white/15 text-white shadow-sm' : 'bg-transparent text-white/80 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <span>{link.name}</span>
                    <motion.svg
                      animate={{ rotate: showFeaturesMenu ? 180 : 0 }}
                      transition={{ duration: 0.2 }}
                      width="10"
                      height="10"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </motion.svg>
                  </button>

                  {/* Mega Dropdown Menu */}
                  <AnimatePresence>
                    {showFeaturesMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 12, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 8, scale: 0.96 }}
                        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                        className="absolute left-1/2 -translate-x-1/2 top-full pt-3 w-80 z-50"
                      >
                        <div className="rounded-2xl p-2.5 bg-[#2B1325]/98 border border-white/20 backdrop-blur-2xl shadow-[0_24px_50px_rgba(0,0,0,0.6)] flex flex-col gap-1.5 text-left">
                          <div className="px-3 pt-1 pb-1 text-[10px] font-normal uppercase tracking-widest text-white/50 border-b border-white/10 flex items-center justify-between">
                            <span>Club Capabilities</span>
                            <span className="text-[9px] text-white/40">4 Modules</span>
                          </div>
                          {featureDropdownItems.map((f) => (
                            <a
                              key={f.title}
                              href={f.href}
                              onClick={() => {
                                onNavigate('home')
                                setShowFeaturesMenu(false)
                              }}
                              className="group flex items-start gap-3 p-2.5 rounded-xl hover:bg-white/15 transition-all duration-200"
                            >
                              <div className="w-8 h-8 rounded-lg bg-white/10 border border-white/10 flex items-center justify-center text-white/90 group-hover:scale-105 group-hover:bg-white group-hover:text-[#714B67] transition-all">
                                {f.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-semibold text-white group-hover:text-white">
                                    {f.title}
                                  </span>
                                  <span className="text-[9px] uppercase px-1.5 py-0.2 rounded bg-white/10 text-white/70 font-mono">
                                    {f.tag}
                                  </span>
                                </div>
                                <p className="text-[11px] text-white/60 line-clamp-1 mt-0.5 font-normal">
                                  {f.desc}
                                </p>
                              </div>
                            </a>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            }

            return (
              <button
                key={link.name}
                onClick={() => onNavigate(link.page)}
                onMouseEnter={() => setHoveredItem(link.name)}
                onMouseLeave={() => setHoveredItem(null)}
                className={`relative z-10 px-3.5 py-1.5 rounded-xl text-xs uppercase tracking-wider font-semibold transition-all duration-200 cursor-pointer border-none ${
                  isActive ? 'bg-white/15 text-white shadow-sm' : 'bg-transparent text-white/80 hover:text-white hover:bg-white/10'
                }`}
              >
                {link.name}
              </button>
            )
          })}
        </nav>

        {/* Right CTA Group */}
        <div className="hidden sm:flex items-center gap-3">
          {currentUser ? (
            <motion.button
              onClick={onOpenDashboard}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-xs font-semibold cursor-pointer transition-all shadow-sm backdrop-blur-sm"
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{currentUser.name}</span>
              <span className="px-2 py-0.5 rounded-md bg-[#714B67] text-[10px] font-bold uppercase tracking-wider border border-white/20">
                {currentUser.role}
              </span>
            </motion.button>
          ) : (
            <motion.button
              onClick={() => (onOpenAuth ? onOpenAuth() : onNavigate('home'))}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              className="relative group overflow-hidden inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-white text-[#714B67] text-xs font-bold uppercase tracking-wider shadow-md hover:bg-neutral-100 transition-all cursor-pointer border-none"
            >
              <span className="relative z-10 flex items-center gap-1.5">
                <span>Sign In / Join</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </span>
            </motion.button>
          )}
        </div>

        {/* Mobile Hamburger toggle */}
        <div className="lg:hidden flex items-center gap-2">
          {currentUser ? (
            <button
              onClick={onOpenDashboard}
              className="sm:hidden px-2.5 py-1 rounded-lg bg-white/20 text-white text-[10px] font-bold uppercase tracking-wider border border-white/20"
            >
              {currentUser.role}
            </button>
          ) : (
            <button
              onClick={() => (onOpenAuth ? onOpenAuth() : onNavigate('home'))}
              className="sm:hidden px-3 py-1.5 rounded-lg bg-white text-[#714B67] text-[11px] font-bold uppercase tracking-wider shadow-sm border-none cursor-pointer"
            >
              Join
            </button>
          )}
          <HamburgerButton open={open} onClick={() => setOpen(!open)} />
        </div>
      </div>

      {/* Mobile SaaS Menu Drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0, y: -10 }}
            animate={{ opacity: 1, height: 'auto', y: 0 }}
            exit={{ opacity: 0, height: 0, y: -10 }}
            transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
            className="lg:hidden mt-2.5 overflow-hidden rounded-2xl border border-white/20 shadow-[0_20px_50px_rgba(0,0,0,0.5)]"
            style={{
              background: 'rgba(52, 23, 44, 0.96)',
              backdropFilter: 'blur(28px)',
              WebkitBackdropFilter: 'blur(28px)',
            }}
          >
            <div className="p-4 flex flex-col gap-1.5 text-left">
              <div className="text-[10px] uppercase font-bold text-white/50 tracking-widest px-3 pt-1">
                Explore Club Features
              </div>
              {featureDropdownItems.map((f, i) => (
                <motion.a
                  key={f.title}
                  href={f.href}
                  onClick={() => setOpen(false)}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.05 + i * 0.04 }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors text-white"
                >
                  <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-white/90">
                    {f.icon}
                  </div>
                  <div>
                    <div className="text-xs font-semibold">{f.title}</div>
                    <div className="text-[11px] text-white/60">{f.desc}</div>
                  </div>
                </motion.a>
              ))}

              <div className="text-[10px] uppercase font-bold text-white/50 tracking-widest px-3 pt-2">
                Pages
              </div>
              <button
                onClick={() => {
                  onNavigate('fundraisers')
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-white hover:bg-white/10"
              >
                Fundraisers
              </button>
              <button
                onClick={() => {
                  onNavigate('updates')
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-white hover:bg-white/10"
              >
                Updates
              </button>
              <button
                onClick={() => {
                  onNavigate('about')
                  setOpen(false)
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs font-medium text-white hover:bg-white/10"
              >
                About
              </button>

              <div className="border-t border-white/10 my-2 pt-3 flex flex-col gap-2">
                <button
                  onClick={() => {
                    onNavigate('home')
                    setOpen(false)
                  }}
                  className="w-full py-3 rounded-xl bg-white text-[#714B67] text-xs font-bold uppercase tracking-wider text-center shadow-lg active:scale-[0.98] transition-transform border-none cursor-pointer"
                >
                  Get started free
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

// ---------- Hero ----------
function Hero() {
  const sectionRef = useRef<HTMLDivElement>(null)

  return (
    <section
      ref={sectionRef}
      className="relative flex flex-col overflow-visible"
      style={{ background: '#714B67' }}
    >
      {/* Body */}
      <div
        className="relative z-10 flex flex-col items-center text-center pt-10 sm:pt-14 md:pt-16 pb-6 sm:pb-8"
      >
        {/* Eyebrow */}
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.9, delay: 0.2, ease: EASE }}
          className="text-white/70 text-xs sm:text-sm font-semibold tracking-widest uppercase mb-3"
        >
          One platform for your club
        </motion.p>

        {/* H1 */}
        <h1
          className="text-white mb-8 sm:mb-12 text-center mx-auto flex justify-center"
          style={{
            fontSize: 'clamp(2.5rem, 8vw, 6.2rem)',
            lineHeight: 0.95,
            letterSpacing: '-0.04em',
            maxWidth: '13ch',
          }}
        >
          <BlurText
            text="Your campus club, all in one place"
            delay={180}
            direction="bottom"
            stepDuration={0.55}
            className="justify-center text-center"
          />
        </h1>

        {/* Phone mockup */}
        <motion.div
          initial={{ opacity: 0, y: 35, scale: 0.94 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 1.2, delay: 0.45, ease: EASE }}
          className="relative z-20"
        >
          <div className="block sm:hidden">
            <PhoneUI width={240} />
          </div>
          <div className="hidden sm:block md:hidden">
            <PhoneUI width={270} />
          </div>
          <div className="hidden md:block">
            <PhoneUI width={300} />
          </div>
        </motion.div>
      </div>

      {/* Sub-block (Tightly connected to iPhone mockup) */}
      <div className="relative z-20 flex flex-col items-center text-center pt-4 sm:pt-6 pb-8 sm:pb-10 px-5">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-20px' }}
          transition={{ duration: 0.9, delay: 0.2, ease: EASE }}
          className="text-white/85 font-medium max-w-sm md:max-w-xl mb-6 leading-relaxed"
          style={{ fontSize: 'clamp(0.95rem, 2vw, 1.15rem)' }}
        >
          A single platform to sign up members, sell event tickets, manage your budget, and reach everyone at once — no more spreadsheets, cash boxes, or group-chat chaos.
        </motion.p>
        <motion.a
          id="get-started"
          href="#get-started"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-20px' }}
          transition={{ duration: 0.9, delay: 0.35, ease: EASE }}
          className="rounded-xl bg-white px-7 py-3.5 text-xs font-bold uppercase tracking-widest text-[#714B67] shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all"
        >
          Get started
        </motion.a>
      </div>
    </section>
  )
}

// ---------- FeaturesIntro ----------
function FeaturesIntro() {
  return (
    <section
      id="features"
      className="relative px-5 py-10 lg:py-14 flex flex-col justify-center items-center text-center max-w-5xl mx-auto overflow-hidden"
    >
      {/* Subtle section divider line */}
      <div className="w-full max-w-4xl mx-auto mb-8 border-t border-white/15" />

      <div className="relative z-10 flex flex-col items-center w-full">
        <h2
          className="text-white"
          style={{
            fontSize: 'clamp(2.5rem, 8vw, 6.5rem)',
            letterSpacing: '-0.04em',
            lineHeight: 1.08,
          }}
        >
          <BlurText text="Designed" delay={160} direction="bottom" stepDuration={0.58} />

          <div className="inline-flex flex-wrap items-center justify-center gap-x-3 sm:gap-x-4 my-1">
            <BlurText
              text="for your"
              delay={160}
              direction="bottom"
              stepDuration={0.58}
              animationFrom={{ filter: 'blur(10px)', opacity: 0, y: 50 }}
              animationTo={[
                { filter: 'blur(5px)', opacity: 0.5, y: -5 },
                { filter: 'blur(0px)', opacity: 1, y: 0 },
              ]}
            />
            {/* Astrological / Campus Orbit Emblem (middle-transparent.png) with continuous rotating animation */}
            <div
              className="inline-flex items-center justify-center mx-1 sm:mx-2.5"
              style={{
                verticalAlign: 'middle',
                position: 'relative',
                top: '-0.06em',
              }}
            >
              <motion.img
                src={imgMiddle}
                alt="Skyline Orbit Emblem"
                animate={{ rotate: 360 }}
                transition={{
                  repeat: Infinity,
                  duration: 18,
                  ease: 'linear',
                }}
                className="w-14 h-14 sm:w-20 sm:h-20 md:w-24 md:h-24 object-contain drop-shadow-[0_4px_16px_rgba(0,0,0,0.25)] hover:scale-105 transition-transform"
                style={{ background: 'transparent' }}
              />
            </div>
            <BlurText text="club" delay={160} direction="bottom" stepDuration={0.58} />
          </div>

          <BlurText text="to thrive" delay={160} direction="bottom" stepDuration={0.58} />
        </h2>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: '-40px' }}
          transition={{ duration: 1.1, delay: 0.4, ease: EASE }}
          className="text-white/80 font-medium mt-4 sm:mt-6 max-w-md text-base sm:text-lg"
        >
          Run your whole semester from one place:
        </motion.p>
      </div>
    </section>
  )
}

// ---------- blurIn helper for cards ----------
const blurIn = (delay: number) => ({
  initial: { opacity: 0, filter: 'blur(10px)', y: 20 },
  whileInView: { opacity: 1, filter: 'blur(0px)', y: 0 },
  viewport: { once: true, margin: '-40px' as const },
  transition: { duration: 1.05, delay, ease: EASE },
})

// ---------- MoodTrackingCard ----------
function MoodTrackingCard() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section id="membership" className="relative px-4 sm:px-6 md:px-10 py-8 lg:py-12 flex flex-col justify-center items-center">
      {/* Subtle section divider line */}
      <div className="w-full max-w-5xl mx-auto mb-6 sm:mb-8 border-t border-white/15" />

      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 40 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 1.1, ease: EASE }}
        className="w-full max-w-5xl mx-auto rounded-[24px] sm:rounded-[28px] overflow-hidden shadow-2xl"
        style={{ background: '#FFFFFF' }}
      >
        <div
          className="flex flex-col md:flex-row"
          style={{ minHeight: '440px' }}
        >
          <div className="sm:min-h-[420px]" />
          {/* Text - left on desktop, order 2 on mobile */}
          <div
            className="order-2 md:order-1 md:w-[45%] flex flex-col justify-end p-6 md:p-12"
            style={{ minHeight: '260px' }}
          >
            {/* Number 1 image above text */}
            <motion.div {...blurIn(0.2)} className="mb-4">
              <img src={imgCard1} alt="Membership" className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow-md" />
            </motion.div>

            <motion.p
              {...blurIn(0.3)}
              className="text-xs uppercase tracking-widest font-semibold"
              style={{ color: '#714B67' }}
            >
              MEMBERSHIP
            </motion.p>
            <motion.p
              {...blurIn(0.55)}
              className="font-medium mt-3"
              style={{
                fontSize: 'clamp(1rem, 2.5vw, 1.35rem)',
                color: '#212529',
                maxWidth: '36ch',
              }}
            >
              Sign up new members in seconds, track who's paid their dues, and check membership at any event. Renewal reminders go out before the year ends, so no one slips through the cracks.
            </motion.p>
          </div>

          {/* Phone - right */}
          <div
            className="order-1 md:order-2 relative overflow-hidden md:w-[55%]"
            style={{ minHeight: '260px' }}
          >
            <div
              className="absolute left-1/2"
              style={{ transform: 'translateX(-50%)', bottom: '-88%' }}
            >
              <div className="block md:hidden">
                <PhoneUI width={220} />
              </div>
            </div>
            <div
              className="absolute left-1/2 hidden sm:block md:hidden"
              style={{ transform: 'translateX(-50%)', bottom: '-165%' }}
            >
              <PhoneUI width={300} />
            </div>
            <div
              className="absolute left-1/2 hidden md:block"
              style={{ transform: 'translateX(-50%)', bottom: '-68%' }}
            >
              <PhoneUI width={300} />
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  )
}

// ---------- MeditationItem ----------
type MeditationItemProps = {
  title: string
  duration: string
  thumb: string
  index: number
}

function MeditationItem({ title, duration, thumb, index }: MeditationItemProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.85, delay: 0.4 + index * 0.22, ease: EASE }}
      className="rounded-2xl bg-white flex overflow-hidden"
      style={{ position: 'relative' }}
    >
      {/* Left content */}
      <div className="flex flex-col justify-between p-3" style={{ flex: '1 1 auto' }}>
        <h3
          className="font-medium"
          style={{
            fontFamily: 'var(--font-inter)',
            fontSize: 'clamp(1.05rem, 3.5vw, 1.2rem)',
            color: '#714B67',
          }}
        >
          {title}
        </h3>
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: '#714B67',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="white">
            <path d="M1 1.5l8 3.5-8 3.5V1.5z" />
          </svg>
        </div>
      </div>

      {/* Right thumbnail */}
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{ width: 110, flexShrink: 0 }}
      >
        <img
          src={thumb}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div
          className="absolute top-2 right-2 rounded-full"
          style={{
            background: 'rgba(0,0,0,0.4)',
            padding: '2px 8px',
            fontFamily: 'var(--font-inter)',
            fontSize: 11,
            color: 'white',
          }}
        >
          {duration}
        </div>
      </div>
    </motion.div>
  )
}

// ---------- GuidedMeditationsCard ----------
function GuidedMeditationsCard() {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  const items: Array<{ title: string; duration: string; thumb: string }> = [
    { title: 'Spring Gala', duration: 'Apr 15', thumb: imgMedThumb2 },
    { title: 'Bake Sale Fundraiser', duration: 'Apr 22', thumb: imgMedThumb1 },
    { title: 'Monthly Town Hall', duration: 'May 3', thumb: imgMedThumb3 },
  ]

  return (
    <section id="events" className="relative px-4 sm:px-6 md:px-10 py-8 lg:py-12 flex flex-col justify-center items-center">
      {/* Subtle section divider line */}
      <div className="w-full max-w-5xl mx-auto mb-6 sm:mb-8 border-t border-white/15" />

      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 40 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 1.1, ease: EASE }}
        className="w-full max-w-5xl mx-auto rounded-[24px] sm:rounded-[28px] overflow-hidden shadow-2xl"
        style={{ background: '#FFFFFF' }}
      >
        <div
          className="flex flex-col md:flex-row"
          style={{ minHeight: '440px' }}
        >
          <div className="sm:min-h-[420px]" />
          {/* Text - left on desktop */}
          <div
            className="order-2 md:order-1 md:w-[45%] flex flex-col justify-end p-6 md:p-12"
            style={{ minHeight: '260px' }}
          >
            {/* Number 2 image above text */}
            <motion.div {...blurIn(0.2)} className="mb-4">
              <img src={imgCard2} alt="Events" className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow-md" />
            </motion.div>

            <motion.p
              {...blurIn(0.3)}
              className="text-xs uppercase tracking-widest font-semibold"
              style={{ color: '#714B67' }}
            >
              EVENTS
            </motion.p>
            <motion.p
              {...blurIn(0.55)}
              className="font-medium mt-3"
              style={{
                fontSize: 'clamp(1rem, 2.5vw, 1.35rem)',
                color: '#212529',
                maxWidth: '36ch',
              }}
            >
              Sell tickets online with member and non-member pricing, set a seat cap, and check guests in at the door in seconds. Afterward, see exactly how many showed up and how much you made.
            </motion.p>
          </div>

          {/* Right - meditation items */}
          <div
            className="order-1 md:order-2 md:w-[55%] flex flex-col justify-center p-6 md:p-10"
            style={{ gap: 12 }}
          >
            <div className="flex flex-col gap-3 mx-auto" style={{ maxWidth: 320, width: '100%' }}>
              {items.map((item, i) => (
                <MeditationItem
                  key={i}
                  title={item.title}
                  duration={item.duration}
                  thumb={item.thumb}
                  index={i}
                />
              ))}
            </div>
          </div>
        </div>
      </motion.div>
    </section>
  )
}

// ---------- SimpleFeatureCard (reuses card shell + blurIn) ----------
type SimpleFeatureCardProps = {
  label: string
  body: string
  reverse?: boolean
  imageNumber?: string
  visual: React.ReactNode
}

function SimpleFeatureCard({ label, body, reverse, imageNumber, visual }: SimpleFeatureCardProps) {
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, margin: '-80px' })

  return (
    <section className="relative px-4 sm:px-6 md:px-10 py-8 lg:py-12 flex flex-col justify-center items-center">
      {/* Subtle section divider line */}
      <div className="w-full max-w-5xl mx-auto mb-6 sm:mb-8 border-t border-white/15" />

      <motion.div
        ref={ref}
        initial={{ opacity: 0, y: 40 }}
        animate={inView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 1.1, ease: EASE }}
        className="w-full max-w-5xl mx-auto rounded-[24px] sm:rounded-[28px] overflow-hidden shadow-2xl"
        style={{ background: '#FFFFFF' }}
      >
        <div
          className="flex flex-col md:flex-row"
          style={{ minHeight: '440px' }}
        >
          <div className="sm:min-h-[420px]" />
          {/* Text column */}
          <div
            className={`flex flex-col justify-end p-6 md:p-12 ${reverse ? 'order-1 md:order-2 md:w-[45%]' : 'order-2 md:order-1 md:w-[45%]'}`}
            style={{ minHeight: '260px' }}
          >
            {imageNumber && (
              <motion.div {...blurIn(0.2)} className="mb-4">
                <img src={imageNumber} alt={label} className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow-md" />
              </motion.div>
            )}

            <motion.p
              {...blurIn(0.3)}
              className="text-xs uppercase tracking-widest font-semibold"
              style={{ color: '#714B67' }}
            >
              {label}
            </motion.p>
            <motion.p
              {...blurIn(0.55)}
              className="font-medium mt-3"
              style={{
                fontSize: 'clamp(1rem, 2.5vw, 1.35rem)',
                color: '#212529',
                maxWidth: '36ch',
              }}
            >
              {body}
            </motion.p>
          </div>

          {/* Visual column */}
          <div
            className={`relative overflow-hidden flex flex-col justify-center p-6 md:p-10 ${reverse ? 'order-2 md:order-1 md:w-[55%]' : 'order-1 md:order-2 md:w-[55%]'}`}
            style={{ minHeight: '260px' }}
          >
            {visual}
          </div>
        </div>
      </motion.div>
    </section>
  )
}

// ---------- AnnouncementsSection ----------
function AnnouncementsSection() {
  const announcements = [
    { title: 'Spring Gala tickets are live', time: '2h ago', tag: 'Events' },
    { title: 'Hoodie orders close Friday', time: '5h ago', tag: 'Merch' },
    { title: 'Bake Friday: sign up to bake', time: '1d ago', tag: 'Fundraiser' },
  ]
  return (
    <div id="announcements">
      <SimpleFeatureCard
        label="ANNOUNCEMENTS"
        imageNumber={imgCard6}
        body="Post one announcement and reach every member at once — no more typing the same message into five WhatsApp groups. Everything you post is kept in a timeline, so nothing gets lost in a chat."
        reverse
        visual={
          <div className="flex flex-col gap-3 mx-auto" style={{ maxWidth: 320, width: '100%' }}>
            {announcements.map((a, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: -24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.85, delay: 0.4 + i * 0.22, ease: EASE }}
                className="rounded-2xl flex overflow-hidden"
                style={{ position: 'relative', background: '#F7F3F8' }}
              >
                <div className="flex flex-col justify-between p-3" style={{ flex: '1 1 auto' }}>
                  <h3
                    className="font-medium"
                    style={{
                      fontFamily: 'var(--font-inter)',
                      fontSize: 'clamp(0.95rem, 3vw, 1.1rem)',
                      color: '#212529',
                    }}
                  >
                    {a.title}
                  </h3>
                  <span
                    style={{
                      fontFamily: 'var(--font-inter)',
                      fontSize: 11,
                      color: '#714B67',
                      fontWeight: 500,
                    }}
                  >
                    {a.time} · {a.tag}
                  </span>
                </div>
                <div
                  style={{
                    width: 6,
                    background: '#714B67',
                    flexShrink: 0,
                  }}
                />
              </motion.div>
            ))}
          </div>
        }
      />
    </div>
  )
}

// ---------- MerchandiseSection ----------
function MerchandiseSection() {
  const sizes = [
    { size: 'XS', left: 3, total: 5 },
    { size: 'M', left: 8, total: 12 },
    { size: 'L', left: 2, total: 10 },
    { size: 'XL', left: 0, total: 8 },
  ]
  return (
    <div id="merchandise">
      <SimpleFeatureCard
        label="MERCHANDISE"
        imageNumber={imgCard3}
        body="Collect sizes, take orders and payment, and track stock — all from one dashboard. Members order hoodies and tees from their phones, and you always know exactly how many of each size are left."
        visual={
          <div className="flex flex-col gap-3 mx-auto" style={{ maxWidth: 320, width: '100%' }}>
            {sizes.map((s, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: -24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-40px' }}
                transition={{ duration: 0.85, delay: 0.4 + i * 0.22, ease: EASE }}
                className="rounded-2xl bg-white flex items-center p-3 gap-3"
                style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 8,
                    background: s.left === 0 ? '#E8E0E8' : '#714B67',
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'var(--font-inter)',
                    fontSize: 14,
                    fontWeight: 600,
                    flexShrink: 0,
                    opacity: s.left === 0 ? 0.5 : 1,
                  }}
                >
                  {s.size}
                </div>
                <div style={{ flex: '1 1 auto' }}>
                  <div
                    style={{
                      fontFamily: 'var(--font-inter)',
                      fontSize: 13,
                      color: '#212529',
                      fontWeight: 500,
                    }}
                  >
                    {s.left === 0 ? 'Sold out' : `${s.left} in stock`}
                  </div>
                  <div style={{ width: '100%', height: 4, background: '#F0EBF0', borderRadius: 99, marginTop: 6, overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${(s.left / s.total) * 100}%`,
                        height: '100%',
                        background: s.left === 0 ? '#C9B8C9' : '#714B67',
                        borderRadius: 99,
                      }}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        }
      />
    </div>
  )
}

// ---------- FundraiserSection ----------
function FundraiserSection() {
  const tasks = [
    { task: 'Bake 2 dozen brownies', who: 'Maya', done: true },
    { task: 'Buy supplies (flour, sugar)', who: 'Arjun', done: true },
    { task: 'Set up the table Friday 9 AM', who: 'A volunteer', done: false },
    { task: 'Count cash at end of day', who: 'Treasurer', done: false },
  ]
  return (
    <div id="fundraisers">
      <SimpleFeatureCard
        label="FUNDRAISERS"
        imageNumber={imgCard5}
        body="Split tasks across your volunteer team and see, at a glance, what still needs doing and who's on it. No more plans living in someone's head or a buried group chat — just a clear checklist everyone can follow."
        reverse
      visual={
        <div className="flex flex-col gap-3 mx-auto" style={{ maxWidth: 320, width: '100%' }}>
          {tasks.map((t, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: -24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 0.85, delay: 0.4 + i * 0.22, ease: EASE }}
              className="rounded-2xl bg-white flex items-center p-3 gap-3"
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  border: t.done ? 'none' : '2px solid #D4C4CE',
                  background: t.done ? '#714B67' : 'transparent',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {t.done && (
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M2 6.5l2.5 2.5L10 3.5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div style={{ flex: '1 1 auto' }}>
                <div
                  style={{
                    fontFamily: 'var(--font-inter)',
                    fontSize: 13,
                    color: '#212529',
                    fontWeight: 500,
                    textDecoration: t.done ? 'line-through' : 'none',
                    opacity: t.done ? 0.5 : 1,
                  }}
                >
                  {t.task}
                </div>
                <div style={{ fontFamily: 'var(--font-inter)', fontSize: 11, color: '#714B67', marginTop: 2 }}>
                  {t.who}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      }
    />
    </div>
  )
}

// ---------- TreasurerSection ----------
function TreasurerSection() {
  const rows = [
    { label: 'Membership dues', amount: '+ ₹ ••••', positive: true },
    { label: 'Spring gala tickets', amount: '+ ₹ ••••', positive: true },
    { label: 'Hoodie sales', amount: '+ ₹ ••••', positive: true },
    { label: 'Bake sale supplies', amount: '− ₹ ••••', positive: false },
    { label: 'Volunteer reimbursements', amount: '− ₹ ••••', positive: false },
  ]
  return (
    <section id="treasury" className="relative px-4 sm:px-6 md:px-10 py-16 lg:py-24 lg:min-h-screen flex flex-col justify-center items-center">
      {/* Subtle section divider line */}
      <div className="w-full max-w-5xl mx-auto mb-12 sm:mb-16 border-t border-white/15" />

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: '-80px' }}
        transition={{ duration: 1.1, ease: EASE }}
        className="w-full max-w-5xl mx-auto rounded-[24px] sm:rounded-[28px] overflow-hidden shadow-2xl"
        style={{ background: '#FFFFFF' }}
      >
        <div className="flex flex-col md:flex-row" style={{ minHeight: '440px' }}>
          <div className="sm:min-h-[420px]" />
          <div className="order-2 md:order-1 md:w-[45%] flex flex-col justify-end p-6 md:p-12" style={{ minHeight: '260px' }}>
            {/* Number 4 image above text */}
            <motion.div {...blurIn(0.2)} className="mb-4">
              <img src={imgCard4} alt="Treasurer" className="w-12 h-12 sm:w-14 sm:h-14 object-contain drop-shadow-md" />
            </motion.div>

            <motion.p
              {...blurIn(0.3)}
              className="text-xs uppercase tracking-widest font-semibold"
              style={{ color: '#714B67' }}
            >
              THE TREASURER'S BOOK
            </motion.p>
            <motion.p
              {...blurIn(0.55)}
              className="font-medium mt-3"
              style={{
                fontSize: 'clamp(1rem, 2.5vw, 1.35rem)',
                color: '#212529',
                maxWidth: '36ch',
              }}
            >
              Close the books in minutes, not a weekend. Every dollar in — dues, tickets, merch — and every dollar out sits in one ledger anyone on the team can read at a glance.
            </motion.p>
          </div>
          <div className="order-1 md:order-2 md:w-[55%] flex flex-col justify-center p-6 md:p-10">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-40px' }}
              transition={{ duration: 1.1, delay: 0.4, ease: EASE }}
              className="mx-auto w-full"
              style={{ maxWidth: 340 }}
            >
              <div className="rounded-2xl overflow-hidden" style={{ background: '#F7F3F8' }}>
                <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid #E8E0E8' }}>
                  <span style={{ fontFamily: 'var(--font-inter)', fontSize: 11, color: '#714B67', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Balance
                  </span>
                  <span style={{ fontFamily: 'var(--font-inter)', fontSize: 20, fontWeight: 700, color: '#212529' }}>
                    ₹ ••••
                  </span>
                </div>
                {rows.map((r, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true, margin: '-40px' }}
                    transition={{ duration: 0.6, delay: 0.6 + i * 0.12, ease: EASE }}
                    className="px-4 py-3 flex items-center justify-between"
                    style={{ borderBottom: i < rows.length - 1 ? '1px solid #EDE5ED' : 'none' }}
                  >
                    <span style={{ fontFamily: 'var(--font-inter)', fontSize: 13, color: '#212529' }}>
                      {r.label}
                    </span>
                    <span
                      style={{
                        fontFamily: 'var(--font-inter)',
                        fontSize: 13,
                        fontWeight: 600,
                        color: r.positive ? '#2E7D5B' : '#B5403A',
                      }}
                    >
                      {r.amount}
                    </span>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </section>
  )
}

// ---------- Footer ----------
function Footer() {
  return (
    <footer id="about" className="relative z-10 border-t border-white/10 bg-[#4e2744] text-white/70 py-16 px-6 sm:px-10">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8 text-center md:text-left">
        <div className="flex flex-col items-center md:items-start gap-3">
          <NoolaLogo />
          <p className="text-xs text-white/50 max-w-sm leading-relaxed">
            The all-in-one platform for campus student clubs. Streamline signups, ticket sales, merch, and treasury in one clean app.
          </p>
        </div>

        <div className="flex flex-wrap justify-center items-center gap-6 sm:gap-8 text-xs font-semibold uppercase tracking-wider text-white/80">
          <a href="#events" className="hover:text-white transition-colors">
            Events
          </a>
          <a href="#members" className="hover:text-white transition-colors">
            Members
          </a>
          <a href="#finance" className="hover:text-white transition-colors">
            Finance
          </a>
          <a href="#about" className="hover:text-white transition-colors">
            About
          </a>
          <a href="#" className="hover:text-white transition-colors">
            Privacy
          </a>
          <a href="#" className="hover:text-white transition-colors">
            Terms
          </a>
        </div>

        <div className="text-xs text-white/40">
          © {new Date().getFullYear()} Odoo Skyline. All rights reserved.
        </div>
      </div>
    </footer>
  )
}

// ---------- LandingPage ----------
interface LandingPageProps {
  onOpenAuth?: () => void
  currentUser?: { name: string; role: string } | null
  onOpenDashboard?: () => void
}

export default function LandingPage({ onOpenAuth, currentUser, onOpenDashboard }: LandingPageProps = {}) {
  const [loading, setLoading] = useState(true)
  const [currentPage, setCurrentPage] = useState<'home' | 'fundraisers' | 'updates' | 'about'>('home')

  // Sync routing so direct browser links work
  useEffect(() => {
    const handleLocation = () => {
      const path = (window.location.pathname || '').toLowerCase()
      const hash = (window.location.hash || '').toLowerCase()
      const loc = path + ' ' + hash
      if (loc.includes('fundraisers')) {
        setCurrentPage('fundraisers')
      } else if (loc.includes('announcements') || loc.includes('updates')) {
        setCurrentPage('updates')
      } else if (loc.includes('about')) {
        setCurrentPage('about')
      } else if (path === '/' && (hash === '' || hash === '#')) {
        setCurrentPage('home')
      }
    }

    handleLocation()
    window.addEventListener('popstate', handleLocation)
    window.addEventListener('hashchange', handleLocation)
    return () => {
      window.removeEventListener('popstate', handleLocation)
      window.removeEventListener('hashchange', handleLocation)
    }
  }, [])

  const handleNavigate = (page: 'home' | 'fundraisers' | 'updates' | 'about') => {
    setCurrentPage(page)
    const target = page === 'home' ? '/' : `/${page}`
    if (window.location.pathname !== target || window.location.hash !== '') {
      history.pushState(null, '', target)
    }
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <>
      {loading && <TruckLoader onComplete={() => setLoading(false)} duration={2400} />}
      <main
        className="min-h-screen relative flex flex-col justify-between"
        style={{ background: '#714B67', fontFamily: 'var(--font-display)' }}
      >
        <Nav
          currentPage={currentPage}
          onNavigate={handleNavigate}
          onOpenAuth={onOpenAuth}
          currentUser={currentUser}
          onOpenDashboard={onOpenDashboard}
        />

        <div className="flex-1 pt-20">
          {currentPage === 'home' && (
            <>
              <Hero />
              <FeaturesIntro />
              <MoodTrackingCard />
              <GuidedMeditationsCard />
              <AnnouncementsSection />
              <MerchandiseSection />
              <FundraiserSection />
              <TreasurerSection />
            </>
          )}

          {currentPage === 'fundraisers' && <FundraisersPage />}
          {currentPage === 'updates' && <UpdatesPage />}
          {currentPage === 'about' && <AboutPage />}
        </div>

        <Footer />
      </main>
    </>
  )
}
