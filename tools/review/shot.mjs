// Usage: node tools/review/shot.mjs <url> <out.png> [width height] [waitForExpr]
import { chromium } from 'playwright'
const [url, out, w = '1280', h = '720', waitExpr = 'window.__done === true'] = process.argv.slice(2)
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
const page = await browser.newPage({ viewport: { width: +w, height: +h } })
page.on('console', (m) => console.log('[console]', m.type(), m.text()))
page.on('pageerror', (e) => console.log('[pageerror]', e.message))
await page.goto(url)
await page.waitForFunction(waitExpr, null, { timeout: 180000 })
const labels = await page.evaluate(() => window.__labels)
if (labels) console.log(labels.join('\n'))
await page.screenshot({ path: out, fullPage: true })
await browser.close()
