import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { CreatureBrain } from './CreatureAI'
import { viewFromCamera, type ViewInfo } from './VisibilityDetector'
import { CREATURE_START, PLAYER_START } from '../config/layout'
import { GAME_CONFIG } from '../config/gameConfig'
import { runtime, SIM } from '../systems/runtime'
import { useGame } from '../systems/GameState'
import { audio, type Voice } from '../systems/AudioManager'
import { startDeath } from '../cinematics/DeathCinematic'

const C = GAME_CONFIG.creature

// Runs the creature's observation rule each frame and turns its decisions into sound and death.
export function CreatureDirector() {
  const { camera } = useThree()
  const brain = useMemo(() => {
    const b = new CreatureBrain(new THREE.Vector3(...CREATURE_START))
    b.faceTarget(new THREE.Vector3(...PLAYER_START.pos))
    return b
  }, [])
  const view = useRef<ViewInfo | null>(null)
  const voices = useRef<{ breath?: Voice | null; tension?: Voice | null; pressure?: Voice | null; heart?: Voice | null }>({})
  const dyn = useMemo(() => [] as THREE.Vector3[], [])

  useEffect(() => {
    runtime.creature.pos.copy(brain.pos)
    runtime.creature.yaw = brain.yaw
    if (import.meta.env.DEV || new URLSearchParams(location.search).has('debug')) {
      ;(window as unknown as { __brain: CreatureBrain }).__brain = brain
    }
    const v = voices.current
    return () => {
      v.breath?.stop(0.3)
      v.tension?.stop(0.5)
      v.pressure?.stop(0.3)
      v.heart?.stop(0.3)
    }
  }, [brain])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, SIM.maxDt)
    const g = useGame.getState()
    const c = runtime.creature
    const v = voices.current
    const playing = g.phase === 'PLAYING'

    // --- Brain -------------------------------------------------------------------------
    if (playing && !runtime.cinematic.kind && c.state !== 'GONE') {
      if (!c.active && (g.hasFlashlight || runtime.time > C.activationDelay || runtime.player.distanceWalked > C.activationDistance)) {
        c.active = true
      }
      view.current = viewFromCamera(camera as THREE.PerspectiveCamera, view.current ?? undefined)
      dyn.length = 0
      for (const d of runtime.dynamicBodies) dyn.push(d.get().clone())
      const events = brain.update({
        dt,
        time: runtime.time,
        playerPos: runtime.player.pos,
        view: view.current,
        active: c.active,
        aggressive: g.hasBatteries,
        dynamicPositions: dyn,
      })
      c.pos.copy(brain.pos)
      c.yaw = brain.yaw
      c.observed = brain.observed
      c.distance = brain.distanceTo(runtime.player.pos)
      c.proximity = brain.proximity
      c.unobservedTime = brain.unobservedTime
      c.moves = brain.moves
      if (c.state !== 'ATTACKING') c.state = !c.active ? 'IDLE' : brain.observed ? 'FROZEN' : 'UNOBSERVED'
      for (const e of events) {
        if (e.type === 'moved') {
          c.state = 'REPOSITIONING'
          if (Math.random() < 0.65) audio.play('creature_move', { pos: [e.to.x, 0.2, e.to.z], volume: 0.22 + Math.random() * 0.12, rate: 0.85 + Math.random() * 0.2 })
          if (c.distance < 4.5) audio.play('cloth_rustle', { pos: [e.to.x, 1.6, e.to.z], volume: 0.35 })
        } else if (e.type === 'attackWarning') {
          c.state = 'ATTACKING'
          audio.play('attack_sting', { pos: [c.pos.x, 1.8, c.pos.z], volume: 1, refDistance: 3 })
          runtime.player.speedFactor = 0.25
        } else if (e.type === 'attack') {
          startDeath(e.reason)
        }
      }
      if (c.state !== 'ATTACKING') runtime.player.speedFactor = 1 - brain.proximity * 0.6
    }

    // --- Audio cues by distance -------------------------------------------------------------
    if (!audio.ready) return
    const dist = c.distance
    const live = playing && c.state !== 'GONE' && !runtime.cinematic.kind
    c.danger = live && c.active ? THREE.MathUtils.clamp((9 - dist) / 7, 0, 1) : 0
    const tensionVol = live && c.active ? 0.07 + c.danger * 0.55 : 0
    const breathVol = live ? THREE.MathUtils.clamp((4.2 - dist) / 3, 0, 1) * 0.85 : 0
    const pressureVol = live ? brain.proximity * 0.9 + (dist < 3 ? 0.25 : 0) : 0
    const heartVol = live && c.active ? THREE.MathUtils.clamp((6 - dist) / 4, 0, 1) * 0.55 : 0
    if (!v.tension && tensionVol > 0) v.tension = audio.play('tension_layer', { bus: 'music', loop: true, volume: 0 })
    if (!v.breath && breathVol > 0) v.breath = audio.play('creature_breath', { pos: [c.pos.x, 2.0, c.pos.z], loop: true, volume: 0, refDistance: 1.2 })
    if (!v.pressure && pressureVol > 0) v.pressure = audio.play('pressure_tone', { bus: 'amb', loop: true, volume: 0, reverb: 0 })
    if (!v.heart && heartVol > 0) v.heart = audio.play('heartbeat', { bus: 'amb', loop: true, volume: 0, reverb: 0 })
    v.tension?.setVolume(tensionVol, 1.2)
    v.breath?.setVolume(breathVol, 0.4)
    v.breath?.setPosition([c.pos.x, 2.0, c.pos.z])
    v.pressure?.setVolume(pressureVol, 0.4)
    v.heart?.setVolume(heartVol, 0.8)
    v.heart?.setRate(1 + c.danger * 0.35, 1)
  }, -3)

  return null
}
