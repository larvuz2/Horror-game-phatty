import { create } from 'zustand'
import type { QualityLevel } from '../config/gameConfig'

export interface Settings {
  masterVolume: number
  sfxVolume: number
  musicVolume: number
  mouseSensitivity: number
  filmGrain: number
  quality: QualityLevel
  brightness: number
  invertY: boolean
  reduceMotion: boolean
}

const KEY = 'dont-look-away.settings.v1'

export const DEFAULT_SETTINGS: Settings = {
  masterVolume: 0.85,
  sfxVolume: 0.9,
  musicVolume: 0.75,
  mouseSensitivity: 1,
  filmGrain: 0.5,
  quality: 'medium',
  brightness: 0,
  invertY: false,
  reduceMotion: false,
}

function detectDefaultQuality(): QualityLevel {
  try {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2')
    if (!gl) return 'low'
    const dbg = gl.getExtension('WEBGL_debug_renderer_info')
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : ''
    if (/swiftshader|llvmpipe|software/i.test(renderer)) return 'low'
    if (/nvidia|radeon rx|apple m[1-9]|geforce|rtx|arc/i.test(renderer)) return 'high'
    return 'medium'
  } catch {
    return 'medium'
  }
}

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    /* storage unavailable */
  }
  return { ...DEFAULT_SETTINGS, quality: detectDefaultQuality() }
}

function save(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* storage unavailable: settings last for this session only */
  }
}

interface SettingsStore extends Settings {
  update: (patch: Partial<Settings>) => void
  reset: () => void
}

export const useSettings = create<SettingsStore>((set, get) => ({
  ...load(),
  update: (patch) => {
    set(patch)
    const { update: _u, reset: _r, ...rest } = get()
    save(rest)
  },
  reset: () => {
    set({ ...DEFAULT_SETTINGS })
    save({ ...DEFAULT_SETTINGS })
  },
}))
