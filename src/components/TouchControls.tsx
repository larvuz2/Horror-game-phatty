import { useEffect, useRef, useState } from 'react'
import { input } from '../systems/Input'
import { useGame } from '../systems/GameState'

const JOY_RADIUS = 56

// Mobile controls: a floating joystick on the left half, drag-to-look on the right half,
// and buttons for interacting (hold on the breaker), the flashlight and pausing.
export function TouchControls({ onPause }: { onPause: () => void }) {
  const joyId = useRef<number | null>(null)
  const joyOrigin = useRef({ x: 0, y: 0 })
  const lookId = useRef<number | null>(null)
  const lookLast = useRef({ x: 0, y: 0 })
  const [joy, setJoy] = useState<{ x: number; y: number; kx: number; ky: number } | null>(null)
  const [usedJoy, setUsedJoy] = useState(false)
  const hasFlashlight = useGame((s) => s.hasFlashlight)
  const prompt = useGame((s) => s.prompt)
  const phase = useGame((s) => s.phase)

  useEffect(
    () => () => {
      input.setTouchMove(0, 0)
      input.simulateUp('KeyE')
    },
    [],
  )

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') return
    const left = e.clientX < window.innerWidth * 0.45
    if (left && joyId.current === null) {
      joyId.current = e.pointerId
      joyOrigin.current = { x: e.clientX, y: e.clientY }
      setJoy({ x: e.clientX, y: e.clientY, kx: 0, ky: 0 })
      setUsedJoy(true)
    } else if (!left && lookId.current === null) {
      lookId.current = e.pointerId
      lookLast.current = { x: e.clientX, y: e.clientY }
    } else return
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId === joyId.current) {
      let dx = e.clientX - joyOrigin.current.x
      let dy = e.clientY - joyOrigin.current.y
      const len = Math.hypot(dx, dy)
      if (len > JOY_RADIUS) {
        dx = (dx / len) * JOY_RADIUS
        dy = (dy / len) * JOY_RADIUS
      }
      // Small dead zone, then full speed toward the edge.
      const nx = dx / JOY_RADIUS, ny = dy / JOY_RADIUS
      const m = Math.hypot(nx, ny)
      const k = m < 0.15 ? 0 : (m - 0.15) / 0.85 / Math.max(m, 1e-4)
      input.setTouchMove(nx * k, ny * k)
      setJoy({ x: joyOrigin.current.x, y: joyOrigin.current.y, kx: dx, ky: dy })
    } else if (e.pointerId === lookId.current) {
      input.addTouchLook(e.clientX - lookLast.current.x, e.clientY - lookLast.current.y)
      lookLast.current = { x: e.clientX, y: e.clientY }
    }
  }
  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId === joyId.current) {
      joyId.current = null
      input.setTouchMove(0, 0)
      setJoy(null)
    } else if (e.pointerId === lookId.current) {
      lookId.current = null
    }
  }

  const press = (code: string) => (e: React.PointerEvent) => {
    e.stopPropagation()
    e.preventDefault()
    input.simulateDown(code)
  }
  const release = (code: string) => (e: React.PointerEvent) => {
    e.stopPropagation()
    input.simulateUp(code)
  }

  const canInteract = !!prompt && prompt !== 'TOO DARK TO SEE'
  return (
    <div className="touch-layer" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
      {joy && (
        <div className="joy" style={{ left: joy.x, top: joy.y }}>
          <div className="joy-knob" style={{ transform: `translate(${joy.kx}px, ${joy.ky}px)` }} />
        </div>
      )}
      {!usedJoy && phase === 'PLAYING' && <div className="touch-hint">LEFT: MOVE · RIGHT: LOOK</div>}
      <button className="touch-btn touch-pause" onPointerDown={(e) => e.stopPropagation()} onClick={onPause} aria-label="Pause">
        II
      </button>
      <button
        className={`touch-btn touch-interact${canInteract ? ' ready' : ''}`}
        onPointerDown={press('KeyE')}
        onPointerUp={release('KeyE')}
        onPointerCancel={release('KeyE')}
        onPointerLeave={release('KeyE')}
        aria-label="Interact"
      >
        E
      </button>
      {hasFlashlight && (
        <button className="touch-btn touch-flash" onPointerDown={press('KeyF')} onPointerUp={release('KeyF')} onPointerCancel={release('KeyF')} aria-label="Flashlight">
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <path d="M7 3h10l-2 6v12H9V9z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M10 13h4" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      )}
    </div>
  )
}
