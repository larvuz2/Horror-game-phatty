// Room layout: architecture, prop placement, interactables and lights.
// Units are meters. The room spans x [-6, 6], z [-9, 9], y [0, 4].
// North (-z) is the far end where the creature waits; the player starts in the south.
// Model fronts face +z; rotY rotates around +y (PI/2 turns the front toward +x).

import modelsManifest from './models.json'

export const ROOM = { minX: -6, maxX: 6, minZ: -9, maxZ: 9, height: 4 } as const

export type ModelName = keyof typeof modelsManifest
export const MODEL_SIZES = modelsManifest as Record<ModelName, { size: number[]; tris: number }>

export type PhysicsKind = 'static' | 'dynamic' | 'none'
export type SoundMaterial = 'wood' | 'metal' | 'metalLight' | 'cardboard' | 'plastic'

export interface PropInstance {
  id: string
  model: ModelName
  pos: [number, number, number]
  rotY?: number
  rot?: [number, number, number] // full euler, overrides rotY
  scale?: number
  physics: PhysicsKind
  collider?: 'box' | 'cylinder'
  mass?: number
  sound?: SoundMaterial
  tint?: [number, number, number] // multiply albedo
}

const H = Math.PI / 2
const PI = Math.PI

export const PLAYER_START = { pos: [0.2, 0, 7.4] as [number, number, number], yaw: 0 } // yaw 0 = facing -z
export const CREATURE_START: [number, number, number] = [0.6, 0, -7.1]

// Cinematic staging (death): an open spot between the pillars.
export const STAGE = { pos: [0, 0, -1.3] as [number, number, number], yaw: 0 }

export const PILLARS: { pos: [number, number]; size: number }[] = [
  { pos: [-2.3, 0.4], size: 0.46 },
  { pos: [2.3, 0.4], size: 0.46 },
]

export const FIXTURES = [
  { id: 'F1', pos: [0.5, 3.45, 4.3] as [number, number, number], mode: 'flicker' as const, shadow: true },
  { id: 'F2', pos: [0.0, 3.45, -4.0] as [number, number, number], mode: 'broken' as const, shadow: false },
  { id: 'F3', pos: [-3.6, 3.45, 0.4] as [number, number, number], mode: 'dead' as const, shadow: false },
  { id: 'F4', pos: [3.6, 3.45, 0.4] as [number, number, number], mode: 'dead' as const, shadow: false },
]

// Caged practical bulb behind the creature (rim light / long shadow toward the player).
export const PRACTICAL = { pos: [0.9, 2.75, -8.82] as [number, number, number], target: [0.6, 0, -5.5] as [number, number, number] }
// Faint bulb over the battery table in the south-west corner.
export const CORNER_BULB = { pos: [-4.6, 2.5, 8.85] as [number, number, number], target: [-4.6, 0.6, 8.0] as [number, number, number] }

export const INTERACTABLES = {
  flashlight: { pos: [1.72, 0.902, 5.62] as [number, number, number], rotY: 1.15, radius: 0.3 },
  batteries: { pos: [-4.45, 0.883, 8.42] as [number, number, number], rotY: 0.5, radius: 0.28 },
  panel: { pos: [-5.8, 0.85, -2.4] as [number, number, number], rotY: H, radius: 0.55 },
  door: { pos: [-3.4, 0, -8.74] as [number, number, number], rotY: 0, radius: 0.9 },
}

