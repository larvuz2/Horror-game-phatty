import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { pointInView, segmentHitsBox, isObserved, creatureSamplePoints, type ViewInfo } from '../../src/creature/VisibilityDetector'
import { CreatureBrain } from '../../src/creature/CreatureAI'
import { OCCLUDERS } from '../../src/config/layout'
import { GAME_CONFIG } from '../../src/config/gameConfig'

// yaw 0 looks toward -z (same convention as the player controller)
function view(x: number, z: number, yaw: number, pitch = 0): ViewInfo {
  return {
    pos: new THREE.Vector3(x, 1.65, z),
    quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(pitch, yaw, 0, 'YXZ')),
    fovY: 62,
    aspect: 16 / 9,
  }
}

function seeded(seed = 7) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

describe('VisibilityDetector', () => {
  it('sees points in front and not behind', () => {
    const v = view(0, 0, 0)
    expect(pointInView(new THREE.Vector3(0, 1.6, -5), v, 0, 30)).toBe(true)
    expect(pointInView(new THREE.Vector3(0, 1.6, 5), v, 0, 30)).toBe(false)
  })

  it('respects the horizontal field of view and margin', () => {
    const v = view(0, 0, 0)
    const hHalf = Math.atan(Math.tan(THREE.MathUtils.degToRad(31)) * (16 / 9))
    const inside = new THREE.Vector3(Math.tan(hHalf - 0.05) * 5, 1.65, -5)
    const outside = new THREE.Vector3(Math.tan(hHalf + 0.05) * 5, 1.65, -5)
    expect(pointInView(inside, v, 0, 30)).toBe(true)
    expect(pointInView(outside, v, 0, 30)).toBe(false)
    expect(pointInView(outside, v, 7, 30)).toBe(true) // conservative margin counts it as seen
  })

  it('slab test detects segment/box hits', () => {
    const box = { min: [-1, 0, -1] as [number, number, number], max: [1, 2, 1] as [number, number, number] }
    expect(segmentHitsBox(new THREE.Vector3(-3, 1, 0), new THREE.Vector3(3, 1, 0), box)).toBe(true)
    expect(segmentHitsBox(new THREE.Vector3(-3, 3, 0), new THREE.Vector3(3, 3, 0), box)).toBe(false)
  })

  it('a pillar hides the creature completely', () => {
    // Occluders are deliberately shrunk, so only a close pillar fully hides it.
    const v = view(-2.3, 0.95, 0)
    const pts = creatureSamplePoints(new THREE.Vector3(-2.3, 0, -3.2), 0, GAME_CONFIG.creature.height)
    expect(isObserved(pts, v, OCCLUDERS, 7, 30)).toBe(false)
    expect(isObserved(pts, v, [], 7, 30)).toBe(true)
  })
})

describe('CreatureBrain', () => {
  const ctxBase = { dt: 0.05, active: true, aggressive: false, dynamicPositions: [] as THREE.Vector3[] }

  it('never moves while observed', () => {
    const brain = new CreatureBrain(new THREE.Vector3(0.6, 0, -7.1), seeded())
    const player = new THREE.Vector3(0.2, 0, 7.4)
    const v = view(0.2, 7.4, Math.atan2(-0.4, 14.5))
    for (let i = 0; i < 400; i++) {
      const ev = brain.update({ ...ctxBase, time: i * 0.05, playerPos: player, view: v })
      expect(ev.filter((e) => e.type === 'moved')).toHaveLength(0)
    }
    expect(brain.moves).toBe(0)
  })

  it('approaches when unobserved, only to hidden spots, and eventually attacks', () => {
    const brain = new CreatureBrain(new THREE.Vector3(0.6, 0, -7.1), seeded(3))
    const player = new THREE.Vector3(0.2, 0, 7.4)
    const v = view(0.2, 7.4, Math.PI) // facing the south wall
    let t = 0
    let firstMoveAt = -1
    let attacked = false
    let lastDist = brain.distanceTo(player)
    for (let i = 0; i < 1200 && !attacked; i++) {
      t += 0.05
      const ev = brain.update({ ...ctxBase, time: t, playerPos: player, view: v })
      for (const e of ev) {
        if (e.type === 'moved') {
          if (firstMoveAt < 0) firstMoveAt = t
          const d = brain.distanceTo(player)
          expect(d).toBeLessThan(lastDist)
          // It comes straight at the player (within a small sideways nudge).
          const mv = new THREE.Vector2(e.to.x - e.from.x, e.to.z - e.from.z).normalize()
          const toP = new THREE.Vector2(player.x - e.from.x, player.z - e.from.z).normalize()
          expect(mv.dot(toP)).toBeGreaterThan(Math.cos(THREE.MathUtils.degToRad(25)))
          expect(e.from.distanceTo(e.to)).toBeLessThanOrEqual(GAME_CONFIG.creature.stepMax + 0.81)
          const pts = creatureSamplePoints(e.to, brain.yaw, GAME_CONFIG.creature.height)
          expect(isObserved(pts, v, OCCLUDERS, GAME_CONFIG.creature.viewMarginDeg, 30)).toBe(false)
          lastDist = d
        }
        if (e.type === 'attack') attacked = true
      }
    }
    expect(firstMoveAt).toBeGreaterThanOrEqual(GAME_CONFIG.creature.firstMoveDelay)
    expect(attacked).toBe(true)
  })

  it('moves closer after every short look-away', () => {
    const brain = new CreatureBrain(new THREE.Vector3(0.6, 0, -7.1), seeded(5))
    const player = new THREE.Vector3(0.2, 0, 7.4)
    const away = view(0.2, 7.4, Math.PI)
    const toward = () => view(0.2, 7.4, Math.atan2(-(brain.pos.x - 0.2), -(brain.pos.z - 7.4)))
    let t = 0
    let last = brain.distanceTo(player)
    for (let glance = 0; glance < 4; glance++) {
      for (let i = 0; i < 24; i++) brain.update({ ...ctxBase, time: (t += 0.05), playerPos: player, view: away }) // 1.2 s away
      for (let i = 0; i < 20; i++) brain.update({ ...ctxBase, time: (t += 0.05), playerPos: player, view: toward() }) // look back
      const d = brain.distanceTo(player)
      expect(d).toBeLessThan(last - 1)
      last = d
    }
  })

  it('kills a player who walks into it while watching', () => {
    const brain = new CreatureBrain(new THREE.Vector3(0.6, 0, -7.1), seeded())
    const player = new THREE.Vector3(0.6, 0, -6.0)
    const v = view(0.6, -6.0, 0)
    const ev = brain.update({ ...ctxBase, time: 1, playerPos: player, view: v })
    expect(ev.some((e) => e.type === 'attack' && e.reason === 'approach')).toBe(true)
  })

  it('every creature node is inside the room and clear of obstacles', () => {
    const brain = new CreatureBrain(new THREE.Vector3(0.6, 0, -7.1))
    expect(brain.nodes.length).toBeGreaterThan(60)
    for (const n of brain.nodes) {
      expect(Math.abs(n.x)).toBeLessThan(6)
      expect(Math.abs(n.z)).toBeLessThan(9)
      for (const b of brain.obstacles) {
        const inside = n.x > b.min[0] && n.x < b.max[0] && n.z > b.min[2] && n.z < b.max[2]
        expect(inside).toBe(false)
      }
    }
  })
})
