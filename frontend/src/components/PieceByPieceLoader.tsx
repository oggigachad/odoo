import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { motion, AnimatePresence } from 'motion/react'

export type ImageItem = {
  src: string
  alt?: string
}

export type PieceByPieceLoaderProps = {
  images?: ImageItem[]
  image?: string
  alt?: string
  columns?: number
  rows?: number
  tileDelay?: number
  transitionDuration?: number
  holdDuration?: number
  fadeOutDuration?: number
  dividerColor?: string
  dividerWidth?: number
  cornerRadius?: number
  maxWidth?: number
  backgroundColor?: string
  textureEnabled?: boolean
  paperTextureIntensity?: number
  grainIntensity?: number
  tileTilt?: number
  tileTiltDuration?: number
  tileOverlap?: number
  stopMotionSteps?: number
  collageScatter?: number
  fit?: 'cover' | 'contain'
  objectPosition?: string
  onComplete?: () => void
}

/**
 * ImagePuzzle / PieceByPiece Loader
 * Direct implementation of Framer's ImagePuzzle component with motion/react,
 * featuring paper texture overlays, fractal grain, stop-motion keyframes,
 * and seamless completion hooks for loading screens.
 */
export default function PieceByPieceLoader({
  images,
  image,
  alt = 'Odoo Skyline',
  columns = 5,
  rows = 3,
  tileDelay = 0.08,
  transitionDuration = 0.42,
  holdDuration = 0.7,
  fadeOutDuration = 0.65,
  dividerColor = 'rgba(255, 255, 255, 0.12)',
  dividerWidth = 1.5,
  cornerRadius = 20,
  maxWidth = 520,
  backgroundColor = '#714B67',
  textureEnabled = true,
  paperTextureIntensity = 0.5,
  grainIntensity = 0.35,
  tileTilt = 2,
  tileTiltDuration = 0.45,
  tileOverlap = 6,
  stopMotionSteps = 4,
  collageScatter = 0.35,
  fit = 'contain',
  objectPosition = 'center center',
  onComplete,
}: PieceByPieceLoaderProps) {
  const safeImages: ImageItem[] = useMemo(() => {
    if (images && images.length > 0) return images
    if (image) return [{ src: image, alt }]
    return [
      {
        src: '/campus-islands.png',
        alt: 'Dreamy Sunset Campus Islands',
      },
    ]
  }, [images, image, alt])

  const safeColumns = Math.max(1, Math.floor(columns))
  const safeRows = Math.max(1, Math.floor(rows))
  const tileCount = safeColumns * safeRows

  const safePaperTextureIntensity = Math.max(0, Math.min(paperTextureIntensity, 1))
  const safeGrainIntensity = Math.max(0, Math.min(grainIntensity, 1))
  const safeTileTilt = Math.max(0, Math.min(tileTilt, 12))
  const safeTileTiltDuration = Math.max(0.05, tileTiltDuration || transitionDuration)
  const safeTileOverlap = Math.max(0, Math.min(tileOverlap, 24))
  const safeStopMotionSteps = Math.max(3, Math.min(8, Math.round(stopMotionSteps)))
  const safeCollageScatter = Math.max(0, Math.min(collageScatter, 1))

  const stopMotionTimes = useMemo(() => {
    const hold = Math.max(0.58, Math.min(0.86, (safeStopMotionSteps - 1) / safeStopMotionSteps))
    const snap = Math.min(0.95, hold + 0.06)
    return [0, hold, snap, 1]
  }, [safeStopMotionSteps])

  const makeInitialTiles = useCallback(
    (count: number) =>
      Array.from({ length: count }, () => ({
        currentImage: -1,
        previousImage: null as number | null,
      })),
    [],
  )

  const [tiles, setTiles] = useState(() => makeInitialTiles(tileCount))
  const [activeImage, setActiveImage] = useState(0)
  const [nextTile, setNextTile] = useState(0)
  const [phase, setPhase] = useState<'assembling' | 'holding' | 'fading' | 'done'>('assembling')
  const completedRef = useRef(false)

  // Preload images
  useEffect(() => {
    safeImages.forEach((item) => {
      if (!item?.src) return
      const preload = new Image()
      preload.src = item.src
      if (typeof preload.decode === 'function') {
        preload.decode().catch(() => undefined)
      }
    })
  }, [safeImages])

  // Advance tiles sequentially
  useEffect(() => {
    if (phase !== 'assembling') return

    const interval = window.setInterval(() => {
      setTiles((prev) => {
        const next = [...prev]
        const currentTile = next[nextTile]
        if (!currentTile) return prev
        next[nextTile] = {
          currentImage: activeImage,
          previousImage: currentTile.currentImage >= 0 ? currentTile.currentImage : null,
        }
        return next
      })

      const isEndOfPass = nextTile >= tileCount - 1
      if (!isEndOfPass) {
        setNextTile((v) => v + 1)
      } else {
        // Finished assembling this pass
        window.clearInterval(interval)
        setPhase('holding')
      }
    }, Math.max(35, tileDelay * 1000))

    return () => window.clearInterval(interval)
  }, [phase, nextTile, tileCount, activeImage, tileDelay])

  // Holding -> Fading out
  useEffect(() => {
    if (phase !== 'holding') return
    const t = window.setTimeout(() => {
      setPhase('fading')
    }, holdDuration * 1000)
    return () => window.clearTimeout(t)
  }, [phase, holdDuration])

  // Fading -> Done & onComplete callback
  useEffect(() => {
    if (phase !== 'fading') return
    const t = window.setTimeout(() => {
      setPhase('done')
      if (!completedRef.current) {
        completedRef.current = true
        onComplete?.()
      }
    }, fadeOutDuration * 1000)
    return () => window.clearTimeout(t)
  }, [phase, fadeOutDuration, onComplete])

  // Render tile layer
  const renderImageLayer = useCallback(
    (imageIndex: number, tileIndex: number, layerKey: string, layerType: 'current' | 'previous') => {
      if (imageIndex < 0 || imageIndex >= safeImages.length) return null
      const img = safeImages[imageIndex]
      const col = tileIndex % safeColumns
      const row = Math.floor(tileIndex/ safeColumns)
      const isFirstCol = col === 0
      const isLastCol = col === safeColumns - 1
      const isFirstRow = row === 0
      const isLastRow = row === safeRows - 1

      const tiltDirection = tileIndex % 2 === 0 ? 1 : -1
      const tiltVariance = 0.65 + (tileIndex % 5) * 0.08
      const initialRotate = layerType === 'current' ? safeTileTilt * tiltDirection * tiltVariance : 0

      const baseDirX = (tileIndex % 3) - 1
      const baseDirY = ((Math.floor(tileIndex / 2) % 3) - 1) * 0.75
      const dirX = isFirstCol ? 1 : isLastCol ? -1 : baseDirX === 0 ? tiltDirection : baseDirX
      const dirY = isFirstRow ? 1 : isLastRow ? -1 : baseDirY === 0 ? -tiltDirection * 0.6 : baseDirY

      const overlapX = layerType === 'current' ? dirX * safeTileOverlap : 0
      const overlapY = layerType === 'current' ? dirY * safeTileOverlap * 0.65 : 0
      const transformDuration = Math.max(safeTileTiltDuration, transitionDuration * 0.9)
      const startScale = layerType === 'current' ? 1.018 : 1

      const settledX = overlapX * 0.26 * safeCollageScatter
      const settledY = overlapY * 0.24 * safeCollageScatter
      const settledRotate = initialRotate * 0.3 * safeCollageScatter
      const settledScale = 1 + 0.008 * safeCollageScatter

      const transformXKeyframes =
        layerType === 'current' ? [overlapX, overlapX, settledX, settledX] : [0, 0, 0, 0]
      const transformYKeyframes =
        layerType === 'current' ? [overlapY, overlapY, settledY, settledY] : [0, 0, 0, 0]
      const transformRotateKeyframes =
        layerType === 'current'
          ? [initialRotate, initialRotate, settledRotate, settledRotate]
          : [0, 0, 0, 0]
      const transformScaleKeyframes =
        layerType === 'current' ? [startScale, startScale, settledScale, settledScale] : [1, 1, 1, 1]

      const cutStart = stopMotionTimes[1]
      const cutEnd = Math.min(0.999, cutStart + 0.001)
      const opacityCutTimes = [0, cutStart, cutEnd, 1]

      return (
        <motion.div
          key={layerKey}
          initial={{
            x: transformXKeyframes[0],
            y: transformYKeyframes[0],
            rotate: transformRotateKeyframes[0],
            scale: startScale,
          }}
          animate={{
            x: transformXKeyframes,
            y: transformYKeyframes,
            rotate: transformRotateKeyframes,
            scale: transformScaleKeyframes,
          }}
          transition={{ duration: transformDuration, ease: 'linear', times: stopMotionTimes }}
          style={{
            position: 'absolute',
            inset: 0,
            transformOrigin: '50% 50%',
            pointerEvents: 'none',
            zIndex: 3 + (tileIndex % 3),
            overflow: 'visible',
          }}
        >
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
            <motion.img
              src={img.src}
              alt={img.alt || ''}
              initial={{ opacity: 0, scale: 1.02, x: 2, y: 2 }}
              animate={{
                opacity: [0, 0, 1, 1],
                scale: [1.02, 1.02, 1.005, 1],
                x: [2, 2, 0.4, 0],
                y: [2, 2, 0.35, 0],
              }}
              transition={{
                opacity: { duration: transitionDuration, ease: 'linear', times: opacityCutTimes },
                scale: { duration: transitionDuration, ease: 'linear', times: stopMotionTimes },
                x: { duration: transitionDuration, ease: 'linear', times: stopMotionTimes },
                y: { duration: transitionDuration, ease: 'linear', times: stopMotionTimes },
              }}
              style={{
                position: 'absolute',
                width: `${safeColumns * 100}%`,
                height: `${safeRows * 100}%`,
                left: `${-col * 100}%`,
                top: `${-row * 100}%`,
                objectFit: fit,
                objectPosition,
                backfaceVisibility: 'hidden',
                userSelect: 'none',
                pointerEvents: 'none',
              }}
            />
          </div>
        </motion.div>
      )
    },
    [
      fit,
      objectPosition,
      safeColumns,
      safeImages,
      safeRows,
      safeTileTilt,
      safeTileTiltDuration,
      safeTileOverlap,
      safeCollageScatter,
      stopMotionTimes,
      transitionDuration,
    ],
  )

  // Paper crumple folds
  const crumpleSeed = useMemo(() => `${safeColumns}-${safeRows}`, [safeColumns, safeRows])
  const crumpleFolds = useMemo(() => {
    let h = 0
    for (let i = 0; i < crumpleSeed.length; i++) h = (h * 31 + crumpleSeed.charCodeAt(i)) >>> 0
    const rand = () => {
      h = (h * 1103515245 + 12345) & 2147483647
      return h / 2147483647
    }
    return Array.from({ length: 6 }, () => ({
      angle: Math.round(rand() * 360),
      x: Math.round(20 + rand() * 60),
      y: Math.round(20 + rand() * 60),
      size: Math.round(70 + rand() * 90),
    }))
  }, [crumpleSeed])

  if (phase === 'done') return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        animate={{ opacity: phase === 'fading' ? 0 : 1 }}
        transition={{ duration: fadeOutDuration, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          background: backgroundColor,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '28px',
          padding: '24px',
        }}
      >
        {/* Puzzle Card Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{
            position: 'relative',
            width: '100%',
            maxWidth,
            aspectRatio: `${safeColumns} / ${safeRows}`,
            borderRadius: cornerRadius,
            overflow: 'hidden',
            display: 'grid',
            gridTemplateColumns: `repeat(${safeColumns}, 1fr)`,
            gridTemplateRows: `repeat(${safeRows}, 1fr)`,
            gap: dividerWidth,
            backgroundColor: dividerColor,
            boxShadow: '0 24px 60px -12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.1)',
            boxSizing: 'border-box',
          }}
        >
          {tiles.map((tile, index) => (
            <div
              key={index}
              style={{
                position: 'relative',
                overflow: 'visible',
                backgroundColor: 'rgba(255, 255, 255, 0.05)',
                transform: 'translateZ(0)',
                zIndex: 1,
              }}
            >
              <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
                {tile.previousImage !== null &&
                  tile.previousImage !== tile.currentImage &&
                  renderImageLayer(tile.previousImage, index, `prev-${index}-${tile.previousImage}`, 'previous')}
              </div>
              {tile.currentImage >= 0 &&
                renderImageLayer(tile.currentImage, index, `cur-${index}-${tile.currentImage}`, 'current')}
            </div>
          ))}

          {/* Framer Paper / Grain Texture Overlay */}
          {textureEnabled && (
            <>
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  zIndex: 5,
                  mixBlendMode: 'soft-light',
                  opacity: 0.55 + safePaperTextureIntensity * 0.45,
                  backgroundImage: crumpleFolds
                    .map((f, i) => {
                      const light = i % 2 === 0
                      const color = light
                        ? `rgba(255,255,255,${0.16 + safePaperTextureIntensity * 0.14})`
                        : `rgba(60,50,40,${0.1 + safePaperTextureIntensity * 0.12})`
                      return `linear-gradient(${f.angle}deg, transparent 0%, ${color} 45%, transparent 90%)`
                    })
                    .join(', '),
                  backgroundSize: crumpleFolds.map((f) => `${f.size}% ${f.size}%`).join(', '),
                  backgroundPosition: crumpleFolds.map((f) => `${f.x}% ${f.y}%`).join(', '),
                  backgroundRepeat: 'no-repeat',
                }}
              />
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  inset: 0,
                  pointerEvents: 'none',
                  zIndex: 5,
                  mixBlendMode: 'overlay',
                  opacity: 0.35 + safeGrainIntensity * 0.55,
                  backgroundImage:
                    'url("data:image/svg+xml;utf8,' +
                    encodeURIComponent(`
                      <svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'>
                        <filter id='n'>
                          <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch' result='t'/>
                          <feColorMatrix in='t' type='matrix' values='0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.9 0'/>
                        </filter>
                        <rect width='100%' height='100%' filter='url(#n)'/>
                      </svg>
                    `) +
                    '")',
                  backgroundSize: '180px 180px',
                  backgroundRepeat: 'repeat',
                }}
              />
            </>
          )}
        </motion.div>

        {/* Loading Subtitle */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="flex items-center gap-2.5 text-white/70"
          style={{
            fontFamily: 'var(--font-inter), sans-serif',
            fontSize: '12px',
            fontWeight: 600,
            letterSpacing: '0.22em',
            textTransform: 'uppercase',
          }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span>Loading Skyline</span>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
