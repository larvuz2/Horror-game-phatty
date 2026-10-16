import { launch, enterGame, sleep, lookAt } from './harness.mjs'
const out = process.argv[2] || '/tmp'
const { browser, page, errors } = await launch({ url: 'http://localhost:5173/?debug&maxdt=0.34&skipintro', quality: process.env.Q || 'medium', width: 1280, height: 720 })
await enterGame(page)
await page.evaluate(() => window.__DLA.teleport(0.6, -4.2))
await sleep(2500)
await lookAt(page, 0.6, -7.1, 0.12)
await sleep(2500)
await page.evaluate(() => window.__DLA.death())
for (const t of (process.env.TS || '0.6,2,3.5,5,6.5,8,9.5,11,12.5,14').split(',').map(Number)) {
  await page.waitForFunction((t) => window.__DLA.runtime().cinematic.t >= t, t, { timeout: 300000 })
  await page.screenshot({ path: `${out}/d_${t}.png`, timeout: 240000 })
}
console.log(errors.filter((e) => !/Clock|deprecated|KHR/.test(e)).join('\n'))
await browser.close()
