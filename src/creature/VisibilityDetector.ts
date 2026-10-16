import * as THREE from 'three'
import type { AABB } from '../config/layout'

export interface ViewInfo {
  pos: THREE.Vector3
  quat: THREE.Quaternion
  fovY: number // degrees, vertical
  aspect: number
}

const tmp = new THREE.Vector3()
const inv = new THREE.Quaternion()

export function viewFromCamera(cam: THREE.PerspectiveCamera, out?: ViewInfo): ViewInfo {
  cam.updateMatrixWorld()
  const v = out ?? { pos: new THREE.Vector3(), quat: new THREE.Quaternion(), fovY: cam.fov, aspect: cam.aspect }
  cam.getWorldPosition(v.pos)
  cam.getWorldQuaternion(v.quat)
  v.fovY = cam.fov
  v.aspect = cam.aspect
  return v
}

// Is the point inside the (margin-expanded) view frustum and within range?
export function pointInView(p: THREE.Vector3, view: ViewInfo, marginDeg: number, maxDist: number): boolean {
  tmp.copy(p).sub(view.pos)
  const dist = tmp.length()
  if (dist > maxDist) return false
  if (dist < 0.05) return true
  inv.copy(view.quat).invert()
  tmp.applyQuaternion(inv) // camera space, looking down -z
  const forward = -tmp.z
  if (forward <= 0.01) return false
  const vHalf = THREE.MathUtils.degToRad(view.fovY / 2)
  const hHalf = Math.atan(Math.tan(vHalf) * view.aspect)
  const m = THREE.MathUtils.degToRad(marginDeg)
  const ax = Math.atan2(Math.abs(tmp.x), forward)
  const ay = Math.atan2(Math.abs(tmp.y), forward)
  return ax <= hHalf + m && ay <= vHalf + m
}

// Segment vs AABB slab test.
export function segmentHitsBox(a: THREE.Vector3, b: THREE.Vector3, box: AABB, expand = 0): boolean {
  let tmin = 0
  let tmax = 1
  const d = [b.x - a.x, b.y - a.y, b.z - a.z]
  const o = [a.x, a.y, a.z]
  for (let i = 0; i < 3; i++) {
    const lo = box.min[i] - expand
    const hi = box.max[i] + expand
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < lo || o[i] > hi) return false
    } else {
      let t1 = (lo - o[i]) / d[i]
      let t2 = (hi - o[i]) / d[i]
      if (t1 > t2) [t1, t2] = [t2, t1]
      tmin = Math.max(tmin, t1)
      tmax = Math.min(tmax, t2)
      if (tmin > tmax) return false
    }
  }
  return true
}

export function segmentBlocked(a: THREE.Vector3, b: THREE.Vector3, occluders: AABB[]): boolean {
  for (const box of occluders) if (segmentHitsBox(a, b, box)) return true
  return false
}

// Sample points over the creature's silhouette (head, shoulders, torso, hands, knees, feet).
export function creatureSamplePoints(pos: THREE.Vector3, yaw: number, height: number, out: THREE.Vector3[] = []): THREE.Vector3[] {
  const s = height / 2.38
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw))
  const pts: [number, number][] = [
    [0, 2.28], // head
    [0, 2.05], // neck
    [-0.24, 1.88], // shoulders
    [0.24, 1.88],
    [0, 1.55], // chest
    [0, 1.1], // hips
    [-0.3, 0.95], // hands (arms hang low)
    [0.3, 0.95],
    [-0.12, 0.5], // knees
    [0.12, 0.5],
    [0, 0.1], // feet
  ]
  pts.forEach(([x, y], i) => {
    const p = out[i] ?? (out[i] = new THREE.Vector3())
    p.set(pos.x + right.x * x * s, pos.y + y * s, pos.z + right.z * x * s)
  })
  out.length = pts.length
  return out
}

// The creature counts as observed if ANY of its sample points is in view and not occluded.
export function isObserved(points: THREE.Vector3[], view: ViewInfo, occluders: AABB[], marginDeg: number, maxDist: number): boolean {
  for (const p of points) {
    if (pointInView(p, view, marginDeg, maxDist) && !segmentBlocked(view.pos, p, occluders)) return true
  }
  return false
}
