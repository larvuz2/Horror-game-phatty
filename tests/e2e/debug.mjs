import { launch, state, sleep } from './harness.mjs'
const out = process.argv[2] || '/tmp'
const { browser, page, errors } = await launch({ quality: process.env.Q || 'medium' })
try {
  await page.click('.splash')
  await page.waitForFunction(() => window.__DLA?.game.getState().assetsReady === true, null, { timeout: 240000 })
  console.log('ready')
  await page.click('text=START')
  for (let i = 0; i < 12; i++) {
    await sleep(2000)
    const s = await page.evaluate(() => ({ phase: window.__DLA.game.getState().phase, fps: performance.now() }))
    console.log(JSON.stringify(s))
    if (s.phase === 'PLAYING') break
  }
  await page.screenshot({ path: `${out}/debug.png` })
  console.log(JSON.stringify(await state(page)))
} catch (e) {
  console.log('FAIL', e.message)
}
console.log('ERRORS:\n' + errors.slice(0, 30).join('\n'))
await browser.close()
