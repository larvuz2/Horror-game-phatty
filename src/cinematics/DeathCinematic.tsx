import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { STAGE } from '../config/layout'
import { GAME_CONFIG } from '../config/gameConfig'
import { runtime, SIM } from '../systems/runtime'
import { useGame } from '../systems/GameState'
import { audio } from '../systems/AudioManager'

const T = GAME_CONFIG.cinematic

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const smooth = (x: number) => {
  const t = clamp01(x)
  return t * t * (3 - 2 * t)
}
const smoother = (x: number) => {
  const t = clamp01(x)
  return t * t * t * (t * (t * 6 - 15) + 10)
}
const range = (t: number, a: number, b: number) => clamp01((t - a) / (b - a))

// Deliberate, unnatural head raise: slow start, a stall, then a smooth final lift with a tremor.
export function headRaiseCurve(u: number) {
  u = clamp01(u)
  let h: number
  if (u < 0.42) h = 0.46 * smoother(u / 0.42)
  else if (u < 0.56) h = 0.46 + 0.03 * smooth((u - 0.42) / 0.14)
  else h = 0.49 + 0.51 * smoother((u - 0.56) / 0.44)
  return clamp01(h + Math.sin(u * 47) * 0.006 * (1 - u))
}

let pendingReason: 'unseen' | 'approach' = 'unseen'

export function startDeath(reason: 'unseen' | 'approach') {
  const g = useGame.getState()
  if (g.phase !== 'PLAYING' || runtime.cinematic.kind) return false
  if (!g.transition('DEATH_CINEMATIC')) return false
  pendingReason = reason
  runtime.cinematic.kind = 'death'
  runtime.cinematic.t = 0
  runtime.creature.state = 'CINEMATIC'
  runtime.player.controlEnabled = false
  runtime.player.lookEnabled = false
  g.setPrompt(null)
  audio.setMuffle(0.55, 1.0)
  audio.play('death_cinematic', { bus: 'music', volume: 1 })
  return true
}

// Camera keyframes in the creature's local frame (creature at origin facing +z).
// angle: radians around Y from the creature's forward axis; r: radius; h: camera height.
const KEYS: { t: number; a: number; r: number; h: number }[] = [
  { t: 1.45, a: THREE.MathUtils.degToRad(203), r: 1.0, h: 2.08 },
  { t: 3.0, a: THREE.MathUtils.degToRad(198), r: 1.15, h: 2.05 },
  { t: 4.6, a: THREE.MathUtils.degToRad(186), r: 1.32, h: 2.0 }, // the head rises above the shoulders
  { t: 6.0, a: THREE.MathUtils.degToRad(100), r: 1.8, h: 1.78 },
  { t: 7.3, a: THREE.MathUtils.degToRad(16), r: 1.95, h: 1.56 },
  { t: 9.0, a: THREE.MathUtils.degToRad(6), r: 1.3, h: 1.62 },
  { t: 12.0, a: THREE.MathUtils.degToRad(2), r: 0.78, h: 1.78 },
  { t: 15.0, a: 0, r: 0.6, h: 1.86 },
]

function sampleKeys(t: number) {
  if (t <= KEYS[0].t) return KEYS[0]
  for (let i = 0; i < KEYS.length - 1; i++) {
    const k0 = KEYS[Math.max(0, i - 1)], k1 = KEYS[i], k2 = KEYS[i + 1], k3 = KEYS[Math.min(KEYS.length - 1, i + 2)]
    if (t >= k1.t && t <= k2.t) {
      const u = (t - k1.t) / (k2.t - k1.t)
      const cr = (p0: number, p1: number, p2: number, p3: number) =>
        0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)
      return { t, a: cr(k0.a, k1.a, k2.a, k3.a), r: cr(k0.r, k1.r, k2.r, k3.r), h: cr(k0.h, k1.h, k2.h, k3.h) }
    }
  }
  return KEYS[KEYS.length - 1]
}

