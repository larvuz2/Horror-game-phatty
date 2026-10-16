import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { CuboidCollider, CylinderCollider, RigidBody, type RapierRigidBody } from '@react-three/rapier'
import { DECALS, INTERACTABLES, MODEL_SIZES, PROPS, SHELF_ITEMS, type ModelName, type PropInstance, type SoundMaterial } from '../config/layout'
import { harmonizeMaterial, tex } from './materials'
import { runtime } from '../systems/runtime'
import { audio } from '../systems/AudioManager'

export const modelUrl = (m: ModelName) => `${import.meta.env.BASE_URL}models/props/prop_${m}.glb`
export const ALL_MODELS = Object.keys(MODEL_SIZES) as ModelName[]

const TINTS: Partial<Record<ModelName, { desat?: number; gain?: number; roughMin?: number }>> = {
  barrel: { desat: 0.7, gain: 0.6 },
  bottle: { desat: 0.4, gain: 0.55, roughMin: 0.35 },
  box_cardboard: { desat: 0.45, gain: 0.7 },
  box_open: { desat: 0.45, gain: 0.7 },
  warning_sign: { desat: 0.45, gain: 0.7 },
  batteries: { desat: 0.5, gain: 0.8 },
  table_small: { desat: 0.4, gain: 0.7 },
}

// Returns a cloned scene graph (geometry/material shared) with shadows and harmonized materials.
export function usePropScene(model: ModelName) {
  const gltf = useGLTF(modelUrl(model))
  return useMemo(() => {
    gltf.scene.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.isMesh) {
        m.castShadow = true
        m.receiveShadow = true
        const mats = Array.isArray(m.material) ? m.material : [m.material]
        mats.forEach((mat) => harmonizeMaterial(mat, TINTS[model]))
      }
    })
    return gltf.scene
  }, [gltf, model])
}

function PropModel({ model, scale = 1 }: { model: ModelName; scale?: number }) {
  const scene = usePropScene(model)
  const clone = useMemo(() => scene.clone(true), [scene])
  return <primitive object={clone} scale={scale} />
}

// --- Physics feedback sounds -------------------------------------------------------------
const IMPACT: Record<SoundMaterial, string[]> = {
  wood: ['wood_knock'],
  metal: ['metal_clang', 'metal_knock'],
  metalLight: ['bucket_hit', 'can_roll'],
  cardboard: ['cardboard_shift'],
  plastic: ['bottle_hit'],
}
const SLIDE: Partial<Record<string, string>> = {
  chair_wood: 'chair_scrape',
  chair_metal: 'metal_chair_scrape',
  box_cardboard: 'cardboard_shift',
  box_open: 'cardboard_shift',
  paint_can: 'can_roll',
  bucket: 'can_roll',
  bottle: 'bottle_hit',
  pipe: 'metal_clang',
  trash_bin: 'metal_knock',
  toolbox: 'metal_knock',
}

function DynamicProp({ p }: { p: PropInstance }) {
  const body = useRef<RapierRigidBody>(null)
  const size = MODEL_SIZES[p.model].size.map((v) => v * (p.scale ?? 1))
  const lastSound = useRef(-10)
  const mass = p.mass ?? 2
  const settled = useRef(false)
  const tmp = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    const entry = {
      id: p.id,
      get: () => {
        const t = body.current?.translation()
        return t ? tmp.set(t.x, t.y, t.z) : tmp.set(...p.pos)
      },
    }
    runtime.dynamicBodies.push(entry)
    // Let things settle silently for the first moments of the run.
    const timer = setTimeout(() => (settled.current = true), 2500)
    return () => {
      clearTimeout(timer)
      runtime.dynamicBodies = runtime.dynamicBodies.filter((e) => e !== entry)
    }
  }, [p.id, p.pos, tmp])

  useFrame(() => {
    const b = body.current
    if (!b || !settled.current) return
    const v = b.linvel()
    const hs = Math.hypot(v.x, v.z)
    const now = performance.now() / 1000
    if (hs > 0.35 && Math.abs(v.y) < 0.4 && now - lastSound.current > 0.55) {
      const name = SLIDE[p.model]
      if (name) {
        const t = b.translation()
        audio.play(name, { pos: [t.x, t.y, t.z], volume: Math.min(1, 0.25 + hs * 0.6), rate: 0.9 + Math.random() * 0.2, refDistance: 1.2 })
        lastSound.current = now
      }
    }
  })

  const rotation = (p.rot ?? [0, p.rotY ?? 0, 0]) as [number, number, number]
  return (
    <RigidBody
      ref={body}
      type="dynamic"
      position={p.pos}
      rotation={rotation}
      colliders={false}
      linearDamping={0.6}
      angularDamping={0.9}
      canSleep
      ccd={mass < 0.5}
      onContactForce={(e) => {
        if (!settled.current) return
        const now = performance.now() / 1000
        const f = e.totalForceMagnitude / mass
        if (f > 60 && now - lastSound.current > 0.3) {
          const list = IMPACT[p.sound ?? 'wood']
          const t = body.current?.translation()
          if (t) audio.play(list[Math.floor(Math.random() * list.length)], { pos: [t.x, t.y, t.z], volume: Math.min(1, f / 600), rate: 0.85 + Math.random() * 0.3 })
          lastSound.current = now
        }
      }}
    >
      {p.collider === 'cylinder' ? (
        <CylinderCollider args={[size[1] / 2, Math.max(size[0], size[2]) / 2]} position={[0, size[1] / 2, 0]} mass={mass} friction={0.8} restitution={0.05} />
      ) : (
        <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} position={[0, size[1] / 2, 0]} mass={mass} friction={0.85} restitution={0.05} />
      )}
      <PropModel model={p.model} scale={p.scale} />
    </RigidBody>
  )
}

