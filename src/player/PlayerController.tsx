import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { CapsuleCollider, RigidBody, useRapier, type RapierRigidBody, type RapierCollider } from '@react-three/rapier'
import type { KinematicCharacterController } from '@dimforge/rapier3d-compat'
import { GAME_CONFIG } from '../config/gameConfig'
import { PLAYER_START } from '../config/layout'
import { runtime, SIM } from '../systems/runtime'
import { input } from '../systems/Input'
import { useSettings } from '../systems/SettingsManager'
import { audio } from '../systems/AudioManager'

const P = GAME_CONFIG.player
const CENTER_Y = P.capsuleHalfHeight + P.capsuleRadius
const STEPS = ['step_1', 'step_2', 'step_3', 'step_4', 'step_5', 'step_6', 'step_7']

export function PlayerController() {
  const { world } = useRapier()
  const body = useRef<RapierRigidBody>(null)
  const collider = useRef<RapierCollider>(null)
  const controller = useRef<KinematicCharacterController | null>(null)
  const { camera } = useThree()
  const state = useRef({
    targetYaw: PLAYER_START.yaw,
    targetPitch: 0,
    vel: new THREE.Vector3(),
    vy: 0,
    bobPhase: 0,
    lastStepSign: 1,
    lastStep: -1,
    breath: 0,
    sway: 0,
  })
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))

  useEffect(() => {
    const c = world.createCharacterController(0.02)
    c.setUp({ x: 0, y: 1, z: 0 })
    c.setSlideEnabled(true)
    c.setMaxSlopeClimbAngle((40 * Math.PI) / 180)
    c.enableAutostep(0.18, 0.15, false)
    c.enableSnapToGround(0.3)
    c.setApplyImpulsesToDynamicBodies(true)
    const anyC = c as unknown as { setCharacterMass?: (m: number) => void }
    anyC.setCharacterMass?.(22)
    controller.current = c
    return () => {
      world.removeCharacterController(c)
      controller.current = null
    }
  }, [world])

  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = 62
    cam.near = 0.05
    cam.far = 60
    cam.updateProjectionMatrix()
    runtime.camera = cam
    runtime.player.yaw = PLAYER_START.yaw
    state.current.targetYaw = PLAYER_START.yaw
    cam.position.set(PLAYER_START.pos[0], P.eyeHeight, PLAYER_START.pos[2])
    cam.rotation.set(0, PLAYER_START.yaw, 0, 'YXZ')
  }, [camera])

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, SIM.maxDt)
    const b = body.current
    const col = collider.current
    const ctl = controller.current
    if (!b || !col || !ctl) return
    const s = state.current
    const pl = runtime.player
    const settings = useSettings.getState()

    if (teleportRequest) {
      b.setTranslation({ x: teleportRequest.x, y: CENTER_Y + 0.02, z: teleportRequest.z }, true)
      b.setNextKinematicTranslation({ x: teleportRequest.x, y: CENTER_Y + 0.02, z: teleportRequest.z })
      s.vel.set(0, 0, 0)
      teleportRequest = null
      return
    }
    // --- Look -----------------------------------------------------------------------
    if (lookOverride) {
      s.targetYaw = pl.yaw = lookOverride.yaw
      s.targetPitch = pl.pitch = lookOverride.pitch
      lookOverride = null
    }
    const m = input.consumeMouse()
    if (pl.lookEnabled) {
      const sens = P.mouseSensitivity * settings.mouseSensitivity * pl.speedFactor ** 0.5
      s.targetYaw -= m.x * sens
      s.targetPitch -= m.y * sens * (settings.invertY ? -1 : 1)
      const tl = input.consumeTouchLook()
      const tsens = 0.0042 * settings.mouseSensitivity * pl.speedFactor ** 0.5
      s.targetYaw -= tl.x * tsens
      s.targetPitch -= tl.y * tsens * (settings.invertY ? -1 : 1)
      let turn = 0
      if (input.down('ArrowLeft')) turn += 1
      if (input.down('ArrowRight')) turn -= 1
      s.targetYaw += turn * P.keyTurnSpeed * dt * pl.speedFactor
      // Up/down arrows tilt the view so the room can be browsed from the keyboard alone.
      let tilt = 0
      if (input.down('ArrowUp')) tilt += 1
      if (input.down('ArrowDown')) tilt -= 1
      s.targetPitch += tilt * P.keyTurnSpeed * 0.8 * dt * (settings.invertY ? -1 : 1)
      s.targetPitch = THREE.MathUtils.clamp(s.targetPitch, -P.pitchLimit, P.pitchLimit)
    }
    const k = 1 - Math.exp(-P.lookDamping * dt)
    pl.yaw += (s.targetYaw - pl.yaw) * k
    pl.pitch += (s.targetPitch - pl.pitch) * k

    // --- Move -----------------------------------------------------------------------
    let fx = 0, fz = 0
    if (pl.controlEnabled) {
      if (input.down('KeyW')) fz += 1
      if (input.down('KeyS')) fz -= P.backwardFactor
      if (input.down('KeyD')) fx += P.strafeFactor
      if (input.down('KeyA')) fx -= P.strafeFactor
      const tm = input.touchMove
      if (tm.x || tm.y) {
        fz += -tm.y * (tm.y > 0 ? P.backwardFactor : 1)
        fx += tm.x * P.strafeFactor
      }
    }
    const len = Math.hypot(fx, fz)
    if (len > 1) {
      fx /= len
      fz /= len
    }
    const sin = Math.sin(pl.yaw), cos = Math.cos(pl.yaw)
    // yaw 0 faces -z; right vector is +x
    const tx = (fz * -sin + fx * cos) * P.walkSpeed * pl.speedFactor
    const tz = (fz * -cos - fx * sin) * P.walkSpeed * pl.speedFactor
    const accel = len > 0.01 ? P.acceleration : P.deceleration
    const dvx = tx - s.vel.x, dvz = tz - s.vel.z
    const dv = Math.hypot(dvx, dvz)
    const maxDv = accel * dt
    if (dv > maxDv) {
      s.vel.x += (dvx / dv) * maxDv
      s.vel.z += (dvz / dv) * maxDv
    } else {
      s.vel.x = tx
      s.vel.z = tz
    }
    s.vy = ctl.computedGrounded() ? -0.6 : s.vy - 9.81 * dt
    const desired = { x: s.vel.x * dt, y: s.vy * dt, z: s.vel.z * dt }
    ctl.computeColliderMovement(col, desired)
    const mv = ctl.computedMovement()
    const t = b.translation()
    const next = { x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z }
    b.setNextKinematicTranslation(next)
    const moved = Math.hypot(mv.x, mv.z)
    pl.distanceWalked += moved
    pl.speed = moved / dt
    // Bleed velocity when blocked so we don't "push" into walls.
    if (dt > 0 && moved / dt < Math.hypot(s.vel.x, s.vel.z) * 0.5) {
      s.vel.multiplyScalar(0.8)
    }
    pl.pos.set(next.x, next.y - CENTER_Y, next.z)

    // --- Camera -----------------------------------------------------------------------
    if (runtime.cinematic.kind === 'death') return
    const reduce = settings.reduceMotion
    const speedRatio = Math.min(1, pl.speed / P.walkSpeed)
    s.bobPhase += dt * Math.PI * P.headBobFrequency * speedRatio
    const bobAmt = reduce ? 0 : P.headBobAmount * speedRatio
    const bobY = Math.abs(Math.sin(s.bobPhase)) * bobAmt - bobAmt * 0.5
    const bobX = Math.cos(s.bobPhase) * bobAmt * 0.45
    s.breath += dt * (1.1 + (1 - pl.speedFactor) * 1.6)
    const breathY = reduce ? 0 : Math.sin(s.breath) * P.breathAmount
    // Footsteps on each bob trough.
    const sign = Math.sign(Math.sin(s.bobPhase))
    if (speedRatio > 0.2 && sign !== s.lastStepSign) {
      s.lastStepSign = sign
      let idx = Math.floor(Math.random() * STEPS.length)
      if (idx === s.lastStep) idx = (idx + 1) % STEPS.length
      s.lastStep = idx
      audio.play(STEPS[idx], { pos: [pl.pos.x, 0.05, pl.pos.z], volume: 0.32 + speedRatio * 0.18, rate: 0.9 + Math.random() * 0.16, reverb: 0.45 })
    }
    s.sway += ((pl.yaw - s.targetYaw) * 0.6 - s.sway) * Math.min(1, dt * 6)
    const shake = runtime.fx.shake
    const shX = shake ? (Math.random() - 0.5) * shake * 0.01 : 0
    const shY = shake ? (Math.random() - 0.5) * shake * 0.01 : 0
    camera.position.set(next.x + cos * bobX + shX, next.y - CENTER_Y + P.eyeHeight + bobY + breathY + shY, next.z - sin * bobX)
    euler.current.set(pl.pitch + (reduce ? 0 : Math.sin(s.breath * 0.5) * 0.002), pl.yaw, reduce ? 0 : THREE.MathUtils.clamp(s.sway, -0.04, 0.04) + bobX * 0.15)
    camera.quaternion.setFromEuler(euler.current)
  }, -5)

  return (
    <RigidBody ref={body} type="kinematicPosition" colliders={false} position={[PLAYER_START.pos[0], CENTER_Y + 0.02, PLAYER_START.pos[2]]} enabledRotations={[false, false, false]}>
      <CapsuleCollider ref={collider} args={[P.capsuleHalfHeight, P.capsuleRadius]} />
    </RigidBody>
  )
}

// Allows tests/cinematics to snap the look direction.
export function setLook(yaw: number, pitch: number) {
  runtime.player.yaw = yaw
  runtime.player.pitch = pitch
  lookOverride = { yaw, pitch }
}
export let lookOverride: { yaw: number; pitch: number } | null = null

let teleportRequest: { x: number; z: number } | null = null
export function requestTeleport(x: number, z: number) {
  teleportRequest = { x, z }
}
