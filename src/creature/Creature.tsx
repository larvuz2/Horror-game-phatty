import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js'
import { runtime } from '../systems/runtime'
import { GAME_CONFIG } from '../config/gameConfig'

export const CREATURE_URL = `${import.meta.env.BASE_URL}models/creature/creature_main.glb`

type BoneMap = Record<string, THREE.Bone>

const X = new THREE.Vector3(1, 0, 0)
let HAND_TWIST = 1.57
export function setHandTwist(v: number) {
  HAND_TWIST = v
}
const Z = new THREE.Vector3(0, 0, 1)

function worldPos(o: THREE.Object3D) {
  return o.getWorldPosition(new THREE.Vector3())
}

// Rotate a bone around a WORLD axis (keeps the result in the bone's local quaternion).
function rotateWorld(bone: THREE.Object3D, axis: THREE.Vector3, angle: number) {
  const parentQ = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion()
  const qw = new THREE.Quaternion().setFromAxisAngle(axis, angle)
  const delta = parentQ.clone().invert().multiply(qw).multiply(parentQ)
  bone.quaternion.premultiply(delta)
  bone.updateMatrixWorld(true)
}

// Point a bone (its child) toward a world direction.
function aimBone(bone: THREE.Object3D, child: THREE.Object3D, dir: THREE.Vector3) {
  bone.updateMatrixWorld(true)
  const cur = worldPos(child).sub(worldPos(bone)).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize())
  const parentQ = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion()
  const delta = parentQ.clone().invert().multiply(q).multiply(parentQ)
  bone.quaternion.premultiply(delta)
  bone.updateMatrixWorld(true)
}

// Aim a bone's local axis toward a world direction (for end bones without children).
function aimAxis(bone: THREE.Object3D, localAxis: THREE.Vector3, dir: THREE.Vector3) {
  bone.updateMatrixWorld(true)
  const wq = bone.getWorldQuaternion(new THREE.Quaternion())
  const cur = localAxis.clone().applyQuaternion(wq).normalize()
  const q = new THREE.Quaternion().setFromUnitVectors(cur, dir.clone().normalize())
  const parentQ = bone.parent ? bone.parent.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion()
  bone.quaternion.premultiply(parentQ.clone().invert().multiply(q).multiply(parentQ))
  bone.updateMatrixWorld(true)
}

// Twist a bone around its own length axis (local +y).
function twist(bone: THREE.Object3D, angle: number) {
  bone.rotateY(angle)
  bone.updateMatrixWorld(true)
}

function glowTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 64
  const g = c.getContext('2d')!
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32)
  grd.addColorStop(0, 'rgba(255,60,50,1)')
  grd.addColorStop(0.25, 'rgba(255,23,23,0.55)')
  grd.addColorStop(1, 'rgba(120,0,0,0)')
  g.fillStyle = grd
  g.fillRect(0, 0, 64, 64)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

export interface CreatureRig {
  root: THREE.Group
  bones: BoneMap
  poseDown: Map<THREE.Bone, THREE.Quaternion>
  poseUp: Map<THREE.Bone, THREE.Quaternion>
  eyeMat: THREE.MeshBasicMaterial
  glowMat: THREE.SpriteMaterial
  eyeGeo: THREE.SphereGeometry
  bodyMat: THREE.MeshStandardMaterial
  headBone: THREE.Bone
}

