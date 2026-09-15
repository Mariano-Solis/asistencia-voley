import { test, expect } from '@playwright/test'

const BASE_URL = process.env.BASE_URL || 'https://www.voleysanmartin.com.ar/'

function attachFailureCollectors(page, bucket) {
  page.on('pageerror', error => bucket.push(`pageerror: ${error.message}`))
  page.on('console', msg => {
    if (msg.type() === 'error') bucket.push(`console: ${msg.text()}`)
  })
  page.on('requestfailed', request => {
    const url = request.url()
    if (!url.includes('googleapis.com')) bucket.push(`requestfailed: ${url} :: ${request.failure()?.errorText || ''}`)
  })
}

test.describe.configure({ mode: 'serial', timeout: 90000 })

test('survives reloads, viewport changes, malformed localStorage and rapid UI actions', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 360, height: 740 } })
  const page = await context.newPage()
  const failures = []
  attachFailureCollectors(page, failures)

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#root')).toBeVisible()
  await expect(page.locator('body')).not.toHaveText('')

  await page.evaluate(() => {
    localStorage.setItem('voley_player', '{malformed-json')
    localStorage.setItem('voley_access_mode', 'unexpected-mode')
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.locator('#root')).toBeVisible()

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 360, height: 740 },
    { width: 412, height: 915 },
    { width: 768, height: 1024 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    await page.waitForTimeout(250)
    const bodyWidth = await page.evaluate(() => document.body.scrollWidth)
    expect(bodyWidth).toBeLessThanOrEqual(viewport.width + 2)
  }

  const tabs = page.locator('.auth-tabs button')
  if (await tabs.count()) {
    for (let i = 0; i < 60; i++) {
      await tabs.nth(i % Math.min(await tabs.count(), 3)).click()
    }
  }

  for (let i = 0; i < 8; i++) {
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expect(page.locator('#root')).toBeVisible()
  }

  const mutations = await page.evaluate(async () => {
    let count = 0
    const observer = new MutationObserver(records => { count += records.length })
    observer.observe(document.body, { childList: true, subtree: true, attributes: true })
    await new Promise(resolve => setTimeout(resolve, 3000))
    observer.disconnect()
    return count
  })
  expect(mutations).toBeLessThan(4000)

  expect(failures, failures.join('\n')).toEqual([])
  await context.close()
})

test('survives network loss and recovery without blanking the app', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  const failures = []
  attachFailureCollectors(page, failures)

  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded' })
  await expect(page.locator('#root')).toBeVisible()

  await context.setOffline(true)
  await page.waitForTimeout(600)
  await expect(page.locator('#root')).toBeVisible()

  const notice = page.locator('.mgsm-offline-notice')
  if (await notice.count()) await expect(notice).toBeVisible()

  await context.setOffline(false)
  await page.waitForTimeout(600)
  await expect(page.locator('#root')).toBeVisible()

  expect(failures.filter(x => !x.includes('ERR_INTERNET_DISCONNECTED')), failures.join('\n')).toEqual([])
  await context.close()
})

test('does not crash under many parallel browser sessions', async ({ browser }) => {
  const failures = []
  const sessions = Array.from({ length: 12 }, async (_, i) => {
    const context = await browser.newContext({ viewport: { width: 360 + (i % 3) * 20, height: 740 } })
    const page = await context.newPage()
    attachFailureCollectors(page, failures)
    await page.goto(`${BASE_URL}?browser-chaos=${i}`, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('#root')).toBeVisible()
    await page.waitForTimeout(400)
    await context.close()
  })
  await Promise.all(sessions)
  expect(failures, failures.join('\n')).toEqual([])
})