export const PROPS: PropInstance[] = [
  // --- South: start area -------------------------------------------------------------
  { id: 'table_flashlight', model: 'table_small', pos: [1.9, 0, 5.7], rotY: -0.25, physics: 'static' },
  { id: 'chair_start', model: 'chair_wood', pos: [2.55, 0, 6.55], rotY: PI + 0.5, physics: 'dynamic', mass: 6, sound: 'wood' },
  { id: 'table_batteries', model: 'table_small', pos: [-4.55, 0, 8.45], rotY: 0.04, physics: 'static' },
  { id: 'box_sw1', model: 'box_cardboard', pos: [-5.5, 0, 7.4], rotY: 0.3, physics: 'dynamic', mass: 2.5, sound: 'cardboard' },
  { id: 'box_sw2', model: 'box_cardboard', pos: [-5.45, 0.47, 7.42], rotY: 0.1, scale: 0.85, physics: 'dynamic', mass: 2, sound: 'cardboard' },
  { id: 'box_sw3', model: 'box_open', pos: [-5.4, 0, 6.7], rotY: -0.4, physics: 'dynamic', mass: 1.2, sound: 'cardboard' },
  { id: 'pallet_s', model: 'pallet', pos: [4.9, 0, 8.25], rotY: 0.08, physics: 'static' },
  { id: 'pallet_s2', model: 'pallet', pos: [4.88, 0.27, 8.27], rotY: -0.05, physics: 'static' },
  { id: 'box_se1', model: 'box_cardboard', pos: [4.75, 0.54, 8.2], rotY: 0.2, physics: 'dynamic', mass: 2.5, sound: 'cardboard' },
  { id: 'box_se2', model: 'box_open', pos: [5.2, 0.54, 8.45], rotY: 1.1, physics: 'dynamic', mass: 1.2, sound: 'cardboard' },
  { id: 'paint_1', model: 'paint_can', pos: [1.0, 0, 4.9], physics: 'dynamic', mass: 1.2, sound: 'metalLight', collider: 'cylinder' },
  { id: 'paint_2', model: 'paint_can', pos: [1.3, 0, 4.65], rotY: 1, physics: 'dynamic', mass: 1.2, sound: 'metalLight', collider: 'cylinder' },
  { id: 'paint_tipped', model: 'paint_can', pos: [-1.2, 0.12, 5.6], rot: [H, 0, 0.6], physics: 'dynamic', mass: 0.9, sound: 'metalLight', collider: 'cylinder' },
  { id: 'bottle_1', model: 'bottle', pos: [-1.8, 0.05, 5.1], rot: [H, 0, 1.2], physics: 'dynamic', mass: 0.1, sound: 'plastic', collider: 'cylinder' },
  { id: 'bottle_2', model: 'bottle', pos: [0.6, 0, 2.2], physics: 'dynamic', mass: 0.1, sound: 'plastic', collider: 'cylinder' },
  { id: 'rag_s', model: 'rag', pos: [2.9, 0, 5.2], rotY: 0.7, physics: 'none' },
  { id: 'gas_s', model: 'gas_cylinder', pos: [5.55, 0, 6.6], physics: 'static', collider: 'cylinder' },
  { id: 'trash_s', model: 'trash_bin', pos: [-2.6, 0, 8.55], rotY: 0.4, physics: 'dynamic', mass: 3, sound: 'metal', collider: 'cylinder' },

  // --- Middle ------------------------------------------------------------------------
  { id: 'desk', model: 'desk_metal', pos: [5.45, 0, 2.6], rotY: -H, physics: 'static' },
  { id: 'chair_desk', model: 'chair_metal', pos: [4.55, 0, 2.75], rotY: H - 0.2, physics: 'dynamic', mass: 4.5, sound: 'metalLight' },
  { id: 'toolbox', model: 'toolbox', pos: [5.4, 0.88, 2.2], rotY: -H + 0.3, physics: 'dynamic', mass: 4, sound: 'metal' },
  { id: 'chair_tipped', model: 'chair_wood', pos: [-1.3, 0.28, 3.4], rot: [-H, 0.9, 0], physics: 'dynamic', mass: 6, sound: 'wood' },
  { id: 'fan', model: 'fan', pos: [-5.35, 0, 1.0], rotY: H + 0.35, physics: 'static' },
  { id: 'trash_m', model: 'trash_bin', pos: [-4.7, 0, 2.8], physics: 'dynamic', mass: 3, sound: 'metal', collider: 'cylinder' },
  { id: 'bucket_m', model: 'bucket', pos: [-0.9, 0, -0.6], rotY: 0.4, physics: 'dynamic', mass: 1.5, sound: 'metalLight', collider: 'cylinder' },
  { id: 'pipe_m', model: 'pipe', pos: [1.5, 0.1, 1.2], rotY: 0.9, physics: 'dynamic', mass: 3, sound: 'metal' },
  { id: 'barrel_m', model: 'barrel', pos: [3.35, 0, -0.9], physics: 'static', collider: 'cylinder' },
  { id: 'barrel_m2', model: 'barrel', pos: [3.85, 0, -0.35], rotY: 1, physics: 'static', collider: 'cylinder' },
  { id: 'rag_m', model: 'rag', pos: [4.3, 0.01, 1.6], rotY: 2.2, physics: 'none' },
  { id: 'spool', model: 'cable_spool', pos: [-3.3, 0, 2.6], rotY: 0.6, physics: 'static', collider: 'cylinder' },
  { id: 'box_m1', model: 'box_cardboard', pos: [5.4, 0, 0.6], rotY: 0.15, physics: 'dynamic', mass: 2.5, sound: 'cardboard' },
  { id: 'box_m2', model: 'box_open', pos: [5.35, 0, -0.1], rotY: -0.3, physics: 'dynamic', mass: 1.2, sound: 'cardboard' },

  // --- North: shelving, creature area, exit -----------------------------------------
  { id: 'shelf_w1', model: 'shelf_tall', pos: [-3.75, 0, -5.0], rotY: H, physics: 'static' },
  { id: 'shelf_w2', model: 'shelf_tall', pos: [-3.75, 0, -3.3], rotY: H, physics: 'static' },
  { id: 'shelf_e1', model: 'shelf_tall', pos: [3.75, 0, -5.0], rotY: -H, physics: 'static' },
  { id: 'shelf_e2', model: 'shelf_tall', pos: [3.75, 0, -3.3], rotY: -H, physics: 'static' },
  { id: 'cabinet_ne', model: 'cabinet', pos: [4.75, 0, -8.6], rotY: 0, physics: 'static' },
  { id: 'cabinet_e', model: 'cabinet', pos: [5.62, 0, -7.2], rotY: -H, physics: 'static' },
  { id: 'barrel_n1', model: 'barrel', pos: [3.3, 0, -8.45], physics: 'static', collider: 'cylinder' },
  { id: 'barrel_n2', model: 'barrel', pos: [-5.35, 0, -8.4], rotY: 2, physics: 'static', collider: 'cylinder' },
  { id: 'pallet_nw', model: 'pallet', pos: [-5.15, 0, -6.6], rotY: H + 0.05, physics: 'static' },
  { id: 'pallet_nw2', model: 'pallet', pos: [-5.12, 0.27, -6.58], rotY: H - 0.06, physics: 'static' },
  { id: 'box_nw1', model: 'box_cardboard', pos: [-5.2, 0.54, -6.9], rotY: 0.3, physics: 'dynamic', mass: 2.5, sound: 'cardboard' },
  { id: 'box_nw2', model: 'box_cardboard', pos: [-5.0, 0.54, -6.2], rotY: -0.25, scale: 0.8, physics: 'dynamic', mass: 2, sound: 'cardboard' },
  { id: 'gas_n', model: 'gas_cylinder', pos: [-1.95, 0, -8.6], physics: 'static', collider: 'cylinder' },
  { id: 'gas_n2', model: 'gas_cylinder', pos: [-1.55, 0, -8.7], rotY: 1.4, physics: 'static', collider: 'cylinder' },
  { id: 'spool_n', model: 'cable_spool', pos: [2.2, 0, -6.4], rotY: 1.2, physics: 'static', collider: 'cylinder' },
  { id: 'pipe_n', model: 'pipe', pos: [-2.2, 0.1, -6.0], rotY: 0.2, physics: 'dynamic', mass: 3, sound: 'metal' },
  { id: 'bucket_n', model: 'bucket', pos: [1.3, 0, -5.4], physics: 'dynamic', mass: 1.5, sound: 'metalLight', collider: 'cylinder' },
  { id: 'chair_n', model: 'chair_metal', pos: [-1.0, 0, -4.4], rotY: 2.6, physics: 'dynamic', mass: 4.5, sound: 'metalLight' },
  { id: 'trash_n', model: 'trash_bin', pos: [2.75, 0, -7.6], physics: 'dynamic', mass: 3, sound: 'metal', collider: 'cylinder' },
  { id: 'rag_n', model: 'rag', pos: [-0.6, 0.01, -6.4], rotY: -0.5, physics: 'none' },

  // --- Wall details ---------------------------------------------------------------------
  { id: 'clock', model: 'wall_clock', pos: [5.96, 2.3, -0.3], rotY: -H, physics: 'none' },
  { id: 'sign_door', model: 'warning_sign', pos: [-1.75, 1.45, -8.975], rotY: 0, physics: 'none' },
  { id: 'sign_panel', model: 'warning_sign', pos: [-5.975, 2.05, -2.4], rotY: H, scale: 0.9, physics: 'none' },
]

