import { useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { INTERACTABLES } from '../config/layout'
import { useGame } from '../systems/GameState'
import { usePropScene } from '../scene/Environment'

// The battery pack on the far table. Flies toward the camera and vanishes when picked up.
export function Batteries() {
  const scene = usePropScene('batteries')
  const model = useMemo(() => scene.clone(true), [scene])
  const group = useRef<THREE.Group>(null)
  const glint = useRef<THREE.MeshBasicMaterial>(null)
  const { camera } = useThree()
  const anim = useRef({ t: -1, from: new THREE.Vector3() })
  const bp = INTERACTABLES.batteries

  useFrame((state, dt) => {
    const g = group.current
    if (!g) return
    const has = useGame.getState().hasBatteries
    if (has && anim.current.t < 0) {
      anim.current.t = 0
      anim.current.from.copy(g.position)
    }
    if (anim.current.t >= 0) {
      anim.current.t = Math.min(1, anim.current.t + dt / 0.35)
      const target = new THREE.Vector3(0.1, -0.25, -0.3).applyQuaternion(camera.quaternion).add(camera.position)
      g.position.lerpVectors(anim.current.from, target, anim.current.t)
      g.scale.setScalar(1 - anim.current.t * 0.6)
      g.visible = anim.current.t < 1
    }
    // A barely-there glint so the eye can find them in the dark.
    if (glint.current) glint.current.opacity = has ? 0 : 0.25 + 0.2 * Math.max(0, Math.sin(state.clock.elapsedTime * 1.7))
  })

  return (
    <group ref={group} position={[bp.pos[0], 0.868, bp.pos[2]]} rotation-y={bp.rotY}>
      <primitive object={model} />
      <mesh position={[0.02, 0.03, 0.03]}>
        <sphereGeometry args={[0.004, 6, 4]} />
        <meshBasicMaterial ref={glint} color="#e8f0f0" transparent opacity={0.3} toneMapped={false} />
      </mesh>
    </group>
  )
}
