import { useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { INTERACTABLES } from '../config/layout'
import { GAME_CONFIG } from '../config/gameConfig'
import { runtime, SIM } from '../systems/runtime'
import { useGame } from '../systems/GameState'
import { input } from '../systems/Input'
import { audio } from '../systems/AudioManager'
import { startVictory } from '../cinematics/VictoryCinematic'
import { markers } from '../systems/markers'

type TargetId = 'flashlight' | 'batteries' | 'panel' | 'door'

const CENTERS: Record<TargetId, THREE.Vector3> = {
  flashlight: new THREE.Vector3(...INTERACTABLES.flashlight.pos),
  batteries: new THREE.Vector3(...INTERACTABLES.batteries.pos),
  panel: new THREE.Vector3(INTERACTABLES.panel.pos[0] + 0.2, INTERACTABLES.panel.pos[1] + 0.5, INTERACTABLES.panel.pos[2] - 0.1),
  door: new THREE.Vector3(INTERACTABLES.door.pos[0], 1.1, INTERACTABLES.door.pos[2] + 0.3),
}

const ray = new THREE.Ray()
const tmp = new THREE.Vector3()

// Forgiving targeting: a ray vs. each interactable's bounding sphere, or — when close — simply
// looking roughly toward it. The candidate closest to the centre of view wins.
export function findTarget(camera: THREE.Camera, available: TargetId[]): TargetId | null {
  camera.getWorldPosition(ray.origin)
  camera.getWorldDirection(ray.direction)
  let best: TargetId | null = null
  let bestScore = Infinity
  for (const id of available) {
    const c = CENTERS[id]
    const r = INTERACTABLES[id].radius
    tmp.copy(c).sub(ray.origin)
    const dist = tmp.length()
    if (dist > GAME_CONFIG.player.interactDistance + r) continue
    const t = tmp.dot(ray.direction)
    if (t < 0) continue
    const angle = Math.acos(THREE.MathUtils.clamp(t / Math.max(dist, 1e-4), -1, 1))
    const d2 = tmp.lengthSq() - t * t
    const rayHit = d2 <= r * r
    const lookingNear = dist < 1.9 && angle < THREE.MathUtils.degToRad(38)
    if (!rayHit && !lookingNear) continue
    const score = angle - (rayHit ? 1 : 0)
    if (score < bestScore) {
      bestScore = score
      best = id
    }
  }
  return best
}

const projected = new THREE.Vector3()
const LABELS: Record<TargetId, string> = { flashlight: 'PICK UP', batteries: 'PICK UP', panel: 'RESTORE POWER', door: 'OPEN' }

// Screen-space markers for nearby interactables (shown even when not aimed at).
function updateMarkers(camera: THREE.Camera, available: TargetId[], target: TargetId | null, size: { width: number; height: number }) {
  const camPos = ray.origin
  for (const id of ['flashlight', 'batteries', 'panel', 'door'] as TargetId[]) {
    if (!available.includes(id)) {
      markers.update(id, null)
      continue
    }
    const c = CENTERS[id]
    const dist = c.distanceTo(camPos)
    const show = id === 'door' ? 3 : 5
    if (dist > show) {
      markers.update(id, null)
      continue
    }
    projected.copy(c).project(camera)
    if (projected.z > 1 || Math.abs(projected.x) > 1.1 || Math.abs(projected.y) > 1.1) {
      markers.update(id, null)
      continue
    }
    const near = dist < GAME_CONFIG.player.interactDistance + INTERACTABLES[id].radius
    let label = LABELS[id]
    if (id === 'panel' && !runtime.flashlight.on) label = 'TOO DARK — NEED LIGHT'
    if (id === 'panel' && runtime.flashlight.on) label = 'HOLD — RESTORE POWER'
    markers.update(id, {
      x: (projected.x * 0.5 + 0.5) * size.width,
      y: (-projected.y * 0.5 + 0.5) * size.height,
      opacity: THREE.MathUtils.clamp((show - dist) / 1.5, 0, 1) * (id === 'door' ? 0.6 : 1),
      near,
      target: id === target,
      label,
    })
  }
}

export function InteractionSystem() {
  const { camera, size } = useThree()
  const strainAt = useRef(0)
  const holdSoundCooldown = useRef(0)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, SIM.maxDt)
    const g = useGame.getState()
    const it = runtime.interact
    if (g.phase !== 'PLAYING' || runtime.cinematic.kind) {
      if (g.prompt) g.setPrompt(null)
      it.holding = false
      markers.hideAll()
      return
    }
    const available: TargetId[] = ['door']
    if (!g.hasFlashlight) available.push('flashlight')
    if (!g.hasBatteries) available.push('batteries')
    if (g.objective !== 'COMPLETED') available.push('panel')
    const target = findTarget(camera, available)
    it.target = target
    updateMarkers(camera, available, target, size)
    const ePressed = input.pressed('KeyE')
    const eHeld = input.down('KeyE')

    let prompt: string | null = null
    let progress = 0
    switch (target) {
      case 'flashlight':
        prompt = 'E — PICK UP'
        if (ePressed) {
          g.set({ hasFlashlight: true })
          runtime.flashlight.held = true
          audio.play('flashlight_pickup', { volume: 0.8, reverb: 0.15 })
          if (g.hasBatteries) {
            powerFlashlight(g.runId)
          } else {
            later(g.runId, 700, () => useGame.getState().pushMessage('F — FLASHLIGHT', 'hint', 3.5))
          }
        }
        break
      case 'batteries':
        prompt = 'E — PICK UP'
        if (ePressed) {
          g.set({ hasBatteries: true })
          audio.play('battery_pickup', { volume: 0.8, reverb: 0.15 })
          if (g.hasFlashlight) {
            later(g.runId, 350, () => audio.play('battery_insert', { volume: 0.75, reverb: 0.15 }))
            later(g.runId, 2400, () => powerFlashlight(g.runId))
          } else {
            g.pushMessage('BATTERIES', 'info', 2)
          }
        }
        break
      case 'panel': {
        if (!runtime.flashlight.on) {
          prompt = 'TOO DARK TO SEE'
          break
        }
        prompt = 'HOLD E — RESTORE POWER'
        if (eHeld) {
          it.holding = true
          it.panelProgress = Math.min(1, it.panelProgress + dt / GAME_CONFIG.interaction.panelHoldTime)
          holdSoundCooldown.current -= dt
          if (holdSoundCooldown.current <= 0) {
            audio.play('breaker_strain', { pos: CENTERS.panel, volume: 0.75, rate: 0.9 + it.panelProgress * 0.2 })
            holdSoundCooldown.current = 1.25
          }
          if (it.panelProgress >= 1) {
            startVictory()
          }
        }
        progress = it.panelProgress
        break
      }
      case 'door':
        prompt = 'E — OPEN'
        if (ePressed) {
          audio.play('door_locked', { pos: CENTERS.door, volume: 0.9 })
          g.pushMessage("IT'S LOCKED", 'info', 2)
        }
        break
    }
    if (!(target === 'panel' && eHeld && runtime.flashlight.on)) {
      it.holding = false
      holdSoundCooldown.current = 0
      it.panelProgress = Math.max(0, it.panelProgress - dt * GAME_CONFIG.interaction.panelDecay)
      if (target === 'panel') progress = it.panelProgress
    }
    strainAt.current = it.panelProgress
    g.setPrompt(prompt, progress)
  }, -4)

  return null
}

// Delayed action measured in play time: it waits through pauses and dies with the run.
export function later(runId: number, ms: number, fn: () => void) {
  runtime.timers.push({
    at: runtime.time + ms / 1000,
    fn: () => {
      if (useGame.getState().runId === runId) fn()
    },
  })
}

function powerFlashlight(runId: number) {
  const g = useGame.getState()
  if (g.phase !== 'PLAYING' || g.runId !== runId) return
  runtime.flashlight.powered = true
  runtime.flashlight.on = true
  g.set({ flashlightOn: true })
  audio.play('flashlight_on', { volume: 0.8, reverb: 0.1 })
  if (g.objective !== 'COMPLETED') {
    g.setObjective('RESTORE_POWER')
    later(runId, 900, () => useGame.getState().pushMessage('RESTORE THE LIGHTS', 'objective', 4.5))
  }
}
