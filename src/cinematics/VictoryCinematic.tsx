import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { FIXTURES } from '../config/layout'
import { runtime, SIM } from '../systems/runtime'
import { useGame } from '../systems/GameState'
import { audio, type Voice } from '../systems/AudioManager'
import { fader } from '../systems/fader'

export function startVictory() {
  const g = useGame.getState()
  if (g.phase !== 'PLAYING' || runtime.cinematic.kind) return false
  if (!g.transition('VICTORY_CINEMATIC')) return false
  g.setObjective('COMPLETED')
  g.setPrompt(null)
  runtime.cinematic.kind = 'victory'
  runtime.cinematic.t = 0
  runtime.player.controlEnabled = false
  runtime.player.lookEnabled = true
  runtime.lights.scripted = true
  audio.play('breaker_lever', { volume: 1, reverb: 0.5 })
  return true
}

export function VictoryCinematic() {
  const s = useRef({ cues: new Set<string>(), strobeT: 0, music: null as Voice | null, done: false })

  useFrame((_, rawDt) => {
    if (runtime.cinematic.kind !== 'victory') return
    const dt = Math.min(rawDt, SIM.maxDt)
    const st = s.current
    runtime.cinematic.t += dt
    const t = runtime.cinematic.t
    const lr = runtime.lights
    const c = runtime.creature
    const cue = (name: string, at: number, fn: () => void) => {
      if (t >= at && !st.cues.has(name)) {
        st.cues.add(name)
        fn()
      }
    }

    cue('power', 0.45, () => audio.play('power_on', { volume: 1, reverb: 0.5 }))

    if (t >= 0.5 && t < 2.4) {
      // Ballasts fighting to start: every tube strobes on its own rhythm.
      st.strobeT -= dt
      if (st.strobeT <= 0) {
        st.strobeT = 0.03 + Math.random() * 0.1
        for (const f of FIXTURES) lr.fixtures[f.id] = Math.random() < 0.45 ? 0.3 + Math.random() * 0.7 : 0
        lr.practical = Math.random() < 0.5 ? 1 : 0.2
      }
    }
    cue('fail', 2.4, () => {
      for (const f of FIXTURES) lr.fixtures[f.id] = 0
      lr.practical = 0
      lr.cornerBulb = 0
      runtime.flashlight.on = false
      audio.play('lights_out', { volume: 0.6, reverb: 0.4 })
    })
    // The creature is simply... gone.
    cue('gone', 2.6, () => {
      c.visible = false
      c.state = 'GONE'
    })
    cue('lit', 3.4, () => {
      for (const f of FIXTURES) lr.fixtures[f.id] = 1
      audio.play('fluorescent_flicker', { volume: 0.5 })
    })
    if (t >= 3.4) lr.victory = Math.min(1, (t - 3.4) / 0.3)

    cue('music', 6.0, () => {
      st.music = audio.play('victory', { bus: 'music', volume: 0.9, fadeIn: 2.5 })
    })
    if (t >= 8.5) fader.set((t - 8.5) / 2.5)
    if (t >= 11.2 && !st.done) {
      st.done = true
      useGame.getState().transition('VICTORY_SCREEN')
    }
  }, -2)

  return null
}
