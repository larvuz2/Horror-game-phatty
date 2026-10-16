import { launch, sleep } from './harness.mjs'
const out = process.argv[2] || '/tmp'
const { browser, page } = await launch({ url: 'http://localhost:5173/?debug&maxdt=0.1&dpr=0.5', quality: 'low', width: 960, height: 540 })
await page.click('.splash')
await page.waitForFunction(() => window.__DLA?.game.getState().assetsReady && window.__DLA.game.getState().audioReady, null, { timeout: 240000 })
await page.click('text=START')
const seen = new Set()
const t0 = Date.now()
while (Date.now() - t0 < 120000) {
  const bg = await page.evaluate(() => document.querySelector('.fader').style.background + '|' + document.querySelector('.fader').style.opacity)
  const m = bg.match(/gradient\((?:ellipse )?([\d.]+)% ([\d.]+)%/)
  const h = m ? +m[2] : -1
  const bucket = h < 0 ? 'none' : h < 5 ? 'closed' : h < 30 ? 'slit' : h < 100 ? 'half' : 'open'
  if (!seen.has(bucket)) { seen.add(bucket); await page.screenshot({ path: `${out}/intro_${bucket}.png` }); console.log(bucket, bg.slice(0, 90)) }
  if ((await page.evaluate(() => window.__DLA.game.getState().phase)) === 'PLAYING') break
  await sleep(150)
}
await browser.close()
