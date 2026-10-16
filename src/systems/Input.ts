// Keyboard + pointer-lock mouse input. Polled by the player controller every frame.

const keys = new Set<string>()
const pressed = new Set<string>() // edge-triggered this frame
let mouseDX = 0
let mouseDY = 0
let mouseDown = false
let clickedThisFrame = false
// Touch controls (virtual joystick + drag-to-look), written by the TouchControls overlay.
const touch = { moveX: 0, moveY: 0, lookDX: 0, lookDY: 0 }

function onKeyDown(e: KeyboardEvent) {
  if (e.repeat) return
  keys.add(e.code)
  pressed.add(e.code)
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Space'].includes(e.code)) e.preventDefault()
}
function onKeyUp(e: KeyboardEvent) {
  keys.delete(e.code)
}
function onMouseMove(e: MouseEvent) {
  if (document.pointerLockElement) {
    // Ignore absurd spikes some browsers emit when (re)locking.
    if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return
    mouseDX += e.movementX
    mouseDY += e.movementY
  }
}
function onMouseDown(e: MouseEvent) {
  if (e.button === 0) {
    mouseDown = true
    clickedThisFrame = true
  }
}
function onMouseUp(e: MouseEvent) {
  if (e.button === 0) mouseDown = false
}
function onBlur() {
  keys.clear()
  mouseDown = false
}

let installed = false
export function installInput() {
  if (installed) return
  installed = true
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mousedown', onMouseDown)
  window.addEventListener('mouseup', onMouseUp)
  window.addEventListener('blur', onBlur)
}

export const input = {
  down: (code: string) => keys.has(code),
  pressed: (code: string) => pressed.has(code),
  get clicked() {
    return clickedThisFrame
  },
  get mouseHeld() {
    return mouseDown
  },
  consumeMouse() {
    const d = { x: mouseDX, y: mouseDY }
    mouseDX = 0
    mouseDY = 0
    return d
  },
  // Touch look deltas in pixels since last frame.
  consumeTouchLook() {
    const d = { x: touch.lookDX, y: touch.lookDY }
    touch.lookDX = 0
    touch.lookDY = 0
    return d
  },
  get touchMove() {
    return { x: touch.moveX, y: touch.moveY }
  },
  setTouchMove(x: number, y: number) {
    touch.moveX = x
    touch.moveY = y
  },
  addTouchLook(dx: number, dy: number) {
    touch.lookDX += dx
    touch.lookDY += dy
  },
  // Call once at the end of each frame.
  endFrame() {
    pressed.clear()
    clickedThisFrame = false
  },
  clear() {
    keys.clear()
    pressed.clear()
    mouseDX = mouseDY = 0
    clickedThisFrame = false
    mouseDown = false
    touch.moveX = touch.moveY = touch.lookDX = touch.lookDY = 0
  },
  // Test/automation hooks.
  simulateDown(code: string) {
    keys.add(code)
    pressed.add(code)
  },
  simulateUp(code: string) {
    keys.delete(code)
  },
  simulateMouse(dx: number, dy: number) {
    mouseDX += dx
    mouseDY += dy
  },
}
