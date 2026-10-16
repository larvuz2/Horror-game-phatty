import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { CORNER_BULB, FIXTURES, PRACTICAL, STAGE } from '../config/layout'
import { GAME_CONFIG, QUALITY_PRESETS } from '../config/gameConfig'
import { runtime, SIM } from '../systems/runtime'
import { useSettings } from '../systems/SettingsManager'
import { useGame } from '../systems/GameState'
import { audio, type Voice } from '../systems/AudioManager'
import { pbr } from './materials'

const L = GAME_CONFIG.lighting

type FixtureDef = (typeof FIXTURES)[number]

function Fixture({ f, shadow, register }: { f: FixtureDef; shadow: boolean; register: (id: string, o: FixtureRefs) => void }) {
  const spot = useRef<THREE.SpotLight>(null)
  const fill = useRef<THREE.PointLight>(null)
  const tubeMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: '#1a1c1c', emissive: new THREE.Color(L.fluorescentColor), emissiveIntensity: 0, roughness: 0.3, toneMapped: false }),
    [],
  )
  const housing = useMemo(() => pbr('metal_painted', [1, 0.2], { metalness: 0.6, normalScale: 0.6 }), [])
  const reflector = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8d9493', roughness: 0.45, metalness: 0.2 }), [])
  const target = useMemo(() => {
    const o = new THREE.Object3D()
    o.position.set(f.pos[0], 0, f.pos[2])
    return o
  }, [f.pos])

  useEffect(() => {
    if (spot.current) spot.current.target = target
    register(f.id, { spot: spot.current, fill: fill.current, tubeMat })
  }, [f.id, register, target, tubeMat])

  return (
    <group>
      <primitive object={target} />
      <group position={f.pos}>
        <mesh material={housing} castShadow>
          <boxGeometry args={[0.22, 0.07, 1.28]} />
        </mesh>
        <mesh position={[0, -0.036, 0]} rotation-x={Math.PI / 2} material={reflector}>
          <planeGeometry args={[0.2, 1.24]} />
        </mesh>
        {[-0.05, 0.05].map((x) => (
          <mesh key={x} position={[x, -0.06, 0]} rotation-x={Math.PI / 2} material={tubeMat}>
            <cylinderGeometry args={[0.016, 0.016, 1.18, 10]} />
          </mesh>
        ))}
      </group>
      <spotLight
        ref={spot}
        position={[f.pos[0], f.pos[1] - 0.08, f.pos[2]]}
        angle={1.32}
        penumbra={0.75}
        distance={16}
        decay={2}
        intensity={0}
        color={L.fluorescentColor}
        castShadow={shadow}
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-near={0.3}
        shadow-camera-far={14}
      />
      {(f.id === 'F1' || f.id === 'F2') && (
        <pointLight ref={fill} position={[f.pos[0], f.pos[1] - 0.25, f.pos[2]]} intensity={0} distance={9} decay={2} color={L.fluorescentColor} />
      )}
    </group>
  )
}

interface FixtureRefs {
  spot: THREE.SpotLight | null
  fill: THREE.PointLight | null
  tubeMat: THREE.MeshStandardMaterial
}

