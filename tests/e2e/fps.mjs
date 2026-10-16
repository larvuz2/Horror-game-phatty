import { launch, sleep } from './harness.mjs'
const { browser, page, errors } = await launch({ quality: process.env.Q || 'low', width: +(process.env.W || 640), height: +(process.env.H || 360) })
await page.click('.splash')
await page.waitForFunction(() => window.__DLA?.game.getState().assetsReady === true, null, { timeout: 240000 })
await page.click('text=START')
await sleep(3000)
const fps = await page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 5000) requestAnimationFrame(f); else res(n / ((performance.now() - t0) / 1000)) }; requestAnimationFrame(f) }))
console.log('fps', fps.toFixed(2))
await browser.close()
