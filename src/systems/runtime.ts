import * as THREE from 'three'
import { PLAYER_START, CREATURE_START } from '../config/layout'

export type CreatureState = 'IDLE' | 'UNOBSERVED' | 'REPOSITIONING' | 'FROZEN' | 'ATTACKING' | 'CINEMATIC' | 'GONE'

// Mutable per-frame state shared between systems. Never put this in React state.
function fresh() {
  return {
    time: 0, // seconds of PLAYING time this run
    player: {
      pos: new THREE.Vector3(PLAYER_START.pos[0], 0, PLAYER_START.pos[2]),
      yaw: PLAYER_START.yaw,
      pitch: 0,
      speed: 0,
      speedFactor: 1, // slowed by the proximity event
      controlEnabled: false,
      lookEnabled: false,
      distanceWalked: 0,
      bob: 0,
    },
    creature: {
      pos: new THREE.Vector3(...CREATURE_START),
      yaw: Math.PI, // facing +z (toward the player start)
      state: 'IDLE' as CreatureState,
      active: false,
      observed: true,
      unobservedTime: 0,
      lastMoveTime: -10,
      moves: 0,
      distance: 99,
      headRaise: 0, // 0 = hanging, 1 = raised
      eyeGlow: 0,
      bodyFade: 1, // multiplies body lighting response (cinematic fade)
      visible: true,
      breath: 0,
      proximity: 0, // 0..1 observed approach intensity
      danger: 0, // 0..1 how close it is overall (audio)
      headPos: new THREE.Vector3(CREATURE_START[0], 2.1, CREATURE_START[2]), // written by the rig each frame
    },
    flashlight: {
      held: false,
      powered: false,
      on: false,
      flicker: 1,
    },
    lights: {
      fixtures: { F1: 1, F2: 0, F3: 0, F4: 0 } as Record<string, number>, // 0..1 emission per fixture
      practical: 1,
      cornerBulb: 1,
      ambient: 1, // multiplier on ambient fill
      master: 1, // global multiplier used by cinematics
      victory: 0, // 0..1 full illumination
      cinematicKey: 0,
      cinematicRim: 0,
      scripted: false, // when true, cinematics drive the fixtures directly
    },
    fx: {
      bloomBoost: 0,
      vignetteBoost: 0,
      aberration: 0,
      dofFocus: 0, // distance, 0 = disabled
      dofAmount: 0,
      fog: 1, // fog density multiplier
      shake: 0,
      exposure: 1,
    },
    interact: {
      target: null as string | null,
      holding: false,
      panelProgress: 0,
    },
    cinematic: { t: 0, kind: null as null | 'death' | 'victory' },
    dynamicBodies: [] as { id: string; get: () => THREE.Vector3 }[],
    camera: null as THREE.PerspectiveCamera | null,
  }
}

export type Runtime = ReturnType<typeof fresh>
export let runtime: Runtime = fresh()

export function resetRuntime() {
  const cam = runtime.camera
  runtime = fresh()
  runtime.camera = cam
  return runtime
}

// Simulation settings. Tests can raise maxDt (?maxdt=0.25) so slow software renderers still advance in real time.
const params = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
export const SIM = {
  maxDt: Math.min(0.5, Math.max(0.02, parseFloat(params.get('maxdt') ?? '') || 0.05)),
  dprOverride: parseFloat(params.get('dpr') ?? '') || 0,
  noPost: params.has('nopost'),
  debug: params.has('debug'),
  skipIntro: params.has('skipintro'),
}