// Decorative items placed on shelves (raycast onto the shelf boards at load time).
export const SHELF_ITEMS: { model: ModelName; shelf: string; along: number; level: number; rotY: number; scale?: number }[] = [
  { model: 'box_cardboard', shelf: 'shelf_w1', along: -0.35, level: 1, rotY: 0.1, scale: 0.8 },
  { model: 'box_open', shelf: 'shelf_w1', along: 0.4, level: 2, rotY: -0.2 },
  { model: 'paint_can', shelf: 'shelf_w1', along: 0.1, level: 3, rotY: 0.5 },
  { model: 'paint_can', shelf: 'shelf_w1', along: 0.35, level: 3, rotY: 1.5 },
  { model: 'box_cardboard', shelf: 'shelf_w2', along: 0.3, level: 0, rotY: -0.1, scale: 0.75 },
  { model: 'toolbox', shelf: 'shelf_w2', along: -0.3, level: 2, rotY: 0.2 },
  { model: 'bucket', shelf: 'shelf_w2', along: 0.4, level: 3, rotY: 0.2 },
  { model: 'box_open', shelf: 'shelf_e1', along: 0.0, level: 1, rotY: 0.3 },
  { model: 'box_cardboard', shelf: 'shelf_e1', along: -0.4, level: 3, rotY: 0.0, scale: 0.7 },
  { model: 'paint_can', shelf: 'shelf_e1', along: 0.45, level: 2, rotY: 0.0 },
  { model: 'box_cardboard', shelf: 'shelf_e2', along: 0.2, level: 2, rotY: 0.25, scale: 0.85 },
  { model: 'bottle', shelf: 'shelf_e2', along: -0.4, level: 1, rotY: 0.0 },
  { model: 'box_open', shelf: 'shelf_e2', along: -0.2, level: 0, rotY: 0.6 },
]

