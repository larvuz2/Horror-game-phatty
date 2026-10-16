// Regression: toggling the flashlight must not change how the room is lit (High quality has AO).
// Pins the fluorescent level, toggles the flashlight and compares the frame. Usage: Q=high node tests/e2e/flashlight-lighting.mjs <dir>
import { launch, enterGame, sleep, lookAt } from './harness.mjs'
import { execFileSync } from 'node:child_process'
const out = process.argv[2] || '/tmp'
const q = process.env.Q || 'medium'
const { browser, page } = await launch({ url: 'http://localhost:5173/?debug&maxdt=0.5&skipintro', quality: q, width: 960, height: 540 })
await enterGame(page)
await page.evaluate(() => {
  window.__DLA.creature(0.6, -7.1, true)
  const l = window.__DLA.runtime().lights
  l.scripted = true; l.fixtures.F1 = 0.9; l.fixtures.F2 = 0; l.fixtures.F3 = 0; l.fixtures.F4 = 0
  window.__DLA.give('all')
})
await page.evaluate(() => window.__DLA.teleport(-1.5, 6.5))
await sleep(2500)
await lookAt(page, 1.5, 2.0, -0.25) // F1-lit floor area
await sleep(4000)
const shot = async (n) => { await sleep(2500); await page.screenshot({ path: `${out}/${n}.png`, timeout: 240000 }) }
await shot(`pin_${q}_on`)
await page.keyboard.press('KeyF'); await shot(`pin_${q}_off`)
await page.keyboard.press('KeyF'); await shot(`pin_${q}_on2`)
await browser.close()
const mean = (f) => +execFileSync('convert', [f, '-colorspace', 'Gray', '-format', '%[fx:mean*255]', 'info:']).toString()
const on = mean(`${out}/pin_${q}_on.png`), off = mean(`${out}/pin_${q}_off.png`)
const ok = off <= on + 1.5 && on >= off - 0.5
console.log(`${ok ? 'PASS' : 'FAIL'}  room brightness with flashlight on ${on.toFixed(2)} vs off ${off.toFixed(2)}`)
process.exit(ok ? 0 : 1)
