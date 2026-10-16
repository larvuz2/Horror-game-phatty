// Cleans up raw Tripo GLBs into game-ready props:
// - simplify geometry, weld, dedup, prune
// - resize + WebP-compress textures
// - normalize real-world size (meters), orientation and put the pivot at the bottom-center
// - meshopt compression
// Writes public/models/props/<name>.glb and src/config/models.json (dimensions for colliders).
import fs from 'node:fs'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, weld, simplify, textureCompress, getBounds, meshopt, resample } from '@gltf-transform/functions'
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const RAW = path.join(ROOT, 'raw/props')
const OUT = path.join(ROOT, 'public/models/props')
const MANIFEST = path.join(ROOT, 'src/config/models.json')

// name: { fit: 'height' | 'max', size: meters, ratio: simplify ratio, tex: texture size, rotY: degrees, rotX }
export const SPECS = {
  chair_wood: { fit: 'height', size: 0.92, ratio: 0.5, tex: 1024 },
  chair_metal: { fit: 'height', size: 0.86, ratio: 0.5, tex: 1024 },
  table_small: { fit: 'max', size: 1.2, ratio: 0.5, tex: 1024 },
  desk_metal: { fit: 'max', size: 1.5, ratio: 0.5, tex: 1024 },
  shelf_tall: { fit: 'height', size: 2.2, ratio: 0.6, tex: 1024 },
  cabinet: { fit: 'height', size: 1.85, ratio: 0.5, tex: 1024 },
  box_cardboard: { fit: 'max', size: 0.5, ratio: 0.4, tex: 512 },
  box_open: { fit: 'max', size: 0.45, ratio: 0.4, tex: 512 },
  bucket: { fit: 'height', size: 0.35, ratio: 0.4, tex: 512 },
  paint_can: { fit: 'height', size: 0.25, ratio: 0.4, tex: 512 },
  bottle: { fit: 'max', size: 0.25, ratio: 0.4, tex: 512 },
  pallet: { fit: 'max', size: 1.2, ratio: 0.5, tex: 1024 },
  barrel: { fit: 'height', size: 0.9, ratio: 0.5, tex: 1024 },
  trash_bin: { fit: 'height', size: 0.7, ratio: 0.5, tex: 512 },
  wall_clock: { fit: 'max', size: 0.32, ratio: 0.5, tex: 512 },
  fluorescent: { fit: 'max', size: 1.25, ratio: 0.5, tex: 512 },
  electrical_panel: { fit: 'height', size: 0.9, ratio: 0.6, tex: 1024 },
  flashlight: { fit: 'max', size: 0.22, ratio: 0.6, tex: 512 },
  batteries: { fit: 'max', size: 0.09, ratio: 0.5, tex: 512 },
  toolbox: { fit: 'max', size: 0.45, ratio: 0.5, tex: 512 },
  rag: { fit: 'max', size: 0.45, ratio: 0.4, tex: 512 },
  warning_sign: { fit: 'max', size: 0.42, ratio: 0.5, tex: 512 },
  fan: { fit: 'height', size: 1.1, ratio: 0.5, tex: 512 },
  door: { fit: 'height', size: 2.25, ratio: 0.5, tex: 1024 },
  pipe: { fit: 'max', size: 1.0, ratio: 0.4, tex: 512 },
  cable_spool: { fit: 'height', size: 0.75, ratio: 0.5, tex: 512 },
  gas_cylinder: { fit: 'height', size: 1.2, ratio: 0.5, tex: 512 },
}

const ORIENT = fs.existsSync(path.join(ROOT, 'tools/assets/orient.json'))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/assets/orient.json'), 'utf8'))
  : {}

async function main() {
  await MeshoptSimplifier.ready
  await MeshoptEncoder.ready
  await MeshoptDecoder.ready
  const io = new NodeIO()
    .registerExtensions(ALL_EXTENSIONS)
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
  fs.mkdirSync(OUT, { recursive: true })
  const manifest = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) : {}
  const only = process.argv.slice(2)
  for (const [name, spec] of Object.entries(SPECS)) {
    if (only.length && !only.includes(name)) continue
    const src = path.join(RAW, name, 'model_urls_pbr_model__model.glb')
    if (!fs.existsSync(src)) { console.log(`[missing] ${name}`); continue }
    const doc = await io.read(src)
    const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0]

    await doc.transform(
      dedup(), weld(),
      simplify({ simplifier: MeshoptSimplifier, ratio: spec.ratio, error: spec.err ?? 0.002 }),
      prune(),
      textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [spec.tex, spec.tex], quality: 82 }),
    )

    // Wrap everything under a root node that carries orientation, scale and pivot.
    const root = doc.createNode(`prop_${name}`)
    for (const child of scene.listChildren()) { scene.removeChild(child); root.addChild(child) }
    scene.addChild(root)
    const o = ORIENT[name] || {}
    const rx = ((o.rotX || 0) * Math.PI) / 180, ry = ((o.rotY || 0) * Math.PI) / 180, rz = ((o.rotZ || 0) * Math.PI) / 180
    // Euler XYZ -> quaternion
    const c1 = Math.cos(rx / 2), s1 = Math.sin(rx / 2), c2 = Math.cos(ry / 2), s2 = Math.sin(ry / 2), c3 = Math.cos(rz / 2), s3 = Math.sin(rz / 2)
    root.setRotation([
      s1 * c2 * c3 + c1 * s2 * s3,
      c1 * s2 * c3 - s1 * c2 * s3,
      c1 * c2 * s3 + s1 * s2 * c3,
      c1 * c2 * c3 - s1 * s2 * s3,
    ])
    let b = getBounds(scene)
    let dims = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]]
    const ref = spec.fit === 'height' ? dims[1] : Math.max(...dims)
    const s = spec.size / ref
    root.setScale([s, s, s])
    b = getBounds(scene)
    const t = root.getTranslation()
    root.setTranslation([t[0] - (b.min[0] + b.max[0]) / 2, t[1] - b.min[1], t[2] - (b.min[2] + b.max[2]) / 2])
    b = getBounds(scene)
    dims = [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]].map((v) => +v.toFixed(4))

    for (const m of doc.getRoot().listMaterials()) m.setName(`mat_${name}`)
    await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }))
    const dest = path.join(OUT, `prop_${name}.glb`)
    await io.write(dest, doc)
    const tris = doc.getRoot().listMeshes().reduce((a, m) => a + m.listPrimitives().reduce((x, p) => x + (p.getIndices()?.getCount() ?? 0) / 3, 0), 0)
    manifest[name] = { size: dims, tris: Math.round(tris) }
    console.log(`${name.padEnd(18)} ${dims.join(' x ')}  tris=${Math.round(tris)}  ${(fs.statSync(dest).size / 1024).toFixed(0)} KB`)
  }
  fs.mkdirSync(path.dirname(MANIFEST), { recursive: true })
  fs.writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2))
}
main().catch((e) => { console.error(e); process.exit(1) })