export function buildCreatureRig(source: THREE.Object3D): CreatureRig {
  const model = cloneSkinned(source) as THREE.Group
  const root = new THREE.Group()
  root.add(model)
  root.updateMatrixWorld(true)

  const bones: BoneMap = {}
  let mesh: THREE.SkinnedMesh | null = null
  model.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone
    if ((o as THREE.SkinnedMesh).isSkinnedMesh) mesh = o as THREE.SkinnedMesh
  })
  const skinned = mesh as unknown as THREE.SkinnedMesh
  const b = (n: string) => bones[n]

  // --- Face mask (computed in bind pose): the whole head becomes a featureless void. ---
  // The mask is the skin weight of the Head bone (plus part of the neck), so it follows skinning.
  const head = b('Head'), neck = b('neck')
  // Meshy weights the face to 'headfront' and the skull top to 'head_end' (both children of Head).
  const headIdxs = new Set(['Head', 'headfront', 'head_end'].map((n) => skinned.skeleton.bones.indexOf(b(n))).filter((i) => i >= 0))
  const neckIdx = skinned.skeleton.bones.indexOf(neck)
  const geo = skinned.geometry
  type FaceData = { frontPoint: THREE.Vector3; headSize: number }
  let face = geo.userData.faceData as FaceData | undefined
  if (!face) {
    const posAttr = geo.getAttribute('position')
    const skinIdx = geo.getAttribute('skinIndex')
    const skinW = geo.getAttribute('skinWeight')
    const mask = new Float32Array(posAttr.count)
    const v = new THREE.Vector3()
    skinned.updateMatrixWorld(true)
    skinned.skeleton.update()
    const headPts: THREE.Vector3[] = []
    const hb = new THREE.Box3()
    for (let i = 0; i < posAttr.count; i++) {
      let wh = 0, wn = 0
      for (let k = 0; k < 4; k++) {
        const bi = skinIdx.getComponent(i, k)
        const w = skinW.getComponent(i, k)
        if (headIdxs.has(bi)) wh += w
        else if (bi === neckIdx) wn += w
      }
      mask[i] = THREE.MathUtils.clamp(wh * 1.15 + wn * 0.45, 0, 1)
      if (wh > 0.6) {
        skinned.getVertexPosition(i, v).applyMatrix4(skinned.matrixWorld)
        headPts.push(v.clone())
        hb.expandByPoint(v)
      }
    }
    // Eyes sit ~58% up the head, on the front surface.
    const hc = hb.getCenter(new THREE.Vector3())
    const eyeY = hb.min.y + (hb.max.y - hb.min.y) * 0.58
    let front = -Infinity
    for (const p of headPts) if (Math.abs(p.x - hc.x) < 0.03 && Math.abs(p.y - eyeY) < 0.025 && p.z > front) front = p.z
    if (!Number.isFinite(front)) front = hb.max.z
    geo.setAttribute('faceMask', new THREE.BufferAttribute(mask, 1))
    face = { frontPoint: new THREE.Vector3(hc.x, eyeY, front), headSize: hb.max.y - hb.min.y }
    geo.userData.faceData = face
  }
  const headSize = face.headSize
  const frontPoint = face.frontPoint.clone()

  // --- Material -------------------------------------------------------------------------
  const src = skinned.material as THREE.MeshStandardMaterial
  const bodyMat = new THREE.MeshStandardMaterial({
    map: src.map ?? null,
    normalMap: src.normalMap ?? null,
    color: new THREE.Color(3.4, 3.3, 3.2), // the Meshy albedo is ~1% linear; lift it to dark charcoal
    roughness: 0.92,
    metalness: 0,
  })
  bodyMat.normalScale.set(0.7, 0.7)
  bodyMat.userData.fade = { value: 1 }
  bodyMat.onBeforeCompile = (shader) => {
    shader.uniforms.uFade = bodyMat.userData.fade
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float faceMask;\nvarying float vFaceMask;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFaceMask = faceMask;')
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vFaceMask;\nuniform float uFade;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float lumC = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(vec3(lumC), diffuseColor.rgb, 0.4) * mix(1.0, 0.015, vFaceMask) * uFade;`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 1.0, vFaceMask);')
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\nreflectedLight.directSpecular *= (1.0 - vFaceMask);\nreflectedLight.indirectSpecular *= (1.0 - vFaceMask);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\nnormal = normalize(mix(normal, -normalize(vViewPosition), vFaceMask * 0.85));')
  }
  bodyMat.customProgramCacheKey = () => 'creature-v1'
  skinned.material = bodyMat
  skinned.castShadow = true
  skinned.receiveShadow = true
  skinned.frustumCulled = false

  // --- Eyes (children of the head bone) ------------------------------------------------
  const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.09, 0.09), transparent: true, opacity: 0, toneMapped: false, depthWrite: false, fog: false })
  const glowMat = new THREE.SpriteMaterial({ map: glowTexture(), color: '#ff1717', transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })
  const eyeGeo = new THREE.SphereGeometry(0.0105, 12, 8)
  for (const side of [-1, 1]) {
    const wp = frontPoint.clone().add(new THREE.Vector3(side * headSize * 0.13, 0, -0.012))
    const local = head.worldToLocal(wp.clone())
    const eye = new THREE.Mesh(eyeGeo, eyeMat)
    eye.position.copy(local)
    eye.scale.setScalar(1 / head.getWorldScale(new THREE.Vector3()).x)
    eye.renderOrder = 5
    head.add(eye)
    const glow = new THREE.Sprite(glowMat)
    glow.position.copy(local)
    glow.scale.setScalar(0.09 / head.getWorldScale(new THREE.Vector3()).x)
    glow.renderOrder = 6
    head.add(glow)
  }

  // --- Proportions: longer neck, arms and legs (stretch the skin between bones). --------
  const stretch = (name: string, f: number) => {
    const bn = b(name)
    if (bn) bn.position.multiplyScalar(f)
  }
  stretch('Head', 1.45)
  for (const s of ['Left', 'Right']) {
    stretch(`${s}ForeArm`, 1.2)
    stretch(`${s}Hand`, 1.25)
    stretch(`${s}Leg`, 1.05)
    stretch(`${s}Foot`, 1.05)
  }
  root.updateMatrixWorld(true)

  const allBones = Object.values(bones)
  const rest = new Map(allBones.map((bn) => [bn, bn.quaternion.clone()]))
  const capture = () => new Map(allBones.map((bn) => [bn, bn.quaternion.clone()]))
  const resetPose = () => {
    rest.forEach((q, bn) => bn.quaternion.copy(q))
    root.updateMatrixWorld(true)
  }

  const bodyPose = () => {
    rotateWorld(b('Spine02'), X, 0.06)
    rotateWorld(b('Spine01'), X, 0.07)
    rotateWorld(b('Spine'), X, 0.12)
    for (const [s, sx] of [['Left', 1], ['Right', -1]] as const) {
      rotateWorld(b(`${s}Shoulder`), Z, sx * -0.1)
      aimBone(b(`${s}Arm`), b(`${s}ForeArm`), new THREE.Vector3(sx * 0.16, -1, 0.04))
      aimBone(b(`${s}ForeArm`), b(`${s}Hand`), new THREE.Vector3(sx * 0.07, -1, 0.1))
      aimAxis(b(`${s}Hand`), new THREE.Vector3(0, 1, 0), new THREE.Vector3(sx * 0.04, -1, 0.06))
      twist(b(`${s}Hand`), sx * HAND_TWIST)
    }
  }

  resetPose()
  bodyPose()
  rotateWorld(b('neck'), X, 0.42)
  rotateWorld(b('Head'), X, 0.62)
  rotateWorld(b('Head'), Z, 0.12)
  const poseDown = capture()

  resetPose()
  bodyPose()
  rotateWorld(b('neck'), X, 0.12)
  rotateWorld(b('Head'), X, 0.12)
  rotateWorld(b('Head'), Z, -0.16)
  const poseUp = capture()

  // Normalize height (after stretching, head hanging).
  resetPose()
  poseDown.forEach((q, bn) => bn.quaternion.copy(q))
  root.updateMatrixWorld(true)
  const top = worldPos(b('head_end')).y
  const s = GAME_CONFIG.creature.height / Math.max(top + 0.12, 1)
  model.scale.multiplyScalar(s)
  root.updateMatrixWorld(true)

  return { root, bones, poseDown, poseUp, eyeMat, glowMat, eyeGeo, bodyMat, headBone: head }
}

// Smooth blend between the two authored poses.
export function applyRigPose(rig: CreatureRig, raise: number, breath: number) {
  const t = THREE.MathUtils.clamp(raise, 0, 1)
  rig.poseDown.forEach((qDown, bone) => {
    const qUp = rig.poseUp.get(bone)!
    bone.quaternion.copy(qDown).slerp(qUp, t)
  })
  if (breath !== 0) {
    const sp = rig.bones['Spine']
    if (sp) sp.rotateX(breath)
  }
}

export function Creature() {
  const gltf = useGLTF(CREATURE_URL)
  const rig = useMemo(() => buildCreatureRig(gltf.scene), [gltf])

  useEffect(() => {
    return () => {
      rig.bodyMat.dispose()
      rig.eyeMat.dispose()
      rig.glowMat.map?.dispose()
      rig.glowMat.dispose()
      rig.eyeGeo.dispose()
    }
  }, [rig])

  useFrame((state) => {
    const c = runtime.creature
    rig.root.position.copy(c.pos)
    rig.root.rotation.y = c.yaw
    rig.root.visible = c.visible
    // Almost imperceptible breathing (only while it waits).
    const breath = c.state === 'CINEMATIC' ? 0 : Math.sin(state.clock.elapsedTime * 0.9) * 0.004
    applyRigPose(rig, c.headRaise, breath)
    const g = c.eyeGlow
    rig.eyeMat.opacity = Math.min(1, g * 3)
    rig.eyeMat.color.setRGB(1, 0.09, 0.09).multiplyScalar(1 + g * 7)
    rig.glowMat.opacity = Math.min(1, g * 0.9)
    rig.bodyMat.userData.fade.value = c.bodyFade
    rig.root.updateMatrixWorld(true)
    rig.headBone.getWorldPosition(c.headPos)
  }, -1)

  return <primitive object={rig.root} />
}

useGLTF.preload(CREATURE_URL)