// Procedural flicker generator for a failing fluorescent tube.
class Flicker {
  level = 1
  private t = 0
  private next = 1.5
  private seq: { level: number; dur: number }[] = []
  constructor(
    private mode: 'flicker' | 'broken' | 'dead',
    private onEvent: () => void,
  ) {
    this.level = mode === 'flicker' ? 0.95 : 0
    this.next = mode === 'broken' ? 6 + Math.random() * 4 : 2 + Math.random() * 2
  }
  update(dt: number) {
    if (this.mode === 'dead') return (this.level = 0)
    this.t += dt
    if (this.seq.length) {
      const s = this.seq[0]
      s.dur -= dt
      this.level = s.level
      if (s.dur <= 0) this.seq.shift()
      return this.level
    }
    if (this.t >= this.next) {
      this.t = 0
      this.onEvent()
      if (this.mode === 'flicker') {
        const n = 3 + Math.floor(Math.random() * 7)
        for (let i = 0; i < n; i++) {
          this.seq.push({ level: Math.random() < 0.5 ? 0.02 : 0.35 + Math.random() * 0.4, dur: 0.025 + Math.random() * 0.1 })
          this.seq.push({ level: 0.7 + Math.random() * 0.3, dur: 0.02 + Math.random() * 0.12 })
        }
        if (Math.random() < 0.18) this.seq.push({ level: 0.0, dur: 0.6 + Math.random() * 0.9 })
        this.next = 2.5 + Math.random() * 6
      } else {
        const n = 2 + Math.floor(Math.random() * 4)
        for (let i = 0; i < n; i++) {
          this.seq.push({ level: 0.55 + Math.random() * 0.45, dur: 0.03 + Math.random() * 0.07 })
          this.seq.push({ level: 0, dur: 0.04 + Math.random() * 0.15 })
        }
        this.next = 8 + Math.random() * 10
      }
      return this.level
    }
    // Steady state: subtle mains shimmer.
    this.level = this.mode === 'flicker' ? 0.9 + Math.sin(this.t * 37) * 0.015 + (Math.random() - 0.5) * 0.02 : 0
    return this.level
  }
}

