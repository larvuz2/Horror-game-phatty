// Full-screen black overlay driven imperatively (no React re-renders during cinematics).
let el: HTMLDivElement | null = null
let value = 1

export const fader = {
  attach(e: HTMLDivElement | null) {
    el = e
    if (el) el.style.opacity = String(value)
  },
  set(v: number) {
    value = Math.min(1, Math.max(0, v))
    if (el) el.style.opacity = value.toFixed(3)
  },
  get() {
    return value
  },
}
