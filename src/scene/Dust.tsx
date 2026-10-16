import { useMemo } from 'react'
import * as THREE from 'three'
import { useFrame, useThree } from '@react-three/fiber'
import { FIXTURES } from '../config/layout'
import { GAME_CONFIG } from '../config/gameConfig'
import { runtime } from '../systems/runtime'

const vertex = /* glsl */ `
  uniform float uTime;
  uniform vec3 uCam;
  uniform vec3 uBox;
  uniform vec3 uFlashPos;
  uniform vec3 uFlashDir;
  uniform float uFlashCos;
  uniform float uFlashOn;
  uniform vec3 uLampPos;
  uniform float uLamp;
  uniform float uPixelRatio;
  attribute float aSeed;
  varying float vLight;
  varying float vSeed;
  void main() {
    vec3 p = position;
    // Slow drift
    p += vec3(sin(uTime * 0.11 + aSeed * 6.0), sin(uTime * 0.07 + aSeed * 9.0) * 0.6 - uTime * 0.012, cos(uTime * 0.09 + aSeed * 4.0)) * 0.35;
    // Wrap the volume around the camera
    p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;
    p.y = clamp(p.y, 0.05, 3.9);
    vec3 toP = p - uFlashPos;
    float d = length(toP);
    float cone = smoothstep(uFlashCos, uFlashCos + 0.035, dot(toP / max(d, 1e-3), uFlashDir));
    float flash = uFlashOn * cone * (1.0 / (1.0 + d * d * 0.35)) * smoothstep(0.15, 0.6, d);
    vec3 toL = p - uLampPos;
    float lamp = uLamp * smoothstep(2.6, 0.0, length(toL.xz)) * smoothstep(-3.6, -0.3, toL.y) * 0.35;
    vLight = flash + lamp;
    vSeed = aSeed;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.4 + aSeed * 2.2) * uPixelRatio * (2.2 / max(-mv.z, 0.3));
  }
`
const fragment = /* glsl */ `
  varying float vLight;
  varying float vSeed;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(c));
    float alpha = a * vLight * (0.35 + vSeed * 0.5);
    if (alpha < 0.003) discard;
    gl_FragColor = vec4(vec3(1.0, 0.96, 0.9) * alpha, alpha);
  }
`

// Dust motes that only show up inside light: the flashlight cone and under the flickering tube.
export function Dust({ count }: { count: number }) {
  const { gl } = useThree()
  const { geo, mat } = useMemo(() => {
    const box = new THREE.Vector3(9, 4, 9)
    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * box.x
      pos[i * 3 + 1] = Math.random() * box.y
      pos[i * 3 + 2] = (Math.random() - 0.5) * box.z
      seed[i] = Math.random()
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    const mat = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uTime: { value: 0 },
        uCam: { value: new THREE.Vector3() },
        uBox: { value: box },
        uFlashPos: { value: new THREE.Vector3() },
        uFlashDir: { value: new THREE.Vector3(0, 0, -1) },
        uFlashCos: { value: Math.cos(GAME_CONFIG.lighting.flashlightAngle) },
        uFlashOn: { value: 0 },
        uLampPos: { value: new THREE.Vector3(...FIXTURES[0].pos) },
        uLamp: { value: 0 },
        uPixelRatio: { value: 1 },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    return { geo, mat }
  }, [count])

  useFrame((state) => {
    const u = mat.uniforms
    const cam = state.camera
    u.uTime.value = state.clock.elapsedTime
    u.uCam.value.copy(cam.position)
    u.uPixelRatio.value = gl.getPixelRatio()
    const fl = runtime.flashlight
    u.uFlashOn.value = fl.on && runtime.cinematic.kind !== 'death' ? fl.flicker * (1 - runtime.lights.victory) : 0
    u.uFlashPos.value.copy(cam.position)
    cam.getWorldDirection(u.uFlashDir.value)
    u.uLamp.value = (runtime.lights.fixtures.F1 ?? 0) * runtime.lights.master
  })

  return <points geometry={geo} material={mat} frustumCulled={false} renderOrder={9} />
}
