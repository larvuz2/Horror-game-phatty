import * as THREE from 'three'

const loader = new THREE.TextureLoader()
const cache = new Map<string, THREE.Texture>()
const base = import.meta.env.BASE_URL

export function tex(name: string, opts: { srgb?: boolean; repeat?: [number, number]; anisotropy?: number } = {}) {
  const key = `${name}|${opts.repeat?.join('x') ?? ''}`
  const hit = cache.get(key)
  if (hit) return hit
  let t: THREE.Texture
  const root = cache.get(name)
  if (root) t = root.clone()
  else {
    t = loader.load(`${base}textures/${name}.webp`)
    cache.set(name, t)
  }
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
  t.anisotropy = opts.anisotropy ?? 8
  if (opts.repeat) t.repeat.set(...opts.repeat)
  t.needsUpdate = true
  cache.set(key, t)
  return t
}

// Preload every texture used by the room so the loading screen can wait for them.
export const TEXTURE_SETS = ['floor_concrete', 'wall_block', 'wall_plaster', 'ceiling_concrete', 'metal_painted', 'metal_rust', 'wood_dirty'] as const
export const DECAL_TEXTURES = ['decal_oil', 'decal_water', 'decal_grime', 'decal_cracks', 'decal_footprints'] as const

export function preloadTextures(onProgress?: (p: number) => void) {
  const names = [
    ...TEXTURE_SETS.flatMap((s) => [`${s}_albedo`, `${s}_normal`, `${s}_rough`]),
    ...DECAL_TEXTURES,
  ]
  let done = 0
  return Promise.all(
    names.map(
      (n) =>
        new Promise<void>((resolve) => {
          const t = loader.load(
            `${base}textures/${n}.webp`,
            () => {
              done++
              onProgress?.(done / names.length)
              resolve()
            },
            undefined,
            () => {
              done++
              onProgress?.(done / names.length)
              resolve()
            },
          )
          t.wrapS = t.wrapT = THREE.RepeatWrapping
          cache.set(n, t)
        }),
    ),
  )
}

export function pbr(
  set: (typeof TEXTURE_SETS)[number],
  repeat: [number, number],
  extra: Omit<Partial<THREE.MeshStandardMaterialParameters>, 'normalScale'> & { normalScale?: number } = {},
) {
  const { normalScale = 1, ...rest } = extra
  const m = new THREE.MeshStandardMaterial({
    map: tex(`${set}_albedo`, { srgb: true, repeat }),
    normalMap: tex(`${set}_normal`, { repeat }),
    roughnessMap: tex(`${set}_rough`, { repeat }),
    roughness: 1,
    metalness: 0,
    ...rest,
  })
  m.normalScale.set(normalScale, normalScale)
  return m
}

// Unifies AI-generated prop materials so the room reads as one art-directed space:
// desaturate, darken, clamp roughness so nothing looks like plastic.
export function harmonizeMaterial(mat: THREE.Material, opts: { desat?: number; gain?: number; roughMin?: number; tint?: [number, number, number] } = {}) {
  const m = mat as THREE.MeshStandardMaterial
  if (!m.isMeshStandardMaterial || m.userData.harmonized) return
  m.userData.harmonized = true
  const desat = opts.desat ?? 0.35
  const gain = opts.gain ?? 0.85
  const roughMin = opts.roughMin ?? 0.42
  if (opts.tint) m.color.setRGB(...opts.tint)
  m.envMapIntensity = 0.0
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDesat = { value: desat }
    shader.uniforms.uGain = { value: gain }
    shader.uniforms.uRoughMin = { value: roughMin }
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uDesat; uniform float uGain; uniform float uRoughMin;')
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        float lumH = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lumH), uDesat) * uGain;`,
      )
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = max(roughnessFactor, uRoughMin);')
  }
  m.customProgramCacheKey = () => `harm-${desat}-${gain}-${roughMin}`
  m.needsUpdate = true
}
