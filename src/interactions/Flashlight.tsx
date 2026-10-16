import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { INTERACTABLES } from '../config/layout'
import { GAME_CONFIG, QUALITY_PRESETS } from '../config/gameConfig'
import { runtime, SIM } from '../systems/runtime'
import { useGame } from '../systems/GameState'
import { useSettings } from '../systems/SettingsManager'
import { input } from '../systems/Input'
import { audio } from '../systems/AudioManager'
import { usePropScene } from '../scene/Environment'
import { later } from './InteractionSystem'

const L = GAME_CONFIG.lighting
const HAND_OFFSET = new THREE.Vector3(0.19, -0.2, -0.36)

// Light cookie: hot center, a faint reflector ring and some lens grime.
function cookieTexture() {
  const s = 256
  const c = document.createElement('canvas')
  c.width = c.height = s
  const g = c.getContext('2d')!
  g.fillStyle = '#000'
  g.fillRect(0, 0, s, s)
  const grd = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2)
  grd.addColorStop(0, '#ffffff')
  grd.addColorStop(0.2, '#eeebe4')
  grd.addColorStop(0.34, '#b3b0a9')
  grd.addColorStop(0.42, '#c9c6be')
  grd.addColorStop(0.52, '#86847e')
  grd.addColorStop(0.8, '#3a3936')
  grd.addColorStop(1, '#000')
  g.fillStyle = grd
  g.fillRect(0, 0, s, s)
  // Smudges
  for (let i = 0; i < 40; i++) {
    const x = s / 2 + (Math.random() - 0.5) * s * 0.6
    const y = s / 2 + (Math.random() - 0.5) * s * 0.6
    const r = 4 + Math.random() * 18
    const sm = g.createRadialGradient(x, y, 0, x, y, r)
    sm.addColorStop(0, 'rgba(0,0,0,0.18)')
    sm.addColorStop(1, 'rgba(0,0,0,0)')
    g.fillStyle = sm
    g.fillRect(x - r, y - r, r * 2, r * 2)
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

const beamVertex = /* glsl */ `
  varying float vAlong;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  uniform float uLength;
  void main() {
    vAlong = clamp(-position.z / uLength, 0.0, 1.0);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vPosW = wp.xyz;
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`
const beamFragment = /* glsl */ `
  varying float vAlong;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  uniform float uIntensity;
  uniform float uTime;
  uniform vec3 uColor;
  float hash(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
    float n = mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
                  mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
    return n;
  }
  void main() {
    vec3 viewDir = normalize(cameraPosition - vPosW);
    float facing = abs(dot(viewDir, normalize(vNormalW)));
    float edge = pow(facing, 2.2);
    float falloff = pow(1.0 - vAlong, 1.8) * smoothstep(0.0, 0.08, vAlong);
    float n = 0.65 + 0.35 * noise(vPosW * 2.2 + vec3(0.0, uTime * 0.12, uTime * 0.05));
    float a = uIntensity * edge * falloff * n;
    gl_FragColor = vec4(uColor * a, a);
  }
`

export function Flashlight() {
  const scene = usePropScene('flashlight')
  const worldModel = useMemo(() => scene.clone(true), [scene])
  const heldModel = useMemo(() => {
    const m = scene.clone(true)
    // The flashlight in hand must never shadow its own beam.
    m.traverse((o) => {
      o.castShadow = false
      o.receiveShadow = false
    })
    return m
  }, [scene])
  const hand = useRef<THREE.Group>(null)
  const lightRef = useRef<THREE.SpotLight>(null)
  const beam = useRef<THREE.Mesh>(null)
  const worldRef = useRef<THREE.Group>(null)
  const { camera } = useThree()
  const quality = useSettings((s) => s.quality)
  const q = QUALITY_PRESETS[quality]
  const cookie = useMemo(() => cookieTexture(), [])
  const target = useMemo(() => new THREE.Object3D(), [])
  const st = useRef({
    pick: -1, // pickup animation progress (0..1), -1 = not started
    quat: new THREE.Quaternion(),
    pos: new THREE.Vector3(),
    flick: 0,
    nextFlicker: 4,
    askedTimer: -1,
    triedEmpty: false,
    noise: 0,
  })
  const beamLen = L.flashlightRange * 0.85
  const beamGeo = useMemo(() => {
    const r = Math.tan(L.flashlightAngle) * beamLen * 0.82
    const g = new THREE.CylinderGeometry(0.025, r, beamLen, 32, 1, true)
    g.translate(0, -beamLen / 2, 0)
    g.rotateX(Math.PI / 2)
    return g
  }, [beamLen])
  const beamMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: beamVertex,
        fragmentShader: beamFragment,
        uniforms: { uIntensity: { value: 0 }, uTime: { value: 0 }, uColor: { value: new THREE.Color(L.flashlightColor) }, uLength: { value: beamLen } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
        toneMapped: false,
      }),
    [beamLen],
  )

  useEffect(() => () => {
    beamGeo.dispose()
    beamMat.dispose()
    cookie.dispose()
  }, [beamGeo, beamMat, cookie])

  useEffect(() => {
    if (lightRef.current) {
      lightRef.current.target = target
      lightRef.current.map = cookie
    }
  }, [cookie, target])

  useFrame((state, rawDt) => {
    const dt = Math.min(rawDt, SIM.maxDt)
    const g = useGame.getState()
    const s = st.current
    const fl = runtime.flashlight
    const h = hand.current
    if (!h) return

    // Pickup animation: from the table into the hand.
    if (g.hasFlashlight && s.pick < 0) {
      s.pick = 0
      worldRef.current?.getWorldPosition(s.pos)
      s.quat.copy(worldRef.current?.getWorldQuaternion(new THREE.Quaternion()) ?? new THREE.Quaternion())
    }
    if (worldRef.current) worldRef.current.visible = !g.hasFlashlight
    h.visible = g.hasFlashlight && runtime.cinematic.kind !== 'death'

    // Target transform: camera-attached with a little lag (sway).
    const camQ = camera.quaternion
    const reduce = useSettings.getState().reduceMotion
    const lag = reduce ? 30 : 11
    const handTargetPos = HAND_OFFSET.clone().applyQuaternion(camQ).add(camera.position)
    if (s.pick >= 0 && s.pick < 1) {
      s.pick = Math.min(1, s.pick + dt / 0.65)
      const e = 1 - Math.pow(1 - s.pick, 3)
      h.position.lerpVectors(s.pos, handTargetPos, e)
      h.quaternion.slerpQuaternions(s.quat, camQ, e)
    } else if (s.pick >= 1) {
      h.quaternion.slerp(camQ, 1 - Math.exp(-lag * dt))
      const lagPos = HAND_OFFSET.clone().applyQuaternion(h.quaternion).add(camera.position)
      h.position.copy(lagPos)
    }

    // Toggle.
    const canUse = g.hasFlashlight && s.pick >= 1 && (g.phase === 'PLAYING') && !runtime.cinematic.kind
    // F, left click (while the mouse is captured) and the mobile button all do the same thing.
    if (canUse && (input.pressed('KeyF') || (input.clicked && document.pointerLockElement))) {
      if (!fl.powered) {
        audio.play('flashlight_click_empty', { volume: 0.8, bus: 'sfx', reverb: 0.1 })
        if (!s.triedEmpty) {
          s.triedEmpty = true
          g.pushMessage('NO BATTERIES', 'info', 2.6)
          later(g.runId, 2600, () => {
            const gg = useGame.getState()
            if (!gg.hasBatteries) {
              gg.setObjective('FIND_BATTERIES')
              gg.pushMessage('FIND THE BATTERIES', 'objective', 4)
            }
          })
        } else g.pushMessage('NO BATTERIES', 'info', 1.6)
      } else {
        fl.on = !fl.on
        g.set({ flashlightOn: fl.on })
        audio.play('flashlight_on', { volume: 0.7, reverb: 0.1, rate: fl.on ? 1 : 0.92 })
      }
    }
    // If the player never tries it, still move the objective along.
    if (g.hasFlashlight && !s.triedEmpty && !fl.powered && g.objective === 'FIND_FLASHLIGHT') {
      s.askedTimer += dt
      if (s.askedTimer > 7) {
        s.triedEmpty = true
        g.setObjective('FIND_BATTERIES')
        g.pushMessage('FIND THE BATTERIES', 'objective', 4)
      }
    }

    // Subtle intensity variation + rare weak-battery dip.
    s.nextFlicker -= dt
    if (s.nextFlicker <= 0) {
      s.flick = 0.18 + Math.random() * 0.25
      s.nextFlicker = 9 + Math.random() * 14
    }
    s.flick = Math.max(0, s.flick - dt)
    const dip = s.flick > 0 ? 0.55 + 0.45 * Math.abs(Math.sin(s.flick * 90)) : 1
    // Electrical interference: the light stutters when aimed at it, or when it is right behind you.
    const c = runtime.creature
    let interference = 0
    if (c.active && c.visible && c.state !== 'GONE') {
      const toC = c.headPos.clone().sub(camera.position)
      const dist = toC.length()
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion)
      const inBeam = toC.normalize().dot(fwd) > Math.cos(L.flashlightAngle * 1.2) ? 1 : 0
      interference = Math.max(inBeam * THREE.MathUtils.clamp((7 - dist) / 5, 0, 1), !c.observed ? THREE.MathUtils.clamp((3.2 - dist) / 2, 0, 1) : 0)
    }
    s.noise += dt * (18 + interference * 40)
    const stutter = interference > 0 ? 1 - interference * 0.75 * Math.max(0, Math.sin(s.noise) * Math.sin(s.noise * 2.7 + 1.3)) : 1
    fl.flicker = dip * stutter * (0.97 + Math.sin(state.clock.elapsedTime * 3.1) * 0.015)
    const on = fl.on && g.hasFlashlight && runtime.cinematic.kind !== 'death'
    const intensity = on ? L.flashlightIntensity * fl.flicker * (1 - runtime.lights.victory * 0.7) : 0

    // Light follows the lens.
    const light = lightRef.current
    if (light) {
      const lensWorld = new THREE.Vector3(0, 0.0, -0.13).applyQuaternion(h.quaternion).add(h.position)
      light.position.copy(lensWorld)
      const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(h.quaternion)
      target.position.copy(lensWorld).addScaledVector(fwd, 5)
      target.updateMatrixWorld()
      light.intensity = intensity
    }
    if (beam.current) {
      beam.current.visible = on && q.beam && !SIM.noBeam
      beamMat.uniforms.uIntensity.value = 0.03 * fl.flicker * (1 - runtime.lights.victory)
      beamMat.uniforms.uTime.value = state.clock.elapsedTime
    }
  }, -4)

  const fp = INTERACTABLES.flashlight
  return (
    <group>
      {/* On the table */}
      <group ref={worldRef} position={[fp.pos[0], 0.868, fp.pos[2]]} rotation={[0, fp.rotY, 0]}>
        <primitive object={worldModel} />
      </group>
      {/* In hand (world space, follows the camera) */}
      <group ref={hand} visible={false}>
        <group rotation-y={Math.PI}>
          <primitive object={heldModel} position={[0, -0.036, 0]} />
        </group>
        {/* The beam haze must never feed ambient occlusion: N8AO would treat the cone as solid and darken the room. */}
        <mesh ref={beam} userData={{ cannotReceiveAO: true }} geometry={beamGeo} material={beamMat} position={[0, 0, -0.14]} renderOrder={10} frustumCulled={false} />
      </group>
      <primitive object={target} />
      <spotLight
        ref={lightRef}
        angle={L.flashlightAngle}
        penumbra={0.5}
        distance={L.flashlightRange}
        decay={L.flashlightDecay}
        intensity={0}
        color={L.flashlightColor}
        castShadow
        shadow-mapSize={[q.flashlightShadow, q.flashlightShadow]}
        shadow-bias={-0.0006}
        shadow-normalBias={0.02}
        shadow-camera-near={0.1}
        shadow-camera-far={L.flashlightRange}
      />
    </group>
  )
}
