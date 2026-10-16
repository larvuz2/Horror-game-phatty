import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { runtime, resetRuntime, SIM } from './runtime'
import { useGame } from './GameState'
import { audio, type Voice } from './AudioManager'
import { input } from './Input'
import { fader } from './fader'
import { ROOM, PROPS } from '../config/layout'
import { setLook, requestTeleport } from '../player/PlayerController'
import { startDeath } from '../cinematics/DeathCinematic'
import { startVictory } from '../cinematics/VictoryCinematic'

const INTRO = SIM.skipIntro ? { fadeStart: 0, fadeEnd: 0.1, control: 0.2 } : { fadeStart: 1.4, fadeEnd: 3.8, control: 4.2 }

// Begins a fresh run (from the menu, retry, or restart).
export function startRun() {
  resetRuntime()
  input.clear()
  const g = useGame.getState()
  g.newRun()
  fader.set(1)
  if (!g.transition('INTRO')) {
    // From PAUSED -> INTRO is allowed; from MAIN_MENU via LOADING too. Fall back to a direct set.
    useGame.setState({ phase: 'INTRO', pausedFrom: null })
  }
}

const CLOCK = PROPS.find((p) => p.id === 'clock')!.pos

// Per-run orchestration: intro, play timer, ambience and end-of-frame input flush.
export function Director() {
  const s = useRef({ intro: 0, nextAmb: 8, clockT: 1, clockStall: 0, ambient: null as Voice | null, tone: null as Voice | null, introCues: new Set<string>() })

  useEffect(() => {
    const st = s.current
    return () => {
      st.ambient?.stop(0.8)
      st.tone?.stop(0.8)
    }
  }, [])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, SIM.maxDt)
    const g = useGame.getState()
    const st = s.current
    const pl = runtime.player

    if (g.phase === 'INTRO') {
      st.intro += dt
      const t = st.intro
      pl.controlEnabled = false
      pl.lookEnabled = false
      if (t < INTRO.fadeStart) fader.set(1)
      else fader.set(1 - THREE.MathUtils.smoothstep(t, INTRO.fadeStart, INTRO.fadeEnd))
      if (!st.introCues.has('amb') && audio.ready) {
        st.introCues.add('amb')
        st.tone = audio.play('room_tone', { bus: 'amb', loop: true, volume: 0.9, fadeIn: 2.5, reverb: 0 })
        st.ambient = audio.play('ambient_bed', { bus: 'music', loop: true, volume: 0.32, fadeIn: 6 })
      }
      if (t >= INTRO.control) {
        if (g.transition('PLAYING')) {
          fader.set(0)
          pl.controlEnabled = true
          pl.lookEnabled = true
          g.pushMessage('TURN ON THE LIGHTS', 'objective', 4.5)
          window.setTimeout(() => {
            const gg = useGame.getState()
            if (gg.phase === 'PLAYING' && gg.runId === g.runId) gg.pushMessage('WASD  MOVE     MOUSE  LOOK     E  INTERACT', 'hint', 5.5)
          }, 5200)
        }
      }
    } else if (g.phase === 'PLAYING') {
      runtime.time += dt
      if (!runtime.cinematic.kind) {
        pl.controlEnabled = true
        pl.lookEnabled = true
      }
      // Random building noises, never right next to the player.
      st.nextAmb -= dt
      if (st.nextAmb <= 0 && audio.ready) {
        st.nextAmb = 7 + Math.random() * 9
        const names = ['creak_1', 'creak_2', 'distant_metal', 'drip', 'creak_1']
        const n = names[Math.floor(Math.random() * names.length)]
        const a = Math.random() * Math.PI * 2
        const x = THREE.MathUtils.clamp(pl.pos.x + Math.cos(a) * 7, ROOM.minX, ROOM.maxX)
        const z = THREE.MathUtils.clamp(pl.pos.z + Math.sin(a) * 7, ROOM.minZ, ROOM.maxZ)
        audio.play(n, { pos: [x, n === 'drip' ? 0.2 : 3.6, z], volume: 0.35 + Math.random() * 0.3, rate: 0.85 + Math.random() * 0.3, reverb: 0.7 })
      }
      // The broken clock: ticks, stalls, stutters.
      st.clockT -= dt
      if (st.clockT <= 0 && audio.ready) {
        if (st.clockStall > 0) {
          st.clockStall--
          st.clockT = 1
        } else {
          audio.play('clock_tick', { pos: CLOCK, volume: 0.32, rate: 0.95 + Math.random() * 0.1, refDistance: 0.8 })
          st.clockT = Math.random() < 0.15 ? 0.22 : 1
          if (Math.random() < 0.08) st.clockStall = 2 + Math.floor(Math.random() * 4)
        }
      }
    } else if (g.phase === 'DEATH_CINEMATIC' || g.phase === 'VICTORY_CINEMATIC') {
      if (st.ambient) {
        st.ambient.stop(g.phase === 'DEATH_CINEMATIC' ? 0.6 : 2.5)
        st.ambient = null
      }
      if (g.phase === 'DEATH_CINEMATIC' && st.tone && runtime.cinematic.t > 1.05) {
        st.tone.stop(0.3)
        st.tone = null
      }
    }
  }, -6)

  // Flush edge-triggered input after every system has read it.
  useFrame(() => input.endFrame(), -0.5)

  // Debug / automation hooks.
  useEffect(() => {
    if (!(import.meta.env.DEV || new URLSearchParams(location.search).has('debug'))) return
    const w = window as unknown as Record<string, unknown>
    w.__DLA = {
      runtime: () => runtime,
      game: useGame,
      input,
      setLook,
      teleport: requestTeleport,
      audio,
      give: (what: 'flashlight' | 'batteries' | 'all') => {
        const g = useGame.getState()
        if (what === 'flashlight' || what === 'all') g.set({ hasFlashlight: true })
        if (what === 'batteries' || what === 'all') g.set({ hasBatteries: true })
        if (what === 'all') {
          runtime.flashlight.powered = true
          runtime.flashlight.on = true
          g.set({ flashlightOn: true })
          g.setObjective('RESTORE_POWER')
        }
      },
      creature: (x: number, z: number, freeze = true) => {
        const b = (window as unknown as { __brain?: { pos: THREE.Vector3; faceTarget: (v: THREE.Vector3) => void; nextDelay: number } }).__brain
        if (!b) return
        b.pos.set(x, 0, z)
        b.faceTarget(runtime.player.pos)
        if (freeze) b.nextDelay = 1e9
        else b.nextDelay = 1.5
      },
      death: () => startDeath('approach'),
      victory: () => startVictory(),
    }
  }, [])

  return null
}