export function Lighting() {
  const quality = useSettings((s) => s.quality)
  const q = QUALITY_PRESETS[quality]
  const fixtures = useRef(new Map<string, FixtureRefs>())
  const practical = useRef<THREE.SpotLight>(null)
  const corner = useRef<THREE.SpotLight>(null)
  const wash = useRef<THREE.PointLight>(null)
  const hemi = useRef<THREE.HemisphereLight>(null)
  const key = useRef<THREE.SpotLight>(null)
  const rim = useRef<THREE.SpotLight>(null)
  const { scene } = useThree()
  const hum = useRef<Voice | null>(null)

  const targets = useMemo(() => {
    const mk = (p: readonly number[]) => {
      const o = new THREE.Object3D()
      o.position.set(p[0], p[1], p[2])
      return o
    }
    return {
      practical: mk(PRACTICAL.target),
      corner: mk(CORNER_BULB.target),
      key: mk([STAGE.pos[0], 2.1, STAGE.pos[2]]),
      rim: mk([STAGE.pos[0], 1.9, STAGE.pos[2]]),
    }
  }, [])

  const flickers = useMemo(() => {
    const m = new Map<string, Flicker>()
    for (const f of FIXTURES) {
      m.set(
        f.id,
        new Flicker(f.mode, () => {
          const ph = useGame.getState().phase
          if (ph === 'PLAYING' || ph === 'INTRO') audio.play('fluorescent_flicker', { pos: f.pos, volume: f.mode === 'broken' ? 0.7 : 0.45, rate: 0.9 + Math.random() * 0.2 })
        }),
      )
    }
    return m
  }, [])

  useEffect(() => {
    if (practical.current) practical.current.target = targets.practical
    if (corner.current) corner.current.target = targets.corner
    if (key.current) key.current.target = targets.key
    if (rim.current) rim.current.target = targets.rim
  }, [targets])

  useEffect(() => {
    scene.fog = new THREE.FogExp2('#050607', 0.048)
    return () => {
      scene.fog = null
    }
  }, [scene])

  useEffect(() => {
    return () => hum.current?.stop(0.3)
  }, [])

  const register = useMemo(() => (id: string, o: FixtureRefs) => fixtures.current.set(id, o), [])

  useFrame((_, dt) => {
    const lr = runtime.lights
    const phase = useGame.getState().phase
    const animate = phase !== 'PAUSED'
    if (!lr.scripted && animate) {
      for (const f of FIXTURES) lr.fixtures[f.id] = flickers.get(f.id)!.update(Math.min(dt, SIM.maxDt))
    }
    const master = lr.master
    for (const f of FIXTURES) {
      const refs = fixtures.current.get(f.id)
      if (!refs) continue
      const lvl = lr.fixtures[f.id] ?? 0
      const victoryBoost = 1 + lr.victory * 0.4
      if (refs.spot) refs.spot.intensity = L.fluorescentIntensity * lvl * master * victoryBoost
      if (refs.fill) refs.fill.intensity = L.fluorescentIntensity * 0.3 * lvl * master
      refs.tubeMat.emissiveIntensity = 2.6 * lvl * master
    }
    if (practical.current) practical.current.intensity = L.practicalIntensity * lr.practical * master * (1 - lr.victory)
    if (wash.current) wash.current.intensity = 1.6 * lr.practical * master * (1 - lr.victory)
    if (corner.current) corner.current.intensity = 4.2 * lr.cornerBulb * master * (1 - lr.victory)
    if (hemi.current) hemi.current.intensity = (L.ambientIntensity * lr.ambient * master) + L.victoryAmbient * lr.victory
    if (key.current) key.current.intensity = 40 * lr.cinematicKey
    if (rim.current) rim.current.intensity = 70 * lr.cinematicRim

    // Fog density follows cinematics; lighter once the power is back.
    const fog = scene.fog as THREE.FogExp2 | null
    if (fog) fog.density = 0.048 * runtime.fx.fog * (1 - lr.victory * 0.6)

    // Fluorescent hum tracks F1's state.
    if (audio.ready) {
      if (!hum.current && (phase === 'PLAYING' || phase === 'INTRO')) {
        hum.current = audio.play('fluorescent_hum', { pos: FIXTURES[0].pos, loop: true, volume: 0, bus: 'amb', refDistance: 2, rolloff: 1 })
      }
      if (hum.current) {
        const lvl = lr.fixtures.F1 ?? 0
        // The hum drains away as you stand face to face with it (proximity event).
        const duck = 1 - runtime.creature.proximity * 0.85
        const target = phase === 'PLAYING' || phase === 'INTRO' || phase === 'VICTORY_CINEMATIC' ? 0.55 * lvl * master * duck + lr.victory * 0.4 : 0
        hum.current.setVolume(target, 0.05)
      }
    }
  })

  return (
    <group>
      {FIXTURES.map((f) => (
        <Fixture key={f.id} f={f} shadow={f.shadow && q.fluorescentShadow} register={register} />
      ))}
      <primitive object={targets.practical} />
      <primitive object={targets.corner} />
      <primitive object={targets.key} />
      <primitive object={targets.rim} />
      <spotLight
        ref={practical}
        position={[PRACTICAL.pos[0], PRACTICAL.pos[1] - 0.05, PRACTICAL.pos[2] + 0.18]}
        angle={1.0}
        penumbra={0.85}
        distance={16}
        decay={2}
        intensity={L.practicalIntensity}
        color="#b7c4cb"
        castShadow={q.practicalShadow}
        shadow-mapSize={[q.shadowMap, q.shadowMap]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-camera-near={0.2}
        shadow-camera-far={16}
      />
      <pointLight ref={wash} position={[PRACTICAL.pos[0], PRACTICAL.pos[1] + 0.05, PRACTICAL.pos[2] + 0.3]} intensity={1.6} distance={5} decay={2} color="#b7c4cb" />
      <spotLight ref={corner} position={[CORNER_BULB.pos[0], CORNER_BULB.pos[1] - 0.05, CORNER_BULB.pos[2] - 0.18]} angle={0.9} penumbra={0.9} distance={6} decay={2} intensity={4} color="#c3ccd0" />
      <hemisphereLight ref={hemi} args={['#3d4650', '#0a0a0b', L.ambientIntensity]} />
      <spotLight ref={key} position={[STAGE.pos[0] + 0.35, 3.75, STAGE.pos[2] + 1.0]} angle={0.42} penumbra={0.9} distance={8} decay={2} intensity={0} color="#aebbc4" />
      <spotLight ref={rim} position={[STAGE.pos[0] + 0.9, 3.4, STAGE.pos[2] - 2.6]} angle={0.55} penumbra={0.8} distance={8} decay={2} intensity={0} color="#8c9aa6" />
    </group>
  )
}
