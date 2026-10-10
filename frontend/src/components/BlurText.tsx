import { useEffect, useRef, useState, useMemo } from 'react'
import { motion } from 'motion/react'

type BlurTextProps = {
  text: string
  delay?: number // ms per-word stagger
  animateBy?: 'words' | 'chars'
  direction?: 'top' | 'bottom'
  threshold?: number
  rootMargin?: string
  stepDuration?: number
  easing?: (t: number) => number
  as?: keyof React.JSX.IntrinsicElements
  animationFrom?: Record<string, number | string>
  animationTo?: Array<Record<string, number | string>>
  className?: string
  style?: React.CSSProperties
}

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3)

export default function BlurText({
  text,
  delay = 200,
  animateBy = 'words',
  direction = 'top',
  threshold = 0.1,
  rootMargin = '0px',
  stepDuration = 0.35,
  easing = easeOutCubic,
  as = 'p',
  animationFrom,
  animationTo,
  className = '',
  style = {},
}: BlurTextProps) {
  const elements = useMemo(() => {
    if (animateBy === 'chars') return text.split('')
    return text.split(' ')
  }, [text, animateBy])

  const ref = useRef<HTMLElement>(null)
  const [inView, setInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true)
          if (el) observer.unobserve(el)
        }
      },
      { threshold, rootMargin },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin])

  // default "from" based on direction
  const defaultFrom: Record<string, number | string> =
    direction === 'bottom'
      ? { filter: 'blur(10px)', opacity: 0, y: 50 }
      : { filter: 'blur(10px)', opacity: 0, y: -50 }

  const from: Record<string, number | string> = animationFrom ?? defaultFrom

  // default step keyframes
  const defaultTo: Array<Record<string, number | string>> =
    direction === 'top'
      ? [
          { filter: 'blur(5px)', opacity: 0.5, y: 5 },
          { filter: 'blur(0px)', opacity: 1, y: 0 },
        ]
      : [
          { filter: 'blur(5px)', opacity: 0.5, y: -5 },
          { filter: 'blur(0px)', opacity: 1, y: 0 },
        ]

  const steps: Array<Record<string, number | string>> = animationTo ?? defaultTo

  // Build combined keyframe arrays per property: [from, ...steps]
  const allSteps: Array<Record<string, number | string>> = [from, ...steps]
  const times = allSteps.map((_, i) => (i === 0 ? 0 : i / (allSteps.length - 1)))

  // Per-property keyframes
  const keyframes: Record<string, Array<number | string>> = {}
  for (const key of Object.keys(from)) {
    keyframes[key] = allSteps.map((s) => s[key])
  }

  const totalDuration = stepDuration * steps.length

  const MotionTag = motion[as as 'p'] ?? motion.p

  return (
    <MotionTag
      ref={ref as any}
      className={className}
      style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', ...style }}
    >
      {elements.map((segment, index) => (
        <motion.span
          key={index}
          initial={from}
          animate={
            inView
              ? keyframes
              : from
          }
          transition={{
            duration: totalDuration,
            delay: (index * delay) / 1000,
            ease: easing,
            times,
          }}
          style={{
            display: 'inline-block',
            willChange: 'transform, filter, opacity',
            whiteSpace: 'pre',
          }}
        >
          {segment}
          {animateBy === 'words' && index < elements.length - 1 ? ' ' : ''}
        </motion.span>
      ))}
    </MotionTag>
  )
}