// Axis-aligned boxes that fully block sight lines (used by the visibility detector).
export interface AABB {
  min: [number, number, number]
  max: [number, number, number]
}
// Shrunk by 15 cm per side so limbs wider than the sample points can't peek out unnoticed.
const OCC_SHRINK = 0.15
export const OCCLUDERS: AABB[] = PILLARS.map((p) => ({
  min: [p.pos[0] - p.size / 2 + OCC_SHRINK, 0, p.pos[1] - p.size / 2 + OCC_SHRINK],
  max: [p.pos[0] + p.size / 2 - OCC_SHRINK, ROOM.height, p.pos[1] + p.size / 2 - OCC_SHRINK],
}))

// Decals: [texture, position, rotation (euler), size [w, h], opacity, revealOnVictory]
export const DECALS: { tex: string; pos: [number, number, number]; rot: [number, number, number]; size: [number, number]; opacity: number; victoryOnly?: boolean }[] = [
  { tex: 'decal_oil', pos: [1.2, 0.004, 3.2], rot: [-H, 0, 0.3], size: [1.6, 1.6], opacity: 0.85 },
  { tex: 'decal_oil', pos: [-3.0, 0.004, -2.2], rot: [-H, 0, 2.1], size: [1.2, 1.2], opacity: 0.8 },
  { tex: 'decal_oil', pos: [4.2, 0.004, 7.2], rot: [-H, 0, 1.0], size: [1.0, 1.0], opacity: 0.7 },
  { tex: 'decal_grime', pos: [0.4, 0.005, -6.6], rot: [-H, 0, 0.0], size: [2.4, 2.4], opacity: 0.8 },
  { tex: 'decal_grime', pos: [-5.0, 0.005, 4.5], rot: [-H, 0, 1.3], size: [2.0, 2.0], opacity: 0.7 },
  { tex: 'decal_cracks', pos: [-0.8, 0.006, 1.0], rot: [-H, 0, 0.6], size: [2.2, 2.2], opacity: 0.7 },
  { tex: 'decal_cracks', pos: [3.0, 0.006, -5.8], rot: [-H, 0, 2.4], size: [1.8, 1.8], opacity: 0.6 },
  { tex: 'decal_water', pos: [-5.985, 2.6, 5.0], rot: [0, H, 0], size: [2.2, 2.6], opacity: 0.85 },
  { tex: 'decal_water', pos: [5.985, 2.7, -3.6], rot: [0, -H, 0], size: [2.4, 2.4], opacity: 0.85 },
  { tex: 'decal_water', pos: [2.6, 2.7, -8.985], rot: [0, 0, 0], size: [2.4, 2.4], opacity: 0.8 },
  { tex: 'decal_water', pos: [-1.6, 2.8, 8.985], rot: [0, PI, 0], size: [2.6, 2.4], opacity: 0.8 },
  // The trail the creature left: only readable once the lights are back.
  { tex: 'decal_footprints', pos: [0.5, 0.007, -4.5], rot: [-H, 0, PI], size: [1.8, 1.8], opacity: 0.75, victoryOnly: true },
  { tex: 'decal_footprints', pos: [0.4, 0.007, -1.0], rot: [-H, 0, PI + 0.1], size: [1.8, 1.8], opacity: 0.75, victoryOnly: true },
  { tex: 'decal_footprints', pos: [0.2, 0.007, 2.6], rot: [-H, 0, PI - 0.15], size: [1.8, 1.8], opacity: 0.75, victoryOnly: true },
  { tex: 'decal_footprints', pos: [-0.4, 0.007, 6.0], rot: [-H, 0, PI + 0.3], size: [1.8, 1.8], opacity: 0.75, victoryOnly: true },
]
