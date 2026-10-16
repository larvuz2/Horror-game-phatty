import { useEffect, useState } from 'react'
import { Logo } from './Logo'
import { audio } from '../systems/AudioManager'
import { runtime } from '../systems/runtime'

const hover = () => audio.play('ui_hover', { bus: 'ui', volume: 0.35 })

export function DeathScreen({ onRetry, onMenu }: { onRetry: () => void; onMenu: () => void }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const a = window.setTimeout(() => setStep(1), 700)
    const b = window.setTimeout(() => setStep(2), 1800)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
  }, [])
  return (
    <div className="screen end death">
      <div className={`end-title ${step >= 0 ? 'in' : ''}`}>
        <Logo size="small" />
      </div>
      <p className={`end-sub died ${step >= 1 ? 'in' : ''}`}>YOU DIED</p>
      <nav className={`end-actions ${step >= 2 ? 'in' : ''}`}>
        <button className="menu-item" onClick={onRetry} onMouseEnter={hover} disabled={step < 2}>
          TRY AGAIN
        </button>
        <button className="menu-item minor" onClick={onMenu} onMouseEnter={hover} disabled={step < 2}>
          MAIN MENU
        </button>
      </nav>
    </div>
  )
}

export function VictoryScreen({ onRetry, onMenu }: { onRetry: () => void; onMenu: () => void }) {
  const [step, setStep] = useState(0)
  const time = runtime.time
  useEffect(() => {
    const a = window.setTimeout(() => setStep(1), 900)
    const b = window.setTimeout(() => setStep(2), 2200)
    return () => {
      window.clearTimeout(a)
      window.clearTimeout(b)
    }
  }, [])
  const mm = Math.floor(time / 60)
  const ss = Math.floor(time % 60).toString().padStart(2, '0')
  return (
    <div className="screen end victory">
      <p className={`end-sub survived ${step >= 0 ? 'in' : ''}`}>YOU SURVIVED</p>
      <div className={`end-title ${step >= 1 ? 'in' : ''}`}>
        <Logo size="small" />
        <p className="end-time">
          {mm}:{ss} IN THE DARK
        </p>
      </div>
      <nav className={`end-actions ${step >= 2 ? 'in' : ''}`}>
        <button className="menu-item" onClick={onRetry} onMouseEnter={hover} disabled={step < 2}>
          PLAY AGAIN
        </button>
        <button className="menu-item minor" onClick={onMenu} onMouseEnter={hover} disabled={step < 2}>
          MAIN MENU
        </button>
      </nav>
    </div>
  )
}

export function PauseMenu({ onResume, onRestart, onMenu, onSettings }: { onResume: () => void; onRestart: () => void; onMenu: () => void; onSettings: () => void }) {
  return (
    <div className="screen pause">
      <h2 className="panel-title">PAUSED</h2>
      <nav className="menu-items">
        <button className="menu-item" onClick={onResume} onMouseEnter={hover}>
          RESUME
        </button>
        <button className="menu-item" onClick={onSettings} onMouseEnter={hover}>
          SETTINGS
        </button>
        <button className="menu-item" onClick={onRestart} onMouseEnter={hover}>
          RESTART
        </button>
        <button className="menu-item minor" onClick={onMenu} onMouseEnter={hover}>
          QUIT TO MENU
        </button>
      </nav>
    </div>
  )
}
