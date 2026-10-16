// Full-screen black overlay driven imperatively (no React re-renders during cinematics).
// Also does an "eyelid" iris for waking up: a vertical ellipse of vision opening in the dark.
let el: HTMLDivElement | null = null
let value = 1
let iris = -1 // < 0 = disabled

function apply() {
  if (!el) return
  el.style.opacity = value.toFixed(3)
  if (iris < 0) {
    el.style.background = '#000'
  } else {
    const h = Math.max(0.5, iris * 135)
    const w = 60 + iris * 110
    el.style.background = `radial-gradient(ellipse ${w}% ${h}% at 50% 50%, rgba(0,0,0,0) 30%, rgba(0,0,0,0.88) 72%, #000 100%)`
  }
}

export const fader = {
  attach(e: HTMLDivElement | null) {
    el = e
    apply()
  },
  set(v: number) {
    value = Math.min(1, Math.max(0, v))
    apply()
  },
  setIris(open: number | null) {
    iris = open === null ? -1 : Math.max(0, open)
    apply()
  },
  get() {
    return value
  },
}
