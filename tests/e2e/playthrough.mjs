// Automated gameplay checks in headless Chromium. Run with the dev server on :5173.
//   node tests/e2e/playthrough.mjs [victory|approach|unseen|watched|all] [screenshotDir]
import { launch, enterGame, state, sleep, lookAt, hold } from './harness.mjs'

const which = process.argv[2] || 'all'
const out = process.argv[3]
const results = []
const check = (name, cond, info = '') => {
  results.push({ name, ok: !!cond })
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${info ? '  ' + info : ''}`)
}
const waitPhase = (page, phase, timeout = 120000) =>
  page.waitForFunction((p) => window.__DLA.game.getState().phase === p, phase, { timeout }).then(() => true, () => false)

async function freshGame() {
  const ctx = await launch({ url: (process.env.BASE || 'http://localhost:5173') + '/?debug&maxdt=0.25&skipintro&dpr=0.5', quality: 'low', width: 640, height: 360 })
  await enterGame(ctx.page)
  return ctx
}

async function victory() {
  const { browser, page, errors } = await freshGame()
  let s = await state(page)
  check('starts in PLAYING with FIND_FLASHLIGHT', s.phase === 'PLAYING' && s.objective === 'FIND_FLASHLIGHT', JSON.stringify(s))
  check('creature inactive at start', !s.active)
  // Walk toward the table for a bit (tests the character controller).
  await lookAt(page, 1.9, 5.7, -0.2)
  await sleep(600)
  await hold(page, 'KeyW', 2500)
  s = await state(page)
  check('player moved with W', Math.hypot(s.player[0] - 0.2, s.player[1] - 7.4) > 0.3, JSON.stringify(s.player))
  const pitch0 = s.pitch
  await hold(page, 'ArrowUp', 1200)
  await sleep(400)
  s = await state(page)
  check('ArrowUp tilts the view up', s.pitch > pitch0 + 0.2, `${pitch0} -> ${s.pitch}`)
  await hold(page, 'ArrowDown', 1200)
  await sleep(400)
  const s2p = await state(page)
  check('ArrowDown tilts the view down', s2p.pitch < s.pitch - 0.2, `${s.pitch} -> ${s2p.pitch}`)
  const markers = await page.evaluate(() => document.querySelectorAll('.marker').length)
  check('interaction markers exist', markers > 0, `markers=${markers}`)
  await page.evaluate(() => window.__DLA.teleport(1.55, 6.55))
  await sleep(800)
  await lookAt(page, 1.72, 5.62, -0.62)
  await sleep(1200)
  s = await state(page)
  check('flashlight prompt shown', s.prompt === 'E — PICK UP', `prompt=${s.prompt}`)
  await hold(page, 'KeyE', 300)
  await sleep(1500)
  s = await state(page)
  check('flashlight picked up', s.hasFlashlight)
  await hold(page, 'KeyF', 200)
  await sleep(500)
  const msgs = await page.evaluate(() => window.__DLA.game.getState().messages.map((m) => m.text))
  check('NO BATTERIES message on empty click', msgs.includes('NO BATTERIES'), JSON.stringify(msgs))
  await sleep(3500)
  s = await state(page)
  check('objective FIND_BATTERIES', s.objective === 'FIND_BATTERIES', s.objective)
  check('creature activated after pickup', s.active)
  // Freeze the creature for the rest of the victory path.
  await page.evaluate(() => window.__DLA.creature(0.6, -7.1, true))
  await page.evaluate(() => window.__DLA.teleport(-4.45, 7.65))
  await sleep(800)
  await lookAt(page, -4.45, 8.42, -0.75)
  await sleep(1200)
  s = await state(page)
  check('battery prompt shown', s.prompt === 'E — PICK UP', `prompt=${s.prompt}`)
  await hold(page, 'KeyE', 300)
  await sleep(4000)
  s = await state(page)
  check('batteries picked and flashlight on', s.hasBatteries && s.flashOn, JSON.stringify({ b: s.hasBatteries, on: s.flashOn }))
  check('objective RESTORE_POWER', s.objective === 'RESTORE_POWER', s.objective)
  // Left click works exactly like F, and never touches the room lights.
  const roomBefore = await page.evaluate(() => { const l = window.__DLA.runtime().lights; return { master: l.master, scripted: l.scripted } })
  if (!(await page.evaluate(() => !!document.pointerLockElement))) {
    await page.mouse.click(320, 180) // capture the mouse first
    await sleep(500)
  }
  if (await page.evaluate(() => !!document.pointerLockElement)) {
    const before = (await state(page)).flashOn
    await page.mouse.click(320, 180)
    await sleep(500)
    check('left click toggles the flashlight like F', (await state(page)).flashOn === !before)
    await page.mouse.click(320, 180)
    await sleep(500)
    check('left click toggles it back', (await state(page)).flashOn === before)
  }
  const roomAfter = await page.evaluate(() => { const l = window.__DLA.runtime().lights; return { master: l.master, scripted: l.scripted } })
  check('room lights untouched by flashlight toggles', JSON.stringify(roomBefore) === JSON.stringify(roomAfter) && !roomAfter.scripted && roomAfter.master === 1, JSON.stringify(roomAfter))
  await hold(page, 'KeyF', 200)
  await sleep(400)
  check('F still toggles the flashlight', (await state(page)).flashOn === false)
  await hold(page, 'KeyF', 200)
  await sleep(400)
  if (out) await page.screenshot({ path: `${out}/pt_batteries.png` })
  await page.evaluate(() => window.__DLA.teleport(-5.0, -2.4))
  await sleep(800)
  await lookAt(page, -5.6, -2.5, -0.1)
  await sleep(1200)
  s = await state(page)
  check('panel prompt shown', s.prompt === 'HOLD E — RESTORE POWER', `prompt=${s.prompt}`)
  // Hold briefly, release (progress decays), then hold to completion.
  await hold(page, 'KeyE', 700)
  const p1 = (await state(page)).panel
  await sleep(1200)
  const p2 = (await state(page)).panel
  check('panel progress decays when released', p1 > 0 && p2 < p1, `${p1} -> ${p2}`)
  await page.keyboard.down('KeyE')
  const vok = await waitPhase(page, 'VICTORY_CINEMATIC', 30000)
  await page.keyboard.up('KeyE')
  check('victory cinematic starts', vok)
  await sleep(5000)
  if (out) await page.screenshot({ path: `${out}/pt_victory_lit.png` })
  s = await state(page)
  check('creature gone after lights', s.creatureState === 'GONE', s.creatureState)
  const vs = await waitPhase(page, 'VICTORY_SCREEN', 60000)
  check('victory screen', vs)
  await sleep(2600)
  if (out) await page.screenshot({ path: `${out}/pt_victory_screen.png` })
  // Play again resets everything.
  await page.click('text=PLAY AGAIN')
  await waitPhase(page, 'PLAYING', 60000)
  s = await state(page)
  check('play again resets run', s.objective === 'FIND_FLASHLIGHT' && !s.hasFlashlight && !s.hasBatteries && s.creature[0] === 0.6 && s.creature[1] === -7.1 && !s.cine, JSON.stringify(s))
  report(errors)
  await browser.close()
}

async function approach() {
  const { browser, page, errors } = await freshGame()
  await page.evaluate(() => window.__DLA.teleport(0.6, -3.6))
  await sleep(800)
  await lookAt(page, 0.6, -7.1, 0.1)
  await sleep(800)
  let s = await state(page)
  check('watching the creature', s.observed, JSON.stringify(s))
  await page.keyboard.down('KeyW')
  const ok = await waitPhase(page, 'DEATH_CINEMATIC', 40000)
  await page.keyboard.up('KeyW')
  s = await state(page)
  check('walking into it triggers death', ok, JSON.stringify(s))
  check('creature never moved while watched', s.moves === 0, `moves=${s.moves}`)
  const shots = [2, 5, 8, 10.5, 12.5, 14]
  const lightLog = []
  for (const t of shots) {
    await page.waitForFunction((t) => window.__DLA.runtime().cinematic.t >= t, t, { timeout: 60000 }).catch(() => {})
    lightLog.push(await page.evaluate(() => { const l = window.__DLA.runtime().lights; return { master: l.master, scripted: l.scripted, F1: l.fixtures.F1 } }))
    if (out) await page.screenshot({ path: `${out}/pt_death_${t}.png` })
  }
  check('room lights untouched during the death sequence', lightLog.every((l) => l.master === 1 && !l.scripted) && new Set(lightLog.map((l) => l.F1.toFixed(3))).size > 1, JSON.stringify(lightLog.map((l) => l.F1.toFixed(2))))
  const ds = await waitPhase(page, 'DEATH_SCREEN', 60000)
  check('death screen appears', ds)
  await sleep(2500)
  if (out) await page.screenshot({ path: `${out}/pt_death_screen.png` })
  await page.click('text=TRY AGAIN')
  await waitPhase(page, 'PLAYING', 60000)
  s = await state(page)
  check('try again resets run', s.objective === 'FIND_FLASHLIGHT' && !s.hasFlashlight && s.creature[0] === 0.6 && !s.cine && s.creatureState !== 'CINEMATIC', JSON.stringify(s))
  report(errors)
  await browser.close()
}

async function unseen() {
  const { browser, page, errors } = await freshGame()
  await page.evaluate(() => window.__DLA.give('flashlight'))
  await sleep(1000)
  // Face the south wall and wait.
  await lookAt(page, 0.2, 9, 0)
  const t0 = Date.now()
  const ok = await waitPhase(page, 'DEATH_CINEMATIC', 90000)
  const s = await state(page)
  check('creature reaches the player when unwatched', ok, `after ${((Date.now() - t0) / 1000).toFixed(0)}s, moves=${s.moves}`)
  check('it repositioned several times', s.moves >= 3, `moves=${s.moves}`)
  report(errors)
  await browser.close()
}

async function watched() {
  const { browser, page, errors } = await freshGame()
  await page.evaluate(() => window.__DLA.give('flashlight'))
  // Look at it from the start for 12 game seconds: no moves allowed.
  await lookAt(page, 0.6, -7.1, 0.02)
  await sleep(12000)
  let s = await state(page)
  check('no movement while observed', s.moves === 0 && s.observed, JSON.stringify({ moves: s.moves, observed: s.observed }))
  // Turn away for a few seconds, then back: it must be closer, and never moved in view.
  await lookAt(page, 0.2, 9, 0)
  await sleep(4500)
  await lookAt(page, s.creature[0], s.creature[1], 0)
  await sleep(500)
  const s2 = await state(page)
  check('closer after looking away', s2.dist < s.dist - 1, `${s.dist} -> ${s2.dist} (moves ${s2.moves})`)
  // Hidden-move check: sample many frames; whenever a move happens the creature must not have been observed.
  const violations = await page.evaluate(async () => {
    const r = () => window.__DLA.runtime()
    let last = r().creature.moves
    let bad = 0
    const until = performance.now() + 15000
    window.__DLA.setLook(Math.PI * 0.5, 0)
    while (performance.now() < until) {
      await new Promise((res) => requestAnimationFrame(res))
      const c = r().creature
      if (c.moves !== last) {
        if (c.observed) bad++
        last = c.moves
      }
      // Sweep the view around.
      window.__DLA.setLook(r().player.yaw + 0.25, 0)
    }
    return bad
  })
  check('never repositioned while observed (sweep)', violations === 0, `violations=${violations}`)
  report(errors)
  await browser.close()
}

async function clicks() {
  const { browser, page, errors } = await freshGame()
  await page.evaluate(() => window.__DLA.give('flashlight'))
  await sleep(1500)
  await page.mouse.click(320, 180) // capture the mouse
  await sleep(500)
  await page.mouse.click(320, 180)
  await sleep(600)
  const msgs = await page.evaluate(() => window.__DLA.game.getState().messages.map((m) => m.text))
  const locked = await page.evaluate(() => !!document.pointerLockElement)
  check('left click without batteries says NO BATTERIES (same as F)', !locked || msgs.includes('NO BATTERIES'), JSON.stringify({ locked, msgs }))
  report(errors)
  await browser.close()
}

function report(errors) {
  const real = errors.filter((e) => !/THREE.Clock|deprecated parameters|KHR_parallel_shader_compile|PCFSoftShadowMap/.test(e))
  check('no console errors', real.length === 0, real.slice(0, 5).join(' | '))
}

const runs = { victory, approach, unseen, watched, clicks }
for (const [name, fn] of Object.entries(runs)) {
  if (which !== 'all' && which !== name) continue
  console.log(`\n=== ${name}`)
  try {
    await fn()
  } catch (e) {
    check(`${name} crashed`, false, e.message)
  }
}
const failed = results.filter((r) => !r.ok)
console.log(`\n${results.length - failed.length}/${results.length} checks passed`)
process.exit(failed.length ? 1 : 0)
