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

type TargetId = 'flashlight' | 'batteries' | 'panel' | 'door'

const CENTERS: Record<TargetId, THREE.Vector3> = {
  flashlight: new THREE.Vector3(...INTERACTABLES.flashlight.pos),
  batteries: new THREE.Vector3(...INTERACTABLES.batteries.pos),
  panel: new THREE.Vector3(INTERACTABLES.panel.pos[0] + 0.2, INTERACTABLES.panel.pos[1] + 0.5, INTERACTABLES.panel.pos[2] - 0.1),
  door: new THREE.Vector3(INTERACTABLES.door.pos[0], 1.1, INTERACTABLES.door.pos[2] + 0.3),
}

const ray = new THREE.Ray()
const tmp = new THREE.Vector3()

// Ray (from the eye) vs. bounding sphere around each interactable.
export function findTarget(camera: THREE.Camera, available: TargetId[]): TargetId | null {
  camera.getWorldPosition(ray.origin)
  camera.getWorldDirection(ray.direction)
  let best: TargetId | null = null
  let bestT = Infinity
  for (const id of available) {
    const c = CENTERS[id]
    const r = INTERACTABLES[id].radius
    tmp.copy(c).sub(ray.origin)
    const t = tmp.dot(ray.direction)
    if (t < 0 || t > GAME_CONFIG.player.interactDistance + r) continue
    const d2 = tmp.lengthSq() - t * t
    if (d2 > r * r) continue
    if (t < bestT) {
      bestT = t
      best = id
    }
  }
  return best
}

export function InteractionSystem() {
  const { camera } = useThree()
  const strainAt = useRef(0)
  const holdSoundCooldown = useRef(0)

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, SIM.maxDt)
    const g = useGame.getState()
    const it = runtime.interact
    if (g.phase !== 'PLAYING' || runtime.cinematic.kind) {
      if (g.prompt) g.setPrompt(null)
      it.holding = false
      return
    }
    const available: TargetId[] = ['door']
    if (!g.hasFlashlight) available.push('flashlight')
    if (!g.hasBatteries) available.push('batteries')
    if (g.objective !== 'COMPLETED') available.push('panel')
    const target = findTarget(camera, available)
    it.target = target
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
            powerFlashlight()
          } else {
            window.setTimeout(() => useGame.getState().pushMessage('F — FLASHLIGHT', 'hint', 3.5), 700)
          }
        }
        break
      case 'batteries':
        prompt = 'E — PICK UP'
        if (ePressed) {
          g.set({ hasBatteries: true })
          audio.play('battery_pickup', { volume: 0.8, reverb: 0.15 })
          if (g.hasFlashlight) {
            window.setTimeout(() => {
              audio.play('battery_insert', { volume: 0.75, reverb: 0.15 })
            }, 350)
            window.setTimeout(() => powerFlashlight(), 2400)
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

function powerFlashlight() {
  const g = useGame.getState()
  if (g.phase !== 'PLAYING') return
  runtime.flashlight.powered = true
  runtime.flashlight.on = true
  g.set({ flashlightOn: true })
  audio.play('flashlight_on', { volume: 0.8, reverb: 0.1 })
  if (g.objective !== 'COMPLETED') {
    g.setObjective('RESTORE_POWER')
    window.setTimeout(() => useGame.getState().pushMessage('RESTORE THE LIGHTS', 'objective', 4.5), 900)
  }
}
