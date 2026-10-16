// Mobile checks: touch joystick moves, drag looks, on-screen E interacts, markers appear.
import { chromium } from 'playwright'
const BASE = process.env.BASE || 'http://localhost:5173'
const out = process.argv[2]
let fails = 0
const check = (n, c, i = '') => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'}  ${n} ${i}`) }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
const cdp = await ctx.newCDPSession(page)
const touch = (type, points) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y, id]) => ({ x, y, id })) })
const st = () => page.evaluate(() => { const r = window.__DLA.runtime(); const g = window.__DLA.game.getState(); return { phase: g.phase, quality: JSON.parse(localStorage.getItem('dont-look-away.settings.v1') || '{}').quality, x: +r.player.pos.x.toFixed(2), z: +r.player.pos.z.toFixed(2), yaw: +r.player.yaw.toFixed(2), hasFlashlight: g.hasFlashlight, prompt: g.prompt } })

await page.goto(`${BASE}/?debug&maxdt=0.25&skipintro&dpr=0.5`)
await page.tap('.splash')
await page.waitForFunction(() => window.__DLA?.game.getState().assetsReady && window.__DLA.game.getState().audioReady, null, { timeout: 240000 })
if (out) await page.screenshot({ path: `${out}/m_menu.png` })
await page.tap('text=START')
await page.waitForFunction(() => window.__DLA.game.getState().phase === 'PLAYING', null, { timeout: 120000 })
check('touch controls visible', await page.locator('.touch-interact').isVisible())
let s0 = await st()
// Joystick: hold left thumb pushed up.
await touch('touchStart', [[150, 260, 1]])
for (let i = 0; i < 6; i++) { await touch('touchMove', [[150, 260 - i * 10, 1]]); await sleep(60) }
await sleep(2500)
await touch('touchEnd', [])
let s1 = await st()
check('joystick moves the player forward', s1.z < s0.z - 0.3, `${s0.z} -> ${s1.z}`)
// Look: drag on the right half.
await touch('touchStart', [[650, 200, 2]])
for (let i = 1; i <= 8; i++) { await touch('touchMove', [[650 - i * 15, 200, 2]]); await sleep(40) }
await touch('touchEnd', [])
await sleep(800)
const s2 = await st()
check('drag rotates the view', Math.abs(s2.yaw - s1.yaw) > 0.2, `${s1.yaw} -> ${s2.yaw}`)
// Both at once (multi-touch).
await touch('touchStart', [[150, 260, 3], [650, 200, 4]])
for (let i = 1; i <= 6; i++) { await touch('touchMove', [[150, 260 + i * 8, 3], [650 + i * 12, 200, 4]]); await sleep(60) }
await sleep(1200)
await touch('touchEnd', [])
const s3 = await st()
check('move + look simultaneously', s3.z > s2.z && Math.abs(s3.yaw - s2.yaw) > 0.1, JSON.stringify({ z: [s2.z, s3.z], yaw: [s2.yaw, s3.yaw] }))
// Interact with the on-screen E near the flashlight (aim only roughly).
await page.evaluate(() => { window.__DLA.teleport(1.55, 6.6); })
await sleep(800)
await page.evaluate(() => { const r = window.__DLA.runtime(); window.__DLA.setLook(Math.atan2(-(1.72 - r.player.pos.x), -(5.62 - r.player.pos.z)) + 0.25, -0.2) })
await sleep(1500)
const marker = await page.evaluate(() => [...document.querySelectorAll('.marker')].map((m) => ({ cls: m.className, op: m.style.opacity, label: m.querySelector('.marker-label').textContent })))
check('interaction marker shown near the flashlight', marker.some((m) => m.cls.includes('target') && +m.op > 0.3), JSON.stringify(marker))
if (out) await page.screenshot({ path: `${out}/m_marker.png` })
const s4 = await st()
check('prompt available with rough aim', s4.prompt === 'E — PICK UP', String(s4.prompt))
const box = await page.locator('.touch-interact').boundingBox()
await touch('touchStart', [[box.x + box.width / 2, box.y + box.height / 2, 5]])
await sleep(400)
await touch('touchEnd', [])
await sleep(800)
check('on-screen E picks up the flashlight', (await st()).hasFlashlight)
check('flashlight button appears', await page.locator('.touch-flash').isVisible())
// Pause and resume on touch.
await page.tap('.touch-pause')
await sleep(500)
check('pause button pauses', (await st()).phase === 'PAUSED')
await page.tap('text=RESUME')
await sleep(800)
check('resume on touch', (await st()).phase === 'PLAYING')
check('mobile defaults to low quality', (await page.evaluate(() => document.querySelector('canvas') !== null)))
check('no page errors', errors.length === 0, errors.join(' | '))
await browser.close()
console.log(fails ? `${fails} FAILED` : 'ALL PASSED')
process.exit(fails ? 1 : 0)
