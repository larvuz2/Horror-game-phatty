import { Suspense, useEffect, useState } from 'react'
import * as THREE from 'three'
import { Canvas, useThree } from '@react-three/fiber'
import { Physics } from '@react-three/rapier'
import { PerformanceMonitor, useProgress } from '@react-three/drei'
import { Room } from '../scene/Room'
import { Environment } from '../scene/Environment'
import { Lighting } from '../scene/Lighting'
import { Dust } from '../scene/Dust'
import { PostFX } from '../scene/PostFX'
import { PlayerController } from '../player/PlayerController'
import { Creature } from '../creature/Creature'
import { CreatureDirector } from '../creature/CreatureDirector'
import { Flashlight } from '../interactions/Flashlight'
import { Batteries } from '../interactions/Batteries'
import { ElectricalPanel } from '../interactions/ElectricalPanel'
import { InteractionSystem } from '../interactions/InteractionSystem'
import { DeathCinematic } from '../cinematics/DeathCinematic'
import { VictoryCinematic } from '../cinematics/VictoryCinematic'
import { Director } from '../systems/Director'
import { useGame } from '../systems/GameState'
import { useSettings } from '../systems/SettingsManager'
import { QUALITY_PRESETS } from '../config/gameConfig'
import { SIM } from '../systems/runtime'

function GameScene() {
  const quality = useSettings((s) => s.quality)
  const phase = useGame((s) => s.phase)
  const q = QUALITY_PRESETS[quality]
  return (
    <>
      <Physics gravity={[0, -9.81, 0]} timeStep={1 / 60} paused={phase === 'PAUSED' || phase === 'MAIN_MENU'}>
        <Room />
        <Environment />
        <ElectricalPanel />
        <PlayerController />
      </Physics>
      <Lighting />
      <Flashlight />
      <Batteries />
      <Creature />
      <CreatureDirector />
      <InteractionSystem />
      <DeathCinematic />
      <VictoryCinematic />
      <Director />
      <Dust count={q.dust} />
    </>
  )
}

// Compiles every shader once everything is mounted so the first frames don't hitch.
function Warmup() {
  const { gl, scene, camera } = useThree()
  const setReady = useGame((s) => s.set)
  useEffect(() => {
    let cancelled = false
    const id = requestAnimationFrame(async () => {
      try {
        const r = gl as THREE.WebGLRenderer & { compileAsync?: (s: THREE.Object3D, c: THREE.Camera) => Promise<unknown> }
        if (r.compileAsync) await r.compileAsync(scene, camera)
        else gl.compile(scene, camera)
      } catch (e) {
        console.warn('[warmup] compile failed', e)
      }
      if (!cancelled) setReady({ assetsReady: true })
    })
    return () => {
      cancelled = true
      cancelAnimationFrame(id)
    }
  }, [gl, scene, camera, setReady])
  return null
}

export function LoadingProgress({ onProgress }: { onProgress: (p: number) => void }) {
  const { progress } = useProgress()
  useEffect(() => onProgress(progress / 100), [progress, onProgress])
  return null
}

export function GameCanvas({ texturesReady }: { texturesReady: boolean }) {
  const runId = useGame((s) => s.runId)
  const phase = useGame((s) => s.phase)
  const quality = useSettings((s) => s.quality)
  const q = QUALITY_PRESETS[quality]
  const [dpr, setDpr] = useState(q.dpr[1])
  useEffect(() => setDpr(q.dpr[1]), [q.dpr])
  const active = phase !== 'MAIN_MENU' && phase !== 'PAUSED' && phase !== 'DEATH_SCREEN' && phase !== 'VICTORY_SCREEN'

  return (
    <Canvas
      className="game-canvas"
      shadows={{ type: THREE.PCFShadowMap }}
      dpr={SIM.dprOverride || dpr}
      frameloop={active ? 'always' : 'demand'}
      gl={{ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true }}
      camera={{ fov: 62, near: 0.05, far: 60, position: [0.2, 1.65, 7.4] }}
      onCreated={({ gl }) => {
        gl.toneMapping = SIM.noPost ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping
        gl.outputColorSpace = THREE.SRGBColorSpace
        gl.setClearColor('#000000')
      }}
    >
      <PerformanceMonitor
        bounds={() => [45, 75]}
        flipflops={4}
        onDecline={() => setDpr((d) => Math.max(q.dpr[0], +(d - 0.15).toFixed(2)))}
        onIncline={() => setDpr((d) => Math.min(q.dpr[1], +(d + 0.1).toFixed(2)))}
      />
      {texturesReady && (
        <Suspense fallback={null}>
          <GameScene key={runId} />
          {!SIM.noPost && <PostFX />}
          <Warmup />
        </Suspense>
      )}
    </Canvas>
  )
}
