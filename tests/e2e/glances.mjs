// Look at it, look away, look back to the SAME view: it must be closer and still dead ahead.
import { launch, enterGame, sleep, state } from './harness.mjs'
const out = process.argv[2]
const quality = process.env.Q || 'low'
const { browser, page } = await launch({ url: `http://localhost:5173/?debug&maxdt=${quality === 'low' ? 0.25 : 0.5}&skipintro&dpr=${quality === 'low' ? 0.5 : 1}`, quality, width: quality === 'low' ? 640 : 1280, height: quality === 'low' ? 360 : 720 })
let fails = 0
const check = (n, c, i = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${i}`) }
await enterGame(page)
await page.evaluate(() => window.__DLA.give('flashlight'))
const yaw = await page.evaluate(() => { const r = window.__DLA.runtime(); const y = Math.atan2(-(r.creature.pos.x - r.player.pos.x), -(r.creature.pos.z - r.player.pos.z)); window.__DLA.setLook(y, 0.05); return y })
await sleep(1500)
let s = await state(page)
let last = s.dist
if (out) await page.screenshot({ path: `${out}/g_0.png`, timeout: 240000 })
for (let i = 1; i <= 4; i++) {
  await page.evaluate((y) => window.__DLA.setLook(y + Math.PI, 0), yaw) // turn all the way around
  await sleep(i === 4 ? 2600 : 1600)
  await page.evaluate((y) => window.__DLA.setLook(y, 0.05), yaw) // back to the exact same view
  await sleep(1200)
  s = await state(page)
  if (s.phase !== 'PLAYING') { console.log('phase', s.phase); break }
  const bearing = Math.atan2(-(s.creature[0] - s.player[0]), -(s.creature[1] - s.player[1]))
  check(`glance ${i}: closer`, s.dist < last - 0.8, `${last} -> ${s.dist}`)
  check(`glance ${i}: still straight ahead`, Math.abs(bearing - yaw) < 0.12, `bearing off by ${(Math.abs(bearing - yaw) * 57.3).toFixed(1)} deg`)
  last = s.dist
  if (out) await page.screenshot({ path: `${out}/g_${i}.png`, timeout: 240000 })
}
await browser.close()
console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
process.exit(fails ? 1 : 0)
