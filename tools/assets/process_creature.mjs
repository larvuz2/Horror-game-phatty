// Optimizes the Meshy-rigged creature: keeps the skeleton, drops sample clips, compresses textures.
import fs from 'node:fs'
import path from 'node:path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, textureCompress, meshopt } from '@gltf-transform/functions'
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer'
import sharp from 'sharp'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const variant = process.argv[2] || 'meshy_11'
const src = path.join(ROOT, `raw/creature/${variant}/rigged_character_glb__rigged_character.glb`)
const dest = path.join(ROOT, 'public/models/creature/creature_main.glb')
await MeshoptEncoder.ready
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder })
const doc = await io.read(src)
for (const a of doc.getRoot().listAnimations()) a.dispose()
await doc.transform(
  dedup(), prune(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
)
fs.mkdirSync(path.dirname(dest), { recursive: true })
await io.write(dest, doc)
console.log('creature ->', dest, (fs.statSync(dest).size / 1024).toFixed(0), 'KB')
