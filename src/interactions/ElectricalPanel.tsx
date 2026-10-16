import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { CuboidCollider, RigidBody } from '@react-three/rapier'
import { INTERACTABLES, MODEL_SIZES } from '../config/layout'
import { runtime } from '../systems/runtime'
import { useGame } from '../systems/GameState'
import { audio, type Voice } from '../systems/AudioManager'
import { usePropScene } from '../scene/Environment'
import { pbr } from '../scene/materials'

const LEVER_UP = -0.55
const LEVER_DOWN = 2.35

// Wall-mounted breaker panel with a heavy main lever. Lever angle follows runtime.interact.panelProgress.
export function ElectricalPanel() {
  const scene = usePropScene('electrical_panel')
  const model = useMemo(() => scene.clone(true), [scene])
  const lever = useRef<THREE.Group>(null)
  const led = useRef<THREE.MeshBasicMaterial>(null)
  const buzz = useRef<Voice | null>(null)
  const metal = useMemo(() => pbr('metal_painted', [0.3, 0.3], { metalness: 0.7, normalScale: 0.5 }), [])
  const grip = useMemo(() => new THREE.MeshStandardMaterial({ color: '#141414', roughness: 0.8 }), [])
  const p = INTERACTABLES.panel
  const size = MODEL_SIZES.electrical_panel.size

  useEffect(() => () => buzz.current?.stop(0.3), [])

  useFrame((state) => {
    const prog = runtime.interact.panelProgress
    const done = useGame.getState().objective === 'COMPLETED'
    if (lever.current) {
      const target = done ? LEVER_DOWN : LEVER_UP + (LEVER_DOWN - LEVER_UP) * 0.45 * prog
      lever.current.rotation.x += (target - lever.current.rotation.x) * (done ? 0.5 : 0.25)
    }
    if (led.current) {
      const blink = Math.sin(state.clock.elapsedTime * 2.2) > 0.6 ? 1 : 0.15
      led.current.color.setRGB(0.9, 0.75, 0.45).multiplyScalar(done ? 0 : blink * 3.5)
    }
    const phase = useGame.getState().phase
    if (audio.ready && !buzz.current && phase === 'PLAYING') {
      buzz.current = audio.play('panel_buzz', { pos: [p.pos[0] + 0.25, p.pos[1] + 0.5, p.pos[2]], loop: true, volume: 0.6, bus: 'amb', refDistance: 1, rolloff: 1.6 })
    }
    if (buzz.current && done) {
      buzz.current.stop(1)
      buzz.current = null
    }
  })

  return (
    <group position={p.pos} rotation-y={p.rotY}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[size[0] / 2, size[1] / 2, size[2] / 2]} position={[0, size[1] / 2, 0]} />
      </RigidBody>
      <primitive object={model} />
      {/* Lever on the right side */}
      <group position={[size[0] / 2 + 0.05, size[1] * 0.55, size[2] * 0.15]}>
        <mesh rotation-z={Math.PI / 2} material={metal} castShadow>
          <cylinderGeometry args={[0.045, 0.045, 0.07, 16]} />
        </mesh>
        <mesh position={[-0.03, 0, 0]} material={metal}>
          <boxGeometry args={[0.03, 0.16, 0.12]} />
        </mesh>
        <group ref={lever} rotation-x={LEVER_UP}>
          <mesh position={[0.045, 0.17, 0]} material={metal} castShadow>
            <boxGeometry args={[0.025, 0.34, 0.035]} />
          </mesh>
          <mesh position={[0.045, 0.36, 0]} rotation-z={Math.PI / 2} material={grip} castShadow>
            <cylinderGeometry args={[0.022, 0.022, 0.12, 12]} />
          </mesh>
        </group>
      </group>
      {/* Status lamp */}
      <mesh position={[-size[0] * 0.3, size[1] * 0.92, size[2] / 2 + 0.005]}>
        <sphereGeometry args={[0.013, 10, 8]} />
        <meshBasicMaterial ref={led} color="#e6c070" toneMapped={false} />
      </mesh>
    </group>
  )
}
