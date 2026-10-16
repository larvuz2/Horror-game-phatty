import { useMemo } from 'react'
import * as THREE from 'three'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { ROOM, PILLARS, FIXTURES } from '../config/layout'
import { pbr } from './materials'

const W = ROOM.maxX - ROOM.minX
const L = ROOM.maxZ - ROOM.minZ
const HGT = ROOM.height

// Architectural shell: concrete floor, block walls, ceiling, pillars, steel beams, pipes and cables.
export function Room() {
  const mats = useMemo(() => {
    const floor = pbr('floor_concrete', [W / 3.2, L / 3.2], { normalScale: 1.1 })
    const wallLong = pbr('wall_block', [L / 2.4, HGT / 2.4], { normalScale: 1.2 })
    const wallShort = pbr('wall_block', [W / 2.4, HGT / 2.4], { normalScale: 1.2 })
    const ceiling = pbr('ceiling_concrete', [W / 3, L / 3], { normalScale: 1 })
    const pillar = pbr('wall_plaster', [0.5, HGT / 2], { normalScale: 1.2 })
    const beam = pbr('metal_painted', [6, 0.25], { metalness: 0.5, normalScale: 0.8 })
    const pipe = pbr('metal_rust', [8, 0.3], { metalness: 0.6 })
    const band = pbr('metal_painted', [L / 1.5, 0.12], { metalness: 0.2, color: new THREE.Color(0.55, 0.55, 0.52) })
    const cable = new THREE.MeshStandardMaterial({ color: '#0b0b0c', roughness: 0.55, metalness: 0 })
    const chain = new THREE.MeshStandardMaterial({ color: '#2a2b2c', roughness: 0.6, metalness: 0.8 })
    return { floor, wallLong, wallShort, ceiling, pillar, beam, pipe, band, cable, chain }
  }, [])

  const cables = useMemo(() => {
    const curves: THREE.Curve<THREE.Vector3>[] = []
    // From the electrical panel up the wall and along the ceiling to each fixture.
    curves.push(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-5.93, 1.75, -2.25),
        new THREE.Vector3(-5.93, 3.2, -2.25),
        new THREE.Vector3(-5.9, 3.86, -2.0),
        new THREE.Vector3(-4.5, 3.84, -1.0),
        new THREE.Vector3(-3.6, 3.84, 0.4),
      ]),
    )
    curves.push(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-5.9, 3.86, -2.0),
        new THREE.Vector3(-3.0, 3.78, -3.3),
        new THREE.Vector3(-1.0, 3.84, -4.0),
        new THREE.Vector3(0.0, 3.84, -4.0),
      ]),
    )
    curves.push(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-3.6, 3.84, 0.4),
        new THREE.Vector3(-1.5, 3.7, 2.2),
        new THREE.Vector3(0.5, 3.84, 4.3),
      ]),
    )
    curves.push(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0.5, 3.84, 4.3),
        new THREE.Vector3(2.0, 3.72, 2.3),
        new THREE.Vector3(3.6, 3.84, 0.4),
      ]),
    )
    // Loose cables drooping from the ceiling.
    curves.push(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(1.8, 3.9, -1.8),
        new THREE.Vector3(2.0, 2.9, -2.1),
        new THREE.Vector3(2.4, 3.1, -2.6),
        new THREE.Vector3(2.6, 3.9, -2.8),
      ]),
    )
    curves.push(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(-1.2, 3.9, 6.0),
        new THREE.Vector3(-1.3, 2.6, 6.2),
        new THREE.Vector3(-1.25, 2.35, 6.25),
      ]),
    )
    return curves.map((c) => new THREE.TubeGeometry(c, 48, 0.014, 6, false))
  }, [])

  const beamZs = [-6.5, -2.2, 2.2, 6.5]
  const pipeXs = [-5.2, -4.9, 4.95]

  return (
    <group>
      {/* Floor */}
      <mesh rotation-x={-Math.PI / 2} position={[0, 0, 0]} receiveShadow material={mats.floor}>
        <planeGeometry args={[W, L]} />
      </mesh>
      {/* Ceiling */}
      <mesh rotation-x={Math.PI / 2} position={[0, HGT, 0]} receiveShadow material={mats.ceiling}>
        <planeGeometry args={[W, L]} />
      </mesh>
      {/* Walls */}
      <mesh position={[0, HGT / 2, ROOM.minZ]} receiveShadow material={mats.wallShort}>
        <planeGeometry args={[W, HGT]} />
      </mesh>
      <mesh position={[0, HGT / 2, ROOM.maxZ]} rotation-y={Math.PI} receiveShadow material={mats.wallShort}>
        <planeGeometry args={[W, HGT]} />
      </mesh>
      <mesh position={[ROOM.minX, HGT / 2, 0]} rotation-y={Math.PI / 2} receiveShadow material={mats.wallLong}>
        <planeGeometry args={[L, HGT]} />
      </mesh>
      <mesh position={[ROOM.maxX, HGT / 2, 0]} rotation-y={-Math.PI / 2} receiveShadow material={mats.wallLong}>
        <planeGeometry args={[L, HGT]} />
      </mesh>

      {/* Painted band along the walls */}
      {[
        { p: [ROOM.minX + 0.012, 1.15, 0], r: Math.PI / 2, w: L },
        { p: [ROOM.maxX - 0.012, 1.15, 0], r: -Math.PI / 2, w: L },
        { p: [0, 1.15, ROOM.minZ + 0.012], r: 0, w: W },
        { p: [0, 1.15, ROOM.maxZ - 0.012], r: Math.PI, w: W },
      ].map((b, i) => (
        <mesh key={i} position={b.p as [number, number, number]} rotation-y={b.r} material={mats.band} receiveShadow>
          <planeGeometry args={[b.w, 0.09]} />
        </mesh>
      ))}

      {/* Pillars */}
      {PILLARS.map((p, i) => (
        <mesh key={i} position={[p.pos[0], HGT / 2, p.pos[1]]} castShadow receiveShadow material={mats.pillar}>
          <boxGeometry args={[p.size, HGT, p.size]} />
        </mesh>
      ))}

      {/* Steel I-beams across the ceiling */}
      {beamZs.map((z) => (
        <group key={z} position={[0, HGT, z]}>
          <mesh position={[0, -0.02, 0]} material={mats.beam} castShadow>
            <boxGeometry args={[W, 0.03, 0.16]} />
          </mesh>
          <mesh position={[0, -0.16, 0]} material={mats.beam} castShadow>
            <boxGeometry args={[W, 0.26, 0.02]} />
          </mesh>
          <mesh position={[0, -0.3, 0]} material={mats.beam} castShadow>
            <boxGeometry args={[W, 0.03, 0.16]} />
          </mesh>
        </group>
      ))}

      {/* Pipes along the ceiling (running north-south) */}
      {pipeXs.map((x, i) => (
        <mesh key={x} position={[x, HGT - 0.45 - i * 0.05, 0]} rotation-x={Math.PI / 2} material={mats.pipe} castShadow>
          <cylinderGeometry args={[0.06 - i * 0.012, 0.06 - i * 0.012, L, 12]} />
        </mesh>
      ))}

      {/* Electrical cables */}
      {cables.map((g, i) => (
        <mesh key={i} geometry={g} material={mats.cable} castShadow />
      ))}

      {/* Chains for the fluorescent fixtures */}
      {FIXTURES.map((f) =>
        [-0.5, 0.5].map((dz) => (
          <mesh key={`${f.id}${dz}`} position={[f.pos[0], (f.pos[1] + HGT) / 2 + 0.03, f.pos[2] + dz]} material={mats.chain}>
            <cylinderGeometry args={[0.005, 0.005, HGT - f.pos[1], 4]} />
          </mesh>
        )),
      )}

      {/* Colliders for the shell */}
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[W / 2 + 1, 0.5, L / 2 + 1]} position={[0, -0.5, 0]} />
        <CuboidCollider args={[W / 2 + 1, 0.5, L / 2 + 1]} position={[0, HGT + 0.5, 0]} />
        <CuboidCollider args={[0.5, HGT, L / 2 + 1]} position={[ROOM.minX - 0.5, HGT / 2, 0]} />
        <CuboidCollider args={[0.5, HGT, L / 2 + 1]} position={[ROOM.maxX + 0.5, HGT / 2, 0]} />
        <CuboidCollider args={[W / 2 + 1, HGT, 0.5]} position={[0, HGT / 2, ROOM.minZ - 0.5]} />
        <CuboidCollider args={[W / 2 + 1, HGT, 0.5]} position={[0, HGT / 2, ROOM.maxZ + 0.5]} />
        {PILLARS.map((p, i) => (
          <CuboidCollider key={i} args={[p.size / 2, HGT / 2, p.size / 2]} position={[p.pos[0], HGT / 2, p.pos[1]]} />
        ))}
      </RigidBody>
    </group>
  )
}
