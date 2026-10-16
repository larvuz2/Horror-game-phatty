// Visual tour: high-quality screenshots from key viewpoints (creature frozen).
import { launch, enterGame, sleep, lookAt, state } from './harness.mjs'
const out = process.argv[2] || '/tmp'
const only = process.argv[3]
const { browser, page, errors } = await launch({ url: 'http://localhost:5173/?debug&maxdt=0.5&skipintro', quality: process.env.Q || 'high', width: 1280, height: 720 })
await enterGame(page)
await page.evaluate(() => window.__DLA.creature(0.6, -7.1, true))
const shot = async (name, setup, wait = 5000) => {
  if (only && !only.split(',').includes(name)) return
  await page.evaluate(setup)
  await sleep(wait)
  await page.screenshot({ path: `${out}/tour_${name}.png`, timeout: 240000 })
  console.log(name, JSON.stringify(await state(page)))
}
await shot('start', () => { window.__DLA.setLook(Math.atan2(0.4, 14.5), 0.02) })
await shot('table', () => { const r = window.__DLA.runtime(); window.__DLA.setLook(Math.atan2(-(1.9 - r.player.pos.x), -(5.7 - r.player.pos.z)), -0.45) })
await shot('mid_dark', () => { window.__DLA.teleport(0.2, 1.5); window.__DLA.setLook(Math.atan2(-0.4, 8.6), 0.03); window.__DLA.creature(0.6, -7.1, true) })
await shot('mid_flash', () => { window.__DLA.give('all') })
await shot('creature_close', () => { window.__DLA.teleport(0.5, -2.2); window.__DLA.creature(0.6, -5.4, true); window.__DLA.setLook(Math.atan2(-0.1, 3.2), 0.18) }, 7000)
await shot('batteries', () => { window.__DLA.teleport(-4.4, 7.2); window.__DLA.setLook(Math.PI + 0.1, -0.5); window.__DLA.creature(0.6, -7.1, true) })
await shot('panel', () => { window.__DLA.teleport(-4.6, -2.0); window.__DLA.setLook(Math.PI / 2 - 0.25, -0.05) })
await shot('shelves', () => { window.__DLA.teleport(-2.0, 0.9); window.__DLA.setLook(0.25, 0.0) })
await shot('back_south', () => { window.__DLA.teleport(0.5, -4); window.__DLA.setLook(Math.PI, -0.05) })
console.log('ERRORS:\n' + errors.join('\n'))
await browser.close()
