// Pause/resume, restart from pause, and settings persistence.
import { chromium } from 'playwright'
import { launch, enterGame, sleep, state } from './harness.mjs'
const BASE = process.env.BASE || 'http://localhost:5173'
let fails = 0
const check = (n, c, i = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${i}`) }

{
  const { browser, page } = await launch({ url: `${BASE}/?debug&maxdt=0.25&skipintro&dpr=0.5`, quality: 'low', width: 640, height: 360 })
  await enterGame(page)
  await page.keyboard.press('Escape')
  await sleep(800)
  let s = await state(page)
  check('Esc pauses', s.phase === 'PAUSED', s.phase)
  const t0 = s.time
  await sleep(2000)
  s = await state(page)
  check('time frozen while paused', s.time === t0, `${t0} -> ${s.time}`)
  await page.click('text=RESUME')
  await sleep(1500)
  s = await state(page)
  check('resume returns to PLAYING', s.phase === 'PLAYING', s.phase)
  await page.keyboard.press('Escape')
  await sleep(600)
  await page.click('text=RESTART')
  await page.waitForFunction(() => window.__DLA.game.getState().phase === 'PLAYING', null, { timeout: 60000 })
  s = await state(page)
  check('restart from pause starts a fresh run', s.time < 2 && s.objective === 'FIND_FLASHLIGHT', JSON.stringify(s))
  // Pausing right after grabbing the batteries must not lose the battery insertion.
  await page.evaluate(() => { window.__DLA.give('flashlight'); window.__DLA.creature(0.6, -7.1, true); window.__DLA.teleport(-4.45, 7.65) })
  await sleep(800)
  await page.evaluate(() => { const r = window.__DLA.runtime(); window.__DLA.setLook(Math.atan2(-(-4.45 - r.player.pos.x), -(8.42 - r.player.pos.z)), -0.75) })
  await sleep(1200)
  await page.keyboard.press('KeyE')
  await sleep(300)
  await page.keyboard.press('Escape')
  await sleep(3500)
  await page.click('text=RESUME')
  await sleep(4500)
  s = await state(page)
  check('battery insertion survives a pause', s.hasBatteries && s.flashOn && s.objective === 'RESTORE_POWER', JSON.stringify({ b: s.hasBatteries, on: s.flashOn, o: s.objective }))
  await page.keyboard.press('Escape')
  await sleep(600)
  await page.click('text=QUIT TO MENU')
  await sleep(1000)
  check('quit to menu', (await state(page)).phase === 'MAIN_MENU')
  await browser.close()
}

{
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/?dpr=0.5`)
  await page.click('.splash')
  await page.click('text=SETTINGS')
  await page.click('button.choice:has-text("HIGH")')
  await page.locator('input[type=range]').first().fill('0.3')
  await page.click('text=INVERT MOUSE Y')
  await sleep(300)
  await page.reload()
  await page.click('.splash')
  await page.click('text=SETTINGS')
  const high = await page.locator('button.choice.active').innerText()
  const vol = await page.locator('input[type=range]').first().inputValue()
  const inv = await page.locator('button:has-text("INVERT MOUSE Y") .setting-value').innerText()
  check('settings persist across reloads', high === 'HIGH' && Math.abs(parseFloat(vol) - 0.3) < 0.01 && inv === 'ON', `${high} ${vol} ${inv}`)
  await browser.close()
}
console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
process.exit(fails ? 1 : 0)