export function DeathCinematic() {
  const { camera } = useThree()
  const s = useRef({
    started: false,
    startPos: new THREE.Vector3(),
    startQuat: new THREE.Quaternion(),
    lookQuat: new THREE.Quaternion(),
    staged: false,
    blackout: false,
    cues: new Set<string>(),
    look: new THREE.Vector3(),
    done: false,
  })
  const m4 = useRef(new THREE.Matrix4())

  useFrame((_, rawDt) => {
    if (runtime.cinematic.kind !== 'death') return
    const st = s.current
    const dt = Math.min(rawDt, SIM.maxDt)
    const c = runtime.creature
    const lr = runtime.lights
    const fx = runtime.fx
    runtime.cinematic.t += dt
    const t = runtime.cinematic.t
    const cue = (name: string, at: number, fn: () => void) => {
      if (t >= at && !st.cues.has(name)) {
        st.cues.add(name)
        fn()
      }
    }

    if (!st.started) {
      st.started = true
      st.startPos.copy(camera.position)
      st.startQuat.copy(camera.quaternion)
      const head = c.headPos.clone().add(new THREE.Vector3(0, 0.05, 0))
      m4.current.lookAt(camera.position, head, new THREE.Vector3(0, 1, 0))
      st.lookQuat.setFromRotationMatrix(m4.current)
    }

    // 0 - 1: control loss, the view is dragged toward it; sound muffles.
    if (t < T.blackoutAt) {
      const u = smooth(t / T.blackoutAt)
      camera.quaternion.slerpQuaternions(st.startQuat, st.lookQuat, u * (pendingReason === 'unseen' ? 1 : 0.6))
      camera.position.copy(st.startPos).lerp(c.headPos.clone().setY(st.startPos.y), u * 0.05)
      fx.vignetteBoost = u * 0.5
      fx.shake = pendingReason === 'unseen' ? 0.6 * (1 - u) : 0
      return
    }

    // Blackout: every light dies.
    cue('blackout', T.blackoutAt, () => {
      lr.scripted = true
      lr.master = 0
      for (const k of Object.keys(lr.fixtures)) lr.fixtures[k] = 0
      fx.shake = 0
      audio.play('lights_out', { volume: 0.9, bus: 'sfx', reverb: 0.4 })
      audio.play('sub_drop', { volume: 0.9, bus: 'sfx', reverb: 0 })
      audio.setMuffle(0.35, 0.8)
    })

    // Staging: creature and camera move to a consistent composition while it's black.
    cue('stage', T.stageAt, () => {
      c.pos.set(...STAGE.pos)
      c.yaw = STAGE.yaw
      c.headRaise = 0
      c.eyeGlow = 0
      c.bodyFade = 1
      c.visible = true
      audio.play('heartbeat', { bus: 'amb', volume: 0.5, loop: true, reverb: 0 })?.stop(10.5)
    })
    if (t < T.stageAt) return

    // Lighting: a rim from behind first, then a cold top key as the camera comes around.
    lr.cinematicRim = smooth(range(t, T.stageAt, T.stageAt + 1.2)) * (1 - smooth(range(t, 9.5, 12)))
    lr.cinematicKey = smooth(range(t, 4.5, 7.0)) * (1 - smooth(range(t, 9.0, 12.0)) * 0.95)

    // Camera path.
    const k = sampleKeys(t)
    const base = new THREE.Vector3(...STAGE.pos)
    const yaw = STAGE.yaw
    const ang = yaw + k.a
    camera.position.set(base.x + Math.sin(ang) * k.r, k.h, base.z + Math.cos(ang) * k.r)
    // Look: past the creature at first (over the shoulder), then at its face.
    const face = c.headPos.clone().add(new THREE.Vector3(Math.sin(yaw) * 0.06, 0.07, Math.cos(yaw) * 0.06))
    const far = base.clone().add(new THREE.Vector3(Math.sin(yaw) * 3.5 - 0.2, 1.5, Math.cos(yaw) * 3.5))
    const lookBlend = smooth(range(t, 2.2, 4.2))
    const desired = far.lerp(face, lookBlend)
    if (!st.staged) {
      st.staged = true
      st.look.copy(desired)
    }
    st.look.lerp(desired, 1 - Math.exp(-6 * dt))
    camera.lookAt(st.look)
    // Slow breathing drift so the shot never feels static.
    camera.position.y += Math.sin(t * 0.8) * 0.006

    // Head raise.
    c.headRaise = headRaiseCurve(range(t, T.headRaiseStart, T.headRaiseEnd))
    cue('creak1', T.headRaiseStart + 0.2, () => audio.play('creak_2', { pos: c.headPos, volume: 0.35, rate: 1.7, reverb: 0.5 }))
    cue('whisper', 4.6, () => audio.play('whispers', { bus: 'amb', volume: 0.22, reverb: 0.7 }))
    cue('creak2', T.headRaiseStart + 2.6, () => audio.play('creak_2', { pos: c.headPos, volume: 0.3, rate: 1.45, reverb: 0.5 }))
    cue('cloth', 6.8, () => audio.play('cloth_rustle', { pos: c.headPos, volume: 0.5 }))

    // Eyes: 0 -> 15% -> 40% -> 100%, a last flare, then gone.
    let glow = 0
    if (t >= T.eyeRevealStart) glow = 0.15 * smooth(range(t, T.eyeRevealStart, 8.0))
    if (t >= 8.0) glow = 0.15 + 0.25 * smooth(range(t, 8.0, T.redStart))
    if (t >= T.redStart) glow = 0.4 + 0.6 * smooth(range(t, T.redStart, T.fadeStart))
    if (t >= 13.2) glow = 1 + 0.35 * Math.sin(range(t, 13.2, 14.2) * Math.PI)
    if (t >= 14.2) glow = 1 - smooth(range(t, 14.2, 15.0))
    c.eyeGlow = glow

    // Red intensification and fade.
    fx.bloomBoost = smooth(range(t, T.redStart, T.fadeStart)) * 1.4 + (t > 13.2 && t < 14.6 ? 0.6 * Math.sin(range(t, 13.2, 14.6) * Math.PI) : 0)
    fx.vignetteBoost = 0.35 + smooth(range(t, T.redStart, 14)) * 0.55
    fx.aberration = smooth(range(t, T.redStart, T.fadeStart)) * 0.8
    fx.dofAmount = smooth(range(t, 2.5, 6))
    fx.dofFocus = camera.position.distanceTo(face)
    fx.shake = t > 9.5 && t < 12.5 ? 0.15 : 0
    c.bodyFade = 1 - smooth(range(t, T.fadeStart, 13.6))
    fx.fog = 1 + smooth(range(t, T.fadeStart, 14)) * 5
    cue('silence', 12.6, () => audio.setMuffle(0, 0.1))

    if (t >= T.titleAt && !st.done) {
      st.done = true
      c.eyeGlow = 0
      c.visible = false
      useGame.getState().transition('DEATH_SCREEN')
    }
  }, -2)

  return null
}
