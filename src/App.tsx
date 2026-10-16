import { useCallback, useEffect, useRef, useState } from 'react'
import { useProgress } from '@react-three/drei'
import { GameCanvas } from './components/GameCanvas'
import { MainMenu } from './components/MainMenu'
import { Hud } from './components/Hud'
import { DeathScreen, VictoryScreen, PauseMenu } from './components/EndScreens'
import { SettingsMenu } from './components/SettingsMenu'
import { Logo } from './components/Logo'
import { useGame } from './systems/GameState'
import { useSettings } from './systems/SettingsManager'
import { audio, type Voice } from './systems/AudioManager'
import { installInput, input } from './systems/Input'
import { preloadTextures } from './scene/materials'
import { fader } from './systems/fader'
import { startRun } from './systems/Director'

function lockPointer() {
  const el = document.querySelector('canvas') ?? document.body
  try {
    const r = (el.requestPointerLock as (o?: unknown) => Promise<void> | void).call(el, { unadjustedMovement: true })
    if (r && typeof r.catch === 'function') {
      r.catch(() => {
        try {
          const r2 = el.requestPointerLock() as unknown as Promise<void> | void
          if (r2 && typeof r2.catch === 'function') r2.catch(() => {})
        } catch {
          /* unsupported */
        }
      })
    }
  } catch {
    /* pointer lock unavailable (e.g. automation) */
  }
}

const isTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches && !window.matchMedia?.('(pointer: fine)').matches

export default function App() {
  const phase = useGame((s) => s.phase)
  const [texturesReady, setTexturesReady] = useState(false)
  const [texP, setTexP] = useState(0)
  const [audioP, setAudioP] = useState(0)
  const { progress: modelP } = useProgress()
  const [unlocked, setUnlocked] = useState(false)
  const [locked, setLocked] = useState(false)
  const [pauseSettings, setPauseSettings] = useState(false)
  const menuMusic = useRef<Voice | null>(null)

  useEffect(() => {
    installInput()
    preloadTextures(setTexP).then(() => setTexturesReady(true))
    audio.loadAll(setAudioP)
    const s = useSettings.getState()
    audio.setVolumes(s.masterVolume, s.sfxVolume, s.musicVolume)
    return useSettings.subscribe((st) => audio.setVolumes(st.masterVolume, st.sfxVolume, st.musicVolume))
  }, [])

  // Pointer lock <-> pause.
  useEffect(() => {
    const onChange = () => {
      const isLocked = document.pointerLockElement != null
      setLocked(isLocked)
      if (!isLocked) {
        const g = useGame.getState()
        if (g.phase === 'PLAYING' || g.phase === 'INTRO') g.transition('PAUSED')
        input.clear()
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return
      const g = useGame.getState()
      if (g.phase !== 'PLAYING' && g.phase !== 'INTRO') return
      // Browsers usually release the lock themselves on Esc (which fires pointerlockchange -> pause).
      if (document.pointerLockElement) document.exitPointerLock()
      else g.transition('PAUSED')
    }
    const onCanvasClick = (e: MouseEvent) => {
      const g = useGame.getState()
      if ((e.target as HTMLElement)?.tagName === 'CANVAS' && g.phase === 'PLAYING' && !document.pointerLockElement) lockPointer()
    }
    const onVisibility = () => {
      const g = useGame.getState()
      if (document.hidden && (g.phase === 'PLAYING' || g.phase === 'INTRO')) g.transition('PAUSED')
    }
    document.addEventListener('pointerlockchange', onChange)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('keydown', onKey)
    window.addEventListener('mousedown', onCanvasClick)
    return () => {
      document.removeEventListener('pointerlockchange', onChange)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('mousedown', onCanvasClick)
    }
  }, [])

  // Phase-level audio and cursor management.
  useEffect(() => {
    audio.setWorldLevel(phase === 'PAUSED' ? 0.12 : 1, 0.25)
    if ((phase === 'DEATH_SCREEN' || phase === 'VICTORY_SCREEN' || phase === 'MAIN_MENU') && document.pointerLockElement) document.exitPointerLock()
    if (phase === 'MAIN_MENU' && unlocked) {
      if (!menuMusic.current) menuMusic.current = audio.play('menu_theme', { bus: 'music', loop: true, volume: 0.85, fadeIn: 3 })
    } else if (phase !== 'MAIN_MENU' && phase !== 'DEATH_SCREEN' && menuMusic.current) {
      menuMusic.current.stop(1.5)
      menuMusic.current = null
    }
    if (phase === 'DEATH_SCREEN') {
      fader.set(0)
      const t = window.setTimeout(() => {
        if (useGame.getState().phase === 'DEATH_SCREEN' && !menuMusic.current) menuMusic.current = audio.play('menu_theme', { bus: 'music', loop: true, volume: 0.6, fadeIn: 6 })
      }, 2500)
      return () => window.clearTimeout(t)
    }
    if (phase === 'MAIN_MENU') fader.set(1)
  }, [phase, unlocked])

  const unlock = useCallback(async () => {
    audio.init()
    setUnlocked(true)
    await audio.decodeAll()
    useGame.getState().set({ audioReady: true })
    audio.play('ui_select', { bus: 'ui', volume: 0.4 })
  }, [])

  const begin = useCallback(() => {
    audio.init()
    void audio.decodeAll()
    audio.stopAll(0.8)
    audio.play('ui_select', { bus: 'ui', volume: 0.55 })
    lockPointer()
    menuMusic.current?.stop(1.2)
    menuMusic.current = null
    setPauseSettings(false)
    startRun()
  }, [])

  const toMenu = useCallback(() => {
    audio.stopAll(0.6)
    menuMusic.current = null
    setPauseSettings(false)
    useGame.setState({ phase: 'MAIN_MENU', pausedFrom: null, menuPanel: 'main', prompt: null, messages: [] })
  }, [])

  const resume = useCallback(() => {
    audio.play('ui_select', { bus: 'ui', volume: 0.4 })
    lockPointer()
    const g = useGame.getState()
    g.transition(g.pausedFrom ?? 'PLAYING')
    setPauseSettings(false)
  }, [])

  const loading = (texP + audioP + modelP / 100) / 3

  return (
    <div className="app">
      <GameCanvas texturesReady={texturesReady} />
      <div className="fader" ref={(e) => fader.attach(e)} />
      {!unlocked ? (
        <button className="screen splash" onClick={unlock}>
          <Logo size="small" />
          <span className="splash-cta">CLICK TO ENTER</span>
          <span className="splash-note">
            {isTouch ? 'Made for desktop: mouse & keyboard required.' : 'Best with headphones, lights off.'}
          </span>
        </button>
      ) : (
        <>
          {phase === 'MAIN_MENU' && <MainMenu onStart={begin} loading={loading} />}
          {(phase === 'INTRO' || phase === 'PLAYING' || phase === 'VICTORY_CINEMATIC') && <Hud locked={locked} />}
          {phase === 'PAUSED' &&
            (pauseSettings ? (
              <div className="screen pause">
                <SettingsMenu onBack={() => setPauseSettings(false)} />
              </div>
            ) : (
              <PauseMenu onResume={resume} onRestart={begin} onMenu={toMenu} onSettings={() => setPauseSettings(true)} />
            ))}
          {phase === 'DEATH_SCREEN' && <DeathScreen onRetry={begin} onMenu={toMenu} />}
          {phase === 'VICTORY_SCREEN' && <VictoryScreen onRetry={begin} onMenu={toMenu} />}
        </>
      )}
    </div>
  )
}