function StaticProp({ p }: { p: PropInstance }) {
  const size = MODEL_SIZES[p.model].size.map((v) => v * (p.scale ?? 1))
  const rotation = (p.rot ?? [0, p.rotY ?? 0, 0]) as [number, number, number]
  return (
    <RigidBody type="fixed" position={p.pos} rotation={rotation} colliders={false}>
      {p.collider === 'cylinder' ? (
        <CylinderCollider args={[size[1] / 2, Math.max(size[0], size[2]) / 2]} position={[0, size[1] / 2, 0]} friction={0.9} />
      ) : (
        <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} position={[0, size[1] / 2, 0]} friction={0.9} />
      )}
      <PropModel model={p.model} scale={p.scale} />
    </RigidBody>
  )
}

function DecorProp({ p }: { p: PropInstance }) {
  const rotation = (p.rot ?? [0, p.rotY ?? 0, 0]) as [number, number, number]
  return (
    <group position={p.pos} rotation={rotation}>
      <PropModel model={p.model} scale={p.scale} />
    </group>
  )
}

// Finds the shelf board heights of the shelf model by raycasting straight down through it.
function useShelfLevels() {
  const scene = usePropScene('shelf_tall')
  return useMemo(() => {
    scene.updateMatrixWorld(true)
    const rc = new THREE.Raycaster()
    const result = new Map<number, number[]>()
    for (const along of [-0.45, -0.4, -0.35, -0.3, -0.2, 0, 0.1, 0.2, 0.3, 0.35, 0.4, 0.45]) {
      rc.set(new THREE.Vector3(along, 3, 0), new THREE.Vector3(0, -1, 0))
      const hits = rc.intersectObject(scene, true).map((h) => h.point.y)
      const levels: number[] = []
      hits.sort((a, b) => a - b).forEach((y) => {
        if (!levels.length || y - levels[levels.length - 1] > 0.12) levels.push(y)
      })
      result.set(along, levels)
    }
    return result
  }, [scene])
}

function ShelfItems() {
  const levelsByAlong = useShelfLevels()
  const items = useMemo(() => {
    return SHELF_ITEMS.flatMap((it, i) => {
      const shelf = PROPS.find((p) => p.id === it.shelf)
      if (!shelf) return []
      const key = [...levelsByAlong.keys()].reduce((a, b) => (Math.abs(b - it.along) < Math.abs(a - it.along) ? b : a))
      const levels = levelsByAlong.get(key) ?? []
      // Skip the floor-level hit if the lowest board is basically the ground.
      const boards = levels.filter((y) => y > 0.05)
      const y = boards[Math.min(it.level, boards.length - 1)] ?? 0.1
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(...shelf.pos),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, shelf.rotY ?? 0, 0)),
        new THREE.Vector3(1, 1, 1),
      )
      const local = new THREE.Vector3(it.along, y + 0.002, (i % 2 ? 0.06 : -0.05))
      const world = local.applyMatrix4(m)
      return [{ ...it, world: world.toArray() as [number, number, number], rot: (shelf.rotY ?? 0) + it.rotY, key: i }]
    })
  }, [levelsByAlong])
  return (
    <>
      {items.map((it) => (
        <group key={it.key} position={it.world} rotation-y={it.rot}>
          <PropModel model={it.model} scale={it.scale} />
        </group>
      ))}
    </>
  )
}

