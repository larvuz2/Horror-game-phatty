// Web Audio engine: buses, HRTF spatialization, synthetic room reverb, muffling and seamless loops.
import audioManifest from '../config/audio.json'

type Bus = 'music' | 'sfx' | 'amb' | 'ui'
type Vec3 = { x: number; y: number; z: number } | [number, number, number]

const MANIFEST = audioManifest as Record<string, { loop: boolean; loopStart?: number; loopEnd?: number }>
const MUSIC = new Set(['menu_theme', 'ambient_bed', 'tension_layer', 'death_cinematic', 'victory'])

export interface PlayOptions {
  bus?: Bus
  volume?: number
  rate?: number
  loop?: boolean
  pos?: Vec3
  refDistance?: number
  rolloff?: number
  maxDistance?: number
  reverb?: number // send level 0..1
  fadeIn?: number
  offset?: number
  when?: number // delay in seconds
}

export interface Voice {
  readonly name: string
  stop: (fade?: number) => void
  setVolume: (v: number, ramp?: number) => void
  setPosition: (p: Vec3) => void
  setRate: (r: number, ramp?: number) => void
  readonly playing: boolean
}

const v3 = (p: Vec3) => (Array.isArray(p) ? { x: p[0], y: p[1], z: p[2] } : p)

class AudioManager {
  ctx: AudioContext | null = null
  private buffers = new Map<string, AudioBuffer>()
  private loading: Promise<void> | null = null
  private master!: GainNode
  private buses!: Record<Bus, GainNode>
  private world!: GainNode // sfx + amb go through here (pause ducking, muffling)
  private muffleFilter!: BiquadFilterNode
  private reverbIn!: GainNode
  private settings = { master: 0.85, sfx: 0.9, music: 0.75 }
  private voices = new Set<{ stop: (f?: number) => void }>()

  get ready() {
    return this.ctx !== null && this.buffers.size > 0
  }

