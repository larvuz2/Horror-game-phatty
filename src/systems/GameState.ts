import { create } from 'zustand'

export type GamePhase =
  | 'MAIN_MENU'
  | 'LOADING'
  | 'INTRO'
  | 'PLAYING'
  | 'PAUSED'
  | 'DEATH_CINEMATIC'
  | 'DEATH_SCREEN'
  | 'VICTORY_CINEMATIC'
  | 'VICTORY_SCREEN'

export type Objective = 'FIND_FLASHLIGHT' | 'FIND_BATTERIES' | 'RESTORE_POWER' | 'COMPLETED'

// Allowed transitions. Anything else is rejected, which keeps death and victory mutually exclusive.
const TRANSITIONS: Record<GamePhase, GamePhase[]> = {
  MAIN_MENU: ['LOADING', 'INTRO'],
  LOADING: ['INTRO', 'MAIN_MENU'],
  INTRO: ['PLAYING', 'PAUSED', 'MAIN_MENU'],
  PLAYING: ['PAUSED', 'DEATH_CINEMATIC', 'VICTORY_CINEMATIC'],
  PAUSED: ['PLAYING', 'INTRO', 'MAIN_MENU'],
  DEATH_CINEMATIC: ['DEATH_SCREEN'],
  DEATH_SCREEN: ['INTRO', 'MAIN_MENU'],
  VICTORY_CINEMATIC: ['VICTORY_SCREEN'],
  VICTORY_SCREEN: ['INTRO', 'MAIN_MENU'],
}

export interface Message {
  id: number
  text: string
  kind: 'objective' | 'info' | 'hint'
  duration: number
}

interface GameStore {
  phase: GamePhase
  pausedFrom: GamePhase | null
  objective: Objective
  runId: number
  assetsReady: boolean
  hasFlashlight: boolean
  hasBatteries: boolean
  flashlightOn: boolean
  prompt: string | null
  promptProgress: number
  messages: Message[]
  menuPanel: 'main' | 'settings' | 'credits'
  transition: (to: GamePhase) => boolean
  setObjective: (o: Objective) => void
  setPrompt: (p: string | null, progress?: number) => void
  pushMessage: (text: string, kind?: Message['kind'], duration?: number) => void
  dropMessage: (id: number) => void
  newRun: () => void
  set: (partial: Partial<GameStore>) => void
}

let msgId = 1

export const useGame = create<GameStore>((set, get) => ({
  phase: 'MAIN_MENU',
  pausedFrom: null,
  objective: 'FIND_FLASHLIGHT',
  runId: 0,
  assetsReady: false,
  hasFlashlight: false,
  hasBatteries: false,
  flashlightOn: false,
  prompt: null,
  promptProgress: 0,
  messages: [],
  menuPanel: 'main',

  transition: (to) => {
    const from = get().phase
    if (from === to) return false
    if (!TRANSITIONS[from].includes(to)) {
      if (import.meta.env.DEV) console.warn(`[game] rejected transition ${from} -> ${to}`)
      return false
    }
    if (to === 'PAUSED') set({ phase: to, pausedFrom: from })
    else set({ phase: to, pausedFrom: to === 'PLAYING' || to === 'INTRO' ? null : get().pausedFrom })
    return true
  },

  setObjective: (objective) => set({ objective }),

  setPrompt: (prompt, promptProgress = 0) => {
    const s = get()
    if (s.prompt !== prompt || Math.abs(s.promptProgress - promptProgress) > 0.01) set({ prompt, promptProgress })
  },

  pushMessage: (text, kind = 'info', duration = 3.2) => {
    const m: Message = { id: msgId++, text, kind, duration }
    set({ messages: [...get().messages.filter((x) => x.kind !== kind), m] })
  },

  dropMessage: (id) => set({ messages: get().messages.filter((m) => m.id !== id) }),

  // Full reset of per-run state. The 3D scene is keyed by runId and remounts from scratch.
  newRun: () =>
    set({
      runId: get().runId + 1,
      objective: 'FIND_FLASHLIGHT',
      hasFlashlight: false,
      hasBatteries: false,
      flashlightOn: false,
      prompt: null,
      promptProgress: 0,
      messages: [],
    }),

  set: (partial) => set(partial),
}))
