import { useEffect, useState } from 'react'
import { useSettings, type Settings } from '../systems/SettingsManager'
import { audio } from '../systems/AudioManager'
import type { QualityLevel } from '../config/gameConfig'

function Slider({ label, k, min = 0, max = 1, step = 0.01, format }: { label: string; k: keyof Settings; min?: number; max?: number; step?: number; format?: (v: number) => string }) {
  const value = useSettings((s) => s[k]) as number
  const update = useSettings((s) => s.update)
  return (
    <label className="setting">
      <span className="setting-label">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => update({ [k]: parseFloat(e.target.value) } as Partial<Settings>)} />
      <span className="setting-value">{format ? format(value) : Math.round(((value - min) / (max - min)) * 100)}</span>
    </label>
  )
}

function Toggle({ label, k }: { label: string; k: 'invertY' | 'reduceMotion' }) {
  const value = useSettings((s) => s[k])
  const update = useSettings((s) => s.update)
  return (
    <button className="setting setting-toggle" onClick={() => update({ [k]: !value })} onMouseEnter={hover}>
      <span className="setting-label">{label}</span>
      <span className="setting-value">{value ? 'ON' : 'OFF'}</span>
    </button>
  )
}

function hover() {
  audio.play('ui_hover', { bus: 'ui', volume: 0.35 })
}

export function SettingsMenu({ onBack }: { onBack: () => void }) {
  const quality = useSettings((s) => s.quality)
  const update = useSettings((s) => s.update)
  const [fs, setFs] = useState(!!document.fullscreenElement)
  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])
  const toggleFs = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await document.documentElement.requestFullscreen()
    } catch {
      /* not allowed */
    }
  }
  return (
    <div className="panel settings">
      <h2 className="panel-title">SETTINGS</h2>
      <Slider label="MASTER VOLUME" k="masterVolume" />
      <Slider label="EFFECTS VOLUME" k="sfxVolume" />
      <Slider label="MUSIC VOLUME" k="musicVolume" />
      <Slider label="MOUSE SENSITIVITY" k="mouseSensitivity" min={0.2} max={2.5} step={0.05} format={(v) => v.toFixed(2)} />
      <Slider label="FILM GRAIN" k="filmGrain" />
      <Slider label="BRIGHTNESS" k="brightness" min={-1} max={1} step={0.05} format={(v) => (v > 0 ? '+' : '') + v.toFixed(2)} />
      <div className="setting">
        <span className="setting-label">GRAPHICS QUALITY</span>
        <span className="setting-choices">
          {(['low', 'medium', 'high'] as QualityLevel[]).map((q) => (
            <button key={q} className={q === quality ? 'choice active' : 'choice'} onClick={() => update({ quality: q })} onMouseEnter={hover}>
              {q.toUpperCase()}
            </button>
          ))}
        </span>
      </div>
      <button className="setting setting-toggle" onClick={toggleFs} onMouseEnter={hover}>
        <span className="setting-label">FULLSCREEN</span>
        <span className="setting-value">{fs ? 'ON' : 'OFF'}</span>
      </button>
      <Toggle label="INVERT MOUSE Y" k="invertY" />
      <Toggle label="REDUCE CAMERA MOTION" k="reduceMotion" />
      <button className="menu-item back" onClick={onBack} onMouseEnter={hover}>
        BACK
      </button>
    </div>
  )
}
