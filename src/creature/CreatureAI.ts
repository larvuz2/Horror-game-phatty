import * as THREE from 'three'
import { GAME_CONFIG } from '../config/gameConfig'
import { MODEL_SIZES, OCCLUDERS, PILLARS, PROPS, ROOM, INTERACTABLES, type AABB } from '../config/layout'
import { creatureSamplePoints, isObserved, segmentHitsBox, type ViewInfo } from './VisibilityDetector'

const C = GAME_CONFIG.creature

// Footprints (xz AABBs, conservative) of everything the creature cannot stand in or pass through.
export function buildObstacles(): AABB[] {
  const out: AABB[] = []
  for (const p of PROPS) {
    if (p.physics !== 'static') continue
    const size = MODEL_SIZES[p.model].size.map((v) => v * (p.scale ?? 1))
    const r = p.rotY ?? 0
    const c = Math.abs(Math.cos(r)), s = Math.abs(Math.sin(r))
    const hx = (size[0] * c + size[2] * s) / 2
    const hz = (size[0] * s + size[2] * c) / 2
    out.push({ min: [p.pos[0] - hx, 0, p.pos[2] - hz], max: [p.pos[0] + hx, size[1], p.pos[2] + hz] })
  }
  for (const pl of PILLARS) {
    out.push({ min: [pl.pos[0] - pl.size / 2, 0, pl.pos[1] - pl.size / 2], max: [pl.pos[0] + pl.size / 2, ROOM.height, pl.pos[1] + pl.size / 2] })
  }
  const d = INTERACTABLES.door.pos
  out.push({ min: [d[0] - 1.05, 0, d[2] - 0.3], max: [d[0] + 1.05, 2.3, d[2] + 0.3] })
  return out
}

export function buildNodes(obstacles: AABB[]): THREE.Vector3[] {
  const nodes: THREE.Vector3[] = []
  const sp = C.nodeSpacing
  for (let x = ROOM.minX + C.nodeClearance; x <= ROOM.maxX - C.nodeClearance + 1e-6; x += sp) {
    for (let z = ROOM.minZ + C.nodeClearance; z <= ROOM.maxZ - C.nodeClearance + 1e-6; z += sp) {
      const blocked = obstacles.some(
        (b) => x > b.min[0] - C.nodeClearance && x < b.max[0] + C.nodeClearance && z > b.min[2] - C.nodeClearance && z < b.max[2] + C.nodeClearance,
      )
      if (!blocked) nodes.push(new THREE.Vector3(x, 0, z))
    }
  }
  return nodes
}

export interface BrainContext {
  dt: number
  time: number
  playerPos: THREE.Vector3 // feet
  view: ViewInfo
  active: boolean
  aggressive: boolean // player has the batteries (late game)
  dynamicPositions: THREE.Vector3[]
}

export type BrainEvent =
  | { type: 'moved'; from: THREE.Vector3; to: THREE.Vector3 }
  | { type: 'attackWarning' }
  | { type: 'attack'; reason: 'unseen' | 'approach' }

export class CreatureBrain {
  pos = new THREE.Vector3()
  yaw = 0
  observed = true
  unobservedTime = 0
  lastMoveTime = -10
  moves = 0
  nextDelay: number = C.firstMoveDelay
  pendingAttack = -1 // time when the attack fires
  attacked = false
  proximity = 0 // 0..1 within the observed proximity zone
  readonly obstacles: AABB[]
  readonly nodes: THREE.Vector3[]
  private pts: THREE.Vector3[] = []
  private pts2: THREE.Vector3[] = []
  rng: () => number

  constructor(start: THREE.Vector3, rng: () => number = Math.random) {
    this.pos.copy(start)
    this.obstacles = buildObstacles()
    this.nodes = buildNodes(this.obstacles)
    this.rng = rng
  }

  faceTarget(target: THREE.Vector3) {
    this.yaw = Math.atan2(target.x - this.pos.x, target.z - this.pos.z)
  }

  distanceTo(p: THREE.Vector3) {
    return Math.hypot(p.x - this.pos.x, p.z - this.pos.z)
  }

  visibleAt(pos: THREE.Vector3, yaw: number, view: ViewInfo, out: THREE.Vector3[]) {
    creatureSamplePoints(pos, yaw, C.height, out)
    return isObserved(out, view, OCCLUDERS, C.viewMarginDeg, C.maxDetectDistance)
  }

