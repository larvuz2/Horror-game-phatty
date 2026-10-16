// Shared Playwright helpers for driving the game in headless Chromium (SwiftShader WebGL).
import { chromium } from 'playwright'

export async function launch({ url = 'http://localhost:5173/?debug&maxdt=0.25' + (process.env.URLX || ''), quality = 'medium', width = 1280, height = 720 } = {}) {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  })
  const page = await browser.newPage({ viewport: { width, height } })
  const errors = []
  page.on('console', (m) => {
    const t = m.text()
    if (m.type() === 'error' || m.type() === 'warning') {
      if (!/DevTools|GPU stall|Automatic fallback to software WebGL|WebGL-|GL_CLOSE_PATH|ReadPixels/.test(t)) errors.push(`[${m.type()}] ${t}`)
    }
  })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
  await page.addInitScript((q) => {
    localStorage.setItem('dont-look-away.settings.v1', JSON.stringify({ quality: q, filmGrain: 0.5 }))
  }, quality)
  await page.goto(url)
  return { browser, page, errors }
}

export async function enterGame(page) {
  await page.click('.splash')
  await page.waitForFunction(() => window.__DLA?.game.getState().assetsReady === true, null, { timeout: 240000 })
  await page.click('text=START')
  await page.waitForFunction(() => window.__DLA.game.getState().phase === 'PLAYING', null, { timeout: 120000 })
}

export const state = (page) =>
  page.evaluate(() => {
    const r = window.__DLA.runtime()
    const g = window.__DLA.game.getState()
    return {
      phase: g.phase,
      objective: g.objective,
      prompt: g.prompt,
      hasFlashlight: g.hasFlashlight,
      hasBatteries: g.hasBatteries,
      player: [r.player.pos.x, r.player.pos.z].map((v) => +v.toFixed(2)),
      yaw: +r.player.yaw.toFixed(2),
      pitch: +r.player.pitch.toFixed(2),
      creature: [r.creature.pos.x, r.creature.pos.z].map((v) => +v.toFixed(2)),
      creatureState: r.creature.state,
      observed: r.creature.observed,
      active: r.creature.active,
      moves: r.creature.moves,
      dist: +r.creature.distance.toFixed(2),
      time: +r.time.toFixed(1),
      cine: r.cinematic.kind,
      cineT: +r.cinematic.t.toFixed(1),
      flashOn: r.flashlight.on,
      panel: +r.interact.panelProgress.toFixed(2),
    }
  })

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Look toward a world point (yaw 0 faces -z).
export async function lookAt(page, x, z, pitch = 0) {
  await page.evaluate(
    ([x, z, pitch]) => {
      const r = window.__DLA.runtime()
      const dx = x - r.player.pos.x
      const dz = z - r.player.pos.z
      const yaw = Math.atan2(-dx, -dz)
      window.__DLA.setLook(yaw, pitch)
    },
    [x, z, pitch],
  )
}

export async function hold(page, key, ms) {
  await page.keyboard.down(key)
  await sleep(ms)
  await page.keyboard.up(key)
}