function Decals() {
  const meshes = useRef<THREE.Mesh[]>([])
  const mats = useMemo(
    () =>
      DECALS.map(
        (d) =>
          new THREE.MeshStandardMaterial({
            map: tex(d.tex, { srgb: true }),
            transparent: true,
            opacity: d.victoryOnly ? 0 : d.opacity,
            depthWrite: false,
            polygonOffset: true,
            polygonOffsetFactor: -4,
            roughness: 0.9,
            metalness: 0,
          }),
      ),
    [],
  )
  useFrame(() => {
    const v = runtime.lights.victory
    DECALS.forEach((d, i) => {
      if (d.victoryOnly) mats[i].opacity = d.opacity * Math.min(1, v * 1.4)
    })
  })
  return (
    <>
      {DECALS.map((d, i) => (
        <mesh
          key={i}
          ref={(m) => {
            if (m) meshes.current[i] = m
          }}
          position={d.pos}
          rotation={d.rot}
          material={mats[i]}
          receiveShadow
          renderOrder={1}
        >
          <planeGeometry args={d.size} />
        </mesh>
      ))}
    </>
  )
}

function CagedBulb({ pos, wall = 'north' }: { pos: [number, number, number]; wall?: 'north' | 'south' }) {
  const metal = useMemo(() => new THREE.MeshStandardMaterial({ color: '#1d1f21', roughness: 0.5, metalness: 0.8 }), [])
  const glass = useRef<THREE.MeshStandardMaterial>(null)
  useFrame(() => {
    if (glass.current) glass.current.emissiveIntensity = 2.2 * runtime.lights.master * (wall === 'north' ? runtime.lights.practical : runtime.lights.cornerBulb)
  })
  const dir = wall === 'north' ? 1 : -1
  return (
    <group position={pos}>
      <mesh position={[0, 0, -0.06 * dir]} material={metal}>
        <boxGeometry args={[0.12, 0.16, 0.03]} />
      </mesh>
      <mesh position={[0, 0, 0.05 * dir]} rotation-x={Math.PI / 2} material={metal}>
        <cylinderGeometry args={[0.025, 0.03, 0.12, 8]} />
      </mesh>
      <mesh position={[0, -0.02, 0.13 * dir]}>
        <sphereGeometry args={[0.045, 16, 12]} />
        <meshStandardMaterial ref={glass} color="#222" emissive="#dfe8ec" emissiveIntensity={2} toneMapped={false} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <mesh key={i} position={[0, -0.02, 0.13 * dir]} rotation={[0, (i * Math.PI) / 4, 0]} material={metal}>
          <torusGeometry args={[0.07, 0.004, 4, 16]} />
        </mesh>
      ))}
    </group>
  )
}

function ExitSign() {
  const map = useMemo(() => {
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 96
    const g = c.getContext('2d')!
    g.fillStyle = '#1b1e1d'
    g.fillRect(0, 0, 256, 96)
    g.strokeStyle = '#3a3f3c'
    g.lineWidth = 6
    g.strokeRect(3, 3, 250, 90)
    g.fillStyle = '#4a5450'
    g.font = 'bold 64px Oswald, Arial Narrow, sans-serif'
    g.textAlign = 'center'
    g.textBaseline = 'middle'
    g.fillText('EXIT', 128, 52)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    return t
  }, [])
  const d = INTERACTABLES.door.pos
  return (
    <mesh position={[d[0], 2.55, -8.96]}>
      <boxGeometry args={[0.5, 0.19, 0.05]} />
      <meshStandardMaterial map={map} roughness={0.6} />
    </mesh>
  )
}

export function Environment() {
  return (
    <group>
      {PROPS.map((p) =>
        p.physics === 'dynamic' ? <DynamicProp key={p.id} p={p} /> : p.physics === 'static' ? <StaticProp key={p.id} p={p} /> : <DecorProp key={p.id} p={p} />,
      )}
      <ShelfItems />
      <Decals />
      <CagedBulb pos={[0.9, 2.75, -8.9]} wall="north" />
      <CagedBulb pos={[-4.6, 2.5, 8.9]} wall="south" />
      <ExitSign />
      {/* Exit door (static, locked) */}
      <RigidBody type="fixed" position={INTERACTABLES.door.pos} colliders={false}>
        <CuboidCollider args={[1.0, 1.15, 0.25]} position={[0, 1.15, 0]} />
        <PropModel model="door" />
      </RigidBody>
    </group>
  )
}

ALL_MODELS.forEach((m) => useGLTF.preload(modelUrl(m)))