  pathClear(a: THREE.Vector3, b: THREE.Vector3) {
    const a2 = new THREE.Vector3(a.x, 0.3, a.z)
    const b2 = new THREE.Vector3(b.x, 0.3, b.z)
    for (const box of this.obstacles) if (segmentHitsBox(a2, b2, box, 0.25)) return false
    return true
  }

  update(ctx: BrainContext): BrainEvent[] {
    const ev: BrainEvent[] = []
    if (this.attacked) return ev
    this.observed = this.visibleAt(this.pos, this.yaw, ctx.view, this.pts)
    const dist = this.distanceTo(ctx.playerPos)

    // Pending unseen attack (critical sound already played).
    if (this.pendingAttack >= 0) {
      if (ctx.time >= this.pendingAttack) {
        this.attacked = true
        ev.push({ type: 'attack', reason: 'unseen' })
      }
      return ev
    }

    // Walking straight into it while watching.
    this.proximity = this.observed ? THREE.MathUtils.clamp((C.proximityStart - dist) / (C.proximityStart - C.killDistanceObserved), 0, 1) : 0
    if (dist < C.killDistanceObserved) {
      this.attacked = true
      ev.push({ type: 'attack', reason: this.observed ? 'approach' : 'unseen' })
      return ev
    }
    if (!ctx.active) {
      this.unobservedTime = 0
      return ev
    }
    if (!this.observed && dist < C.killDistanceUnseen) {
      this.beginAttack(ctx, ev)
      return ev
    }

    if (this.observed) {
      this.unobservedTime = 0
      return ev
    }
    this.unobservedTime += ctx.dt
    if (this.unobservedTime < this.nextDelay || ctx.time - this.lastMoveTime < C.minMoveInterval) return ev

    const target = this.pickTarget(ctx, dist)
    if (!target) return ev
    const from = this.pos.clone()
    this.pos.copy(target)
    this.faceTarget(ctx.playerPos)
    this.moves++
    this.lastMoveTime = ctx.time
    this.unobservedTime = 0
    this.nextDelay = C.moveDelayMin + this.rng() * (C.moveDelayMax - C.moveDelayMin)
    ev.push({ type: 'moved', from, to: target.clone() })
    if (this.distanceTo(ctx.playerPos) < C.killDistanceUnseen) this.beginAttack(ctx, ev)
    return ev
  }

  private beginAttack(ctx: BrainContext, ev: BrainEvent[]) {
    this.pendingAttack = ctx.time + C.attackWarning
    ev.push({ type: 'attackWarning' })
  }

  // Choose the next hidden position: closer to the player, reachable, never in view.
  pickTarget(ctx: BrainContext, dist: number): THREE.Vector3 | null {
    const stepMax = C.stepMax + (ctx.aggressive ? C.aggressionStepBonus : 0)
    let best: THREE.Vector3 | null = null
    let bestScore = -Infinity
    for (const pass of [0, 1]) {
      const minProgress = pass === 0 ? C.progressMin : 0.25
      const maxStep = pass === 0 ? stepMax : stepMax + 0.8
      for (const n of this.nodes) {
        const d = this.distanceTo(n)
        if (d < C.stepMin * (pass === 0 ? 1 : 0.6) || d > maxStep) continue
        const dp = Math.hypot(n.x - ctx.playerPos.x, n.z - ctx.playerPos.z)
        const progress = dist - dp
        if (progress < minProgress) continue
        if (dp < 0.85) continue // never land inside the player
        if (ctx.dynamicPositions.some((q) => Math.hypot(q.x - n.x, q.z - n.z) < 0.42)) continue
        if (!this.pathClear(this.pos, n)) continue
        const yaw = Math.atan2(ctx.playerPos.x - n.x, ctx.playerPos.z - n.z)
        if (this.visibleAt(n, yaw, ctx.view, this.pts2)) continue
        // Prefer big progress, a little randomness, and spots behind the player.
        const toN = new THREE.Vector3(n.x - ctx.view.pos.x, 0, n.z - ctx.view.pos.z).normalize()
        const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(ctx.view.quat)
        fwd.y = 0
        fwd.normalize()
        const behind = -toN.dot(fwd) // 1 = directly behind
        const score = progress + behind * 0.6 + this.rng() * 0.5
        if (score > bestScore) {
          bestScore = score
          best = n
        }
      }
      if (best) break
    }
    return best
  }
}
