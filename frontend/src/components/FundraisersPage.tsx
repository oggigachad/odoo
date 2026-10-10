import { useEffect, useState } from 'react'
import { api } from '../apiClient'
import { motion, AnimatePresence } from 'motion/react'
import BlurText from './BlurText'

const EASE = [0.22, 1, 0.36, 1] as const

interface CarouselSlide {
  id: number
  title: string
  category: string
  raised: string
  goal: string
  progress: number
  tasksDone: number
  tasksTotal: number
  daysLeft: number | null
  description: string
}

const rupee = (v: string | number | null | undefined) => '₹' + Math.round(Number(v ?? 0)).toLocaleString('en-IN')

const imgCard5 = '/5.png'

export default function FundraisersPage() {
  const [slides, setSlides] = useState<CarouselSlide[]>([])
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    api<any[]>('/fundraisers')
      .then(async list => {
        const full = await Promise.all(list.map(async f => {
          const pr = await api<any>(`/fundraisers/${f.fundraiser_id}/progress`).catch(() => null)
          const goal = Number(f.goal_amount ?? 0)
          const raised = Number(pr?.amount_raised ?? 0)
          const days = f.event_date ? Math.max(0, Math.ceil((new Date(f.event_date).getTime() - Date.now()) / 864e5)) : null
          return {
            id: f.fundraiser_id, title: f.title, category: 'Fundraiser', raised: rupee(raised),
            goal: goal ? rupee(goal) : 'no fixed goal', progress: goal ? Math.min(100, Math.round(raised / goal * 100)) : 0,
            tasksDone: pr?.tasks_done ?? 0, tasksTotal: pr?.tasks_total ?? 0, daysLeft: days,
            description: f.description ?? '',
          } as CarouselSlide
        }))
        setSlides(full)
      })
      .catch(() => setSlides([]))
      .finally(() => setLoaded(true))
  }, [])
  const [currentSlide, setCurrentSlide] = useState(0)

  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % Math.max(1, slides.length))
  const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + slides.length) % Math.max(1, slides.length))

  const active = slides[currentSlide]
  const empty = !active

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
          <img src={imgCard5} alt="Fundraisers" className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-xl" />
        </motion.div>

        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: EASE }}
          className="text-white/70 text-xs sm:text-sm font-semibold tracking-widest uppercase mb-3"
        >
          Community Drives & Backing
        </motion.p>
        <h1
          className="text-white text-4xl sm:text-6xl md:text-7xl font-bold tracking-tight mb-6"
          style={{ letterSpacing: '-0.04em' }}
        >
          <BlurText text="Fundraisers" delay={140} direction="bottom" stepDuration={0.5} />
        </h1>
        <motion.p
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
          className="text-white/80 text-base sm:text-lg leading-relaxed font-normal"
        >
          Track club funding targets, rally community contributors, and manage financial milestones in full daylight.
        </motion.p>
      </div>

      {empty && (
        <p className="text-center text-white/80 text-lg">{loaded ? 'No fundraisers are running right now. New campaigns will show up here the moment they launch.' : 'Loading fundraisers...'}</p>
      )}
      {/* Main Interactive Carousel Card */}
      {!empty && (<div className="relative max-w-4xl mx-auto w-full">
        <div className="rounded-[28px] bg-white text-[#212529] p-6 sm:p-10 md:p-12 shadow-[0_24px_60px_rgba(0,0,0,0.35)] relative overflow-hidden">
          {/* Category Pill + Counter */}
          <div className="flex items-center justify-between mb-6 pb-4 border-b border-[#E8E0E8]">
            <span className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-[#F7F3F8] text-[#714B67]">
              {active.category}
            </span>
            <span className="text-xs font-semibold text-[#714B67]/70 tracking-widest uppercase">
              {currentSlide + 1} / {slides.length}
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
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold text-[#212529] mb-4 tracking-tight">
                {active.title}
              </h2>
              <p className="text-sm sm:text-base text-[#52525B] leading-relaxed mb-8 max-w-2xl font-normal">
                {active.description}
              </p>

              {/* Progress Bar & Financials */}
              <div className="bg-[#FAF7FA] p-5 sm:p-6 rounded-2xl mb-8 border border-[#EDE5ED]">
                <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                  <div>
                    <span className="text-2xl sm:text-3xl font-extrabold text-[#714B67]">{active.raised}</span>
                    <span className="text-xs sm:text-sm text-[#714B67]/70 font-medium ml-2">raised of {active.goal}</span>
                  </div>
                  <span className="text-sm font-bold text-[#714B67]">{active.progress}% Goal</span>
                </div>

                <div className="w-full h-3 bg-[#E8E0E8] rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-[#714B67] rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${active.progress}%` }}
                    transition={{ duration: 0.8, ease: EASE }}
                  />
                </div>

                <div className="flex items-center justify-between mt-4 text-xs font-semibold text-[#714B67]/80 uppercase tracking-wider">
                  <span>{active.tasksDone} of {active.tasksTotal} tasks done</span>
                  <span>{active.daysLeft === null ? 'Ongoing' : `${active.daysLeft} days to go`}</span>
                </div>
              </div>

            </motion.div>
          </AnimatePresence>

          {/* Carousel Controls */}
          <div className="flex items-center justify-between mt-8 pt-6 border-t border-[#E8E0E8]">
            <div className="flex gap-2">
              {slides.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentSlide(i)}
                  className={`h-2.5 rounded-full transition-all duration-300 ${
                    currentSlide === i ? 'w-8 bg-[#714B67]' : 'w-2.5 bg-[#D4C4CE] hover:bg-[#B5A4B0]'
                  }`}
                  aria-label={`Go to slide ${i + 1}`}
                />
              ))}
            </div>

            <div className="flex gap-2">
              <button
                onClick={prevSlide}
                className="w-10 h-10 rounded-xl bg-[#FAF7FA] hover:bg-[#F0EBF0] text-[#714B67] flex items-center justify-center font-bold active:scale-95 transition-all border border-[#EDE5ED]"
                aria-label="Previous slide"
              >
                ←
              </button>
              <button
                onClick={nextSlide}
                className="w-10 h-10 rounded-xl bg-[#714B67] hover:bg-[#5C3D54] text-white flex items-center justify-center font-bold active:scale-95 transition-all shadow-md"
                aria-label="Next slide"
              >
                →
              </button>
            </div>
          </div>
        </div>
      </div>)}
    </div>
  )
}