  // Must be called from a user gesture.
  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume()
      return
    }
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new Ctor({ latencyHint: 'interactive' })
    this.ctx = ctx
    this.master = ctx.createGain()
    const comp = ctx.createDynamicsCompressor()
    comp.threshold.value = -14
    comp.knee.value = 12
    comp.ratio.value = 3
    comp.attack.value = 0.01
    comp.release.value = 0.25
    this.master.connect(comp).connect(ctx.destination)

    this.muffleFilter = ctx.createBiquadFilter()
    this.muffleFilter.type = 'lowpass'
    this.muffleFilter.frequency.value = 20000
    this.muffleFilter.Q.value = 0.5
    this.world = ctx.createGain()
    this.world.connect(this.muffleFilter).connect(this.master)

    this.buses = {
      music: ctx.createGain(),
      sfx: ctx.createGain(),
      amb: ctx.createGain(),
      ui: ctx.createGain(),
    }
    this.buses.music.connect(this.master)
    this.buses.ui.connect(this.master)
    this.buses.sfx.connect(this.world)
    this.buses.amb.connect(this.world)

    // Synthetic impulse response: a large, hard concrete room.
    const conv = ctx.createConvolver()
    conv.buffer = this.makeImpulse(2.6, 2.2)
    this.reverbIn = ctx.createGain()
    this.reverbIn.gain.value = 1
    const wet = ctx.createGain()
    wet.gain.value = 0.55
    const hp = ctx.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = 180
    this.reverbIn.connect(hp).connect(conv).connect(wet).connect(this.world)
    this.applyVolumes()
    if (ctx.state === 'suspended') void ctx.resume()
  }

  private makeImpulse(seconds: number, decay: number) {
    const ctx = this.ctx!
    const len = Math.floor(ctx.sampleRate * seconds)
    const buf = ctx.createBuffer(2, len, ctx.sampleRate)
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c)
      let lp = 0
      for (let i = 0; i < len; i++) {
        const t = i / len
        // Darker tail: one-pole lowpass whose cutoff falls over time.
        const white = Math.random() * 2 - 1
        const k = 0.55 - 0.45 * t
        lp = lp + k * (white - lp)
        const early = i < ctx.sampleRate * 0.08 && Math.random() < 0.004 ? (Math.random() * 2 - 1) * 0.8 : 0
        d[i] = (lp + early) * Math.pow(1 - t, decay)
      }
    }
    return buf
  }

  setVolumes(master: number, sfx: number, music: number) {
    this.settings = { master, sfx, music }
    this.applyVolumes()
  }

  private applyVolumes() {
    if (!this.ctx) return
    const t = this.ctx.currentTime
    this.master.gain.setTargetAtTime(this.settings.master, t, 0.05)
    this.buses.sfx.gain.setTargetAtTime(this.settings.sfx, t, 0.05)
    this.buses.amb.gain.setTargetAtTime(this.settings.sfx, t, 0.05)
    this.buses.ui.gain.setTargetAtTime(this.settings.sfx * 0.8, t, 0.05)
    this.buses.music.gain.setTargetAtTime(this.settings.music * (this.musicDuck ?? 1), t, 0.05)
  }

  url(name: string) {
    return `${import.meta.env.BASE_URL}audio/${MUSIC.has(name) ? 'music' : 'sfx'}/${name}.mp3`
  }

  // Fetches and decodes every sound in the manifest. Fetching can start before the context exists.
  loadAll(onProgress?: (p: number) => void) {
    if (this.loading) return this.loading
    const names = Object.keys(MANIFEST)
    const raw = new Map<string, ArrayBuffer>()
    let done = 0
    const fetchAll = Promise.all(
      names.map(async (n) => {
        try {
          const r = await fetch(this.url(n))
          raw.set(n, await r.arrayBuffer())
        } catch (e) {
          console.warn('[audio] failed to fetch', n, e)
        }
        done++
        onProgress?.(done / names.length)
      }),
    )
    this.loading = fetchAll.then(() => undefined)
    this.rawPending = raw
    return this.loading
  }

  private rawPending: Map<string, ArrayBuffer> | null = null
  private decoding: Promise<void> | null = null

  // Decode after the context exists (needs a user gesture on some browsers).
  async decodeAll() {
    if (this.decoding) return this.decoding
    this.decoding = (async () => {
      await this.loading
      const ctx = this.ctx
      if (!ctx || !this.rawPending) return
      const entries = [...this.rawPending.entries()]
      await Promise.all(
        entries.map(async ([n, ab]) => {
          try {
            const buf = await ctx.decodeAudioData(ab.slice(0))
            this.buffers.set(n, buf)
          } catch (e) {
            console.warn('[audio] decode failed', n, e)
          }
        }),
      )
      this.rawPending = null
    })()
    return this.decoding
  }

  has(name: string) {
    return this.buffers.has(name)
  }

  play(name: string, o: PlayOptions = {}): Voice | null {
    const ctx = this.ctx
    const buf = this.buffers.get(name)
    if (!ctx || !buf) return null
    const meta = MANIFEST[name]
    const src = ctx.createBufferSource()
    src.buffer = buf
    const loop = o.loop ?? meta?.loop ?? false
    if (loop) {
      src.loop = true
      if (meta?.loopStart !== undefined && meta.loopEnd !== undefined && meta.loopEnd <= buf.duration) {
        src.loopStart = meta.loopStart
        src.loopEnd = meta.loopEnd
      }
    }
    src.playbackRate.value = o.rate ?? 1
    const gain = ctx.createGain()
    const vol = o.volume ?? 1
    const t0 = ctx.currentTime + (o.when ?? 0)
    if (o.fadeIn) {
      gain.gain.setValueAtTime(0.0001, t0)
      gain.gain.linearRampToValueAtTime(vol, t0 + o.fadeIn)
    } else gain.gain.value = vol
    let panner: PannerNode | null = null
    src.connect(gain)
    let out: AudioNode = gain
    if (o.pos) {
      panner = ctx.createPanner()
      panner.panningModel = 'HRTF'
      panner.distanceModel = 'inverse'
      panner.refDistance = o.refDistance ?? 1
      panner.rolloffFactor = o.rolloff ?? 1.3
      panner.maxDistance = o.maxDistance ?? 40
      const p = v3(o.pos)
      setParam(panner.positionX, p.x, ctx)
      setParam(panner.positionY, p.y, ctx)
      setParam(panner.positionZ, p.z, ctx)
      gain.connect(panner)
      out = panner
    }
    const bus = this.buses[o.bus ?? 'sfx']
    out.connect(bus)
    const reverb = o.reverb ?? (o.bus === 'music' || o.bus === 'ui' ? 0 : 0.35)
    let send: GainNode | null = null
    if (reverb > 0) {
      send = ctx.createGain()
      send.gain.value = reverb
      out.connect(send).connect(this.reverbIn)
    }
    let playing = true
    const offset = loop && meta?.loopStart !== undefined ? Math.max(o.offset ?? 0, meta.loopStart * 0.5) : (o.offset ?? 0)
    src.start(t0, offset)
    const entry = {
      stop: (fade = 0) => {
        if (!playing) return
        playing = false
        const t = ctx.currentTime
        try {
          if (fade > 0) {
            gain.gain.cancelScheduledValues(t)
            gain.gain.setValueAtTime(gain.gain.value, t)
            gain.gain.linearRampToValueAtTime(0.0001, t + fade)
            src.stop(t + fade + 0.05)
          } else src.stop()
        } catch {
          /* already stopped */
        }
      },
    }
    this.voices.add(entry)
    src.onended = () => {
      playing = false
      this.voices.delete(entry)
      src.disconnect()
      gain.disconnect()
      panner?.disconnect()
      send?.disconnect()
    }
    return {
      name,
      stop: entry.stop,
      setVolume: (v, ramp = 0.1) => {
        if (!playing) return
        gain.gain.setTargetAtTime(Math.max(0, v), ctx.currentTime, Math.max(0.001, ramp / 3))
      },
      setPosition: (p) => {
        if (!panner) return
        const q = v3(p)
        setParam(panner.positionX, q.x, ctx)
        setParam(panner.positionY, q.y, ctx)
        setParam(panner.positionZ, q.z, ctx)
      },
      setRate: (r, ramp = 0.1) => src.playbackRate.setTargetAtTime(r, ctx.currentTime, Math.max(0.001, ramp / 3)),
      get playing() {
        return playing
      },
    }
  }

  setListener(pos: Vec3, forward: Vec3, up: Vec3) {
    const ctx = this.ctx
    if (!ctx) return
    const l = ctx.listener
    const p = v3(pos), f = v3(forward), u = v3(up)
    if (l.positionX) {
      setParam(l.positionX, p.x, ctx)
      setParam(l.positionY, p.y, ctx)
      setParam(l.positionZ, p.z, ctx)
      setParam(l.forwardX, f.x, ctx)
      setParam(l.forwardY, f.y, ctx)
      setParam(l.forwardZ, f.z, ctx)
      setParam(l.upX, u.x, ctx)
      setParam(l.upY, u.y, ctx)
      setParam(l.upZ, u.z, ctx)
    } else {
      // Legacy API (older Safari)
      const legacy = l as unknown as { setPosition: (...a: number[]) => void; setOrientation: (...a: number[]) => void }
      legacy.setPosition(p.x, p.y, p.z)
      legacy.setOrientation(f.x, f.y, f.z, u.x, u.y, u.z)
    }
  }

  // 0 = clear, 1 = heavily muffled (underwater / losing consciousness).
  setMuffle(amount: number, ramp = 0.3) {
    if (!this.ctx) return
    const f = 20000 * Math.pow(300 / 20000, Math.min(1, Math.max(0, amount)))
    this.muffleFilter.frequency.setTargetAtTime(f, this.ctx.currentTime, ramp / 3)
  }

  // Ducks the in-world buses and game music (used for pause).
  private musicDuck = 1
  setWorldLevel(v: number, ramp = 0.3) {
    if (!this.ctx) return
    this.world.gain.setTargetAtTime(v, this.ctx.currentTime, ramp / 3)
    this.musicDuck = Math.max(v, 0.15)
    this.buses.music.gain.setTargetAtTime(this.settings.music * this.musicDuck, this.ctx.currentTime, ramp / 3)
  }

  stopAll(fade = 0.3) {
    for (const v of [...this.voices]) v.stop(fade)
  }
}

function setParam(p: AudioParam, v: number, ctx: AudioContext) {
  p.setTargetAtTime(v, ctx.currentTime, 0.015)
}

export const audio = new AudioManager()
