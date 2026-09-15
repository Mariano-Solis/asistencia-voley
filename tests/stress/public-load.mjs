import { performance } from 'node:perf_hooks'

const BASE_URL = process.env.BASE_URL || 'https://www.voleysanmartin.com.ar/'
const TOTAL = Number(process.env.TOTAL_REQUESTS || 600)
const CONCURRENCY = Number(process.env.CONCURRENCY || 40)
const TIMEOUT_MS = Number(process.env.REQUEST_TIMEOUT_MS || 12000)

const latencies = []
const failures = []
let ok = 0
let index = 0

async function one(i) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const start = performance.now()
  try {
    const url = new URL(BASE_URL)
    url.searchParams.set('stress', `${Date.now()}-${i}`)
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'cache-control': 'no-cache',
        'user-agent': 'VoleySanMartin-StressTest/1.0',
      },
    })
    const text = await res.text()
    const elapsed = performance.now() - start
    latencies.push(elapsed)
    if (!res.ok || !text.includes('id="root"') || !text.includes('Municipalidad de San Martín - VOLEY')) {
      failures.push({ i, status: res.status, elapsed: Math.round(elapsed), root: text.includes('id="root"') })
    } else {
      ok += 1
    }
  } catch (error) {
    failures.push({ i, error: error?.name || String(error) })
  } finally {
    clearTimeout(timer)
  }
}

async function worker() {
  while (true) {
    const i = index++
    if (i >= TOTAL) return
    await one(i)
  }
}

const started = performance.now()
await Promise.all(Array.from({ length: CONCURRENCY }, worker))
const duration = performance.now() - started
latencies.sort((a, b) => a - b)
const pct = p => latencies.length ? latencies[Math.min(latencies.length - 1, Math.floor((latencies.length - 1) * p))] : 0
const failureRate = failures.length / TOTAL

const report = {
  baseUrl: BASE_URL,
  total: TOTAL,
  concurrency: CONCURRENCY,
  ok,
  failed: failures.length,
  failureRatePct: Number((failureRate * 100).toFixed(2)),
  durationMs: Math.round(duration),
  requestsPerSecond: Number((TOTAL / (duration / 1000)).toFixed(2)),
  latencyMs: {
    min: Math.round(latencies[0] || 0),
    p50: Math.round(pct(0.50)),
    p95: Math.round(pct(0.95)),
    p99: Math.round(pct(0.99)),
    max: Math.round(latencies.at(-1) || 0),
  },
  sampleFailures: failures.slice(0, 20),
}

console.log(JSON.stringify(report, null, 2))
if (failureRate > 0.02) process.exit(1)
