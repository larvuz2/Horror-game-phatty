// World-anchored interaction markers drawn as DOM elements, updated imperatively every frame.
// A faint ring appears when an interactable is nearby; it grows a key badge when in reach and
// shows the action label when it is the current target.
type MarkerState = { x: number; y: number; opacity: number; near: boolean; target: boolean; label: string } | null

let root: HTMLDivElement | null = null
const els = new Map<string, { el: HTMLDivElement; label: HTMLSpanElement; key: HTMLSpanElement; last: string }>()
let keyText = 'E'

export const markers = {
  attach(e: HTMLDivElement | null) {
    root = e
    els.clear()
    if (root) root.innerHTML = ''
  },
  setKeyText(t: string) {
    keyText = t
    els.forEach((m) => (m.key.textContent = t))
  },
  update(id: string, s: MarkerState) {
    if (!root) return
    let m = els.get(id)
    if (!m) {
      const el = document.createElement('div')
      el.className = 'marker'
      el.innerHTML = '<span class="marker-ring"></span><span class="marker-key"></span><span class="marker-label"></span>'
      root.appendChild(el)
      m = { el, label: el.querySelector('.marker-label') as HTMLSpanElement, key: el.querySelector('.marker-key') as HTMLSpanElement, last: '' }
      m.key.textContent = keyText
      els.set(id, m)
    }
    if (!s) {
      if (m.last !== 'hidden') {
        m.el.style.opacity = '0'
        m.last = 'hidden'
      }
      return
    }
    const cls = `marker${s.near ? ' near' : ''}${s.target ? ' target' : ''}`
    if (m.el.className !== cls) m.el.className = cls
    if (m.label.textContent !== s.label) m.label.textContent = s.label
    m.el.style.opacity = s.opacity.toFixed(2)
    m.el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`
    m.last = 'shown'
  },
  hideAll() {
    els.forEach((_, id) => markers.update(id, null))
  },
}
