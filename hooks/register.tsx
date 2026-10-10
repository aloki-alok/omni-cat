import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, Timer } from 'claude-code'

import type { Call, Phase, Result } from '../types'
import { draw, MASCOTS, toCells } from './art'
import type { Mascot } from './art'
import { newerLog, parseLog, unansweredReason } from './lib'

const call = atom({ plugin: 'omni-cat', key: 'call' } as const, { phase: 'idle', note: '', result: null } as Call)
const tick = atom({ plugin: 'omni-cat', key: 'tick' } as const, 0)

const POLL_MS = 5000
const POLL_LIMIT = 36 // 3 minutes
const SHOW_DONE_MS = 90_000
const USAGE = 'Usage: /omni check (no call) | test (dial your phone) | last (read the last call) | demo [cat|crab|logo] | clear'

type Row = Record<string, unknown> & { id: number }
type Settings = { api_key: string; agent_id: string; phone: string; mascot: Mascot }

const API = 'https://omnidim.io/api/v1'

// Module variables restart on every reload; the mascot's state lives in the atoms.
let settings: Settings
let ticker: Timer | undefined
let poller: Timer | undefined
let hideTimer: Timer | undefined
let lastRow: Row | undefined
let isBusy = false
let demoMascot: Mascot | undefined // set only while /omni demo previews another character
let demoId = 0 // bumped to stop a demo that is still playing

async function show($: EngineInterface, phase: Phase, note = '', result: Result | null = null) {
  hideTimer?.cancel()
  // A new phase starts its animation at frame 0; a note change inside a phase must not restart it.
  if ((await read($, call)).phase !== phase) await update($, tick, () => 0)
  await update($, call, () => ({ phase, note, result }))
  if (phase === 'idle') {
    ticker?.cancel()
    ticker = undefined
    return
  }
  ticker ??= $.clock.every(400,() => update($, tick, n => n + 1))
  if (phase === 'done' || phase === 'failed') hideTimer = $.clock.after(SHOW_DONE_MS, () => show($, 'idle'))
}

// The OmniDimension REST API, called directly with the plugin's own key. The key goes only to API.
async function api($: EngineInterface, path: string, init: { method?: string; body?: string } = {}) {
  const res = await $.http.fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${settings.api_key}`, 'Content-Type': 'application/json' },
  })
  let body: Record<string, unknown> = {}
  try {
    body = JSON.parse(res.text)
  } catch {}
  if (!res.ok) throw new Error(String(body.message ?? body.error ?? `OmniDimension answered ${res.status}`).slice(0, 120))
  return body
}

async function latestLogs($: EngineInterface): Promise<Row[]> {
  const page = await api($, `/calls/logs?pageno=1&pagesize=1&agentid=${settings.agent_id}`)
  return (page.call_log_data as Row[] | undefined) ?? []
}

// What stops a call from starting, in the order a person fixes it. Empty when the settings are fine.
function settingsProblem(): string {
  const { api_key, agent_id, phone } = settings
  if (!api_key) return 'Add your OmniDimension API key: run /plugin configure omni-cat, or `claude plugin configure omni-cat@omni-cat`.'
  if (!agent_id || !phone) return 'Set the agent ID and your phone number in /config under omni-cat first.'
  if (!/^\d+$/.test(agent_id)) return 'The agent ID must be a number.'
  if (!/^\+\d{8,15}$/.test(phone)) return 'The phone number needs a country code, like +15551234567.'
  return ''
}

async function finish($: EngineInterface, row: Row, result: Result) {
  lastRow = row
  isBusy = false
  poller?.cancel()
  await show($, 'done', 'Call finished', result)
  $.ui.toast(`Test call done: ${result.sentiment}, ${result.seconds}s`)
}

async function fail($: EngineInterface, why: string) {
  isBusy = false
  poller?.cancel()
  await show($, 'failed', why)
  $.ui.toast(`Test call failed: ${why}`)
}

function watch($: EngineInterface, before: number) {
  let tries = 0
  let errors = 0
  let silent = 0
  poller = $.clock.every(POLL_MS, async () => {
    if (++tries > POLL_LIMIT) return fail($, 'No call log after 3 minutes')
    try {
      const row = newerLog(await latestLogs($), before)
      errors = 0
      if (!row) return
      const why = unansweredReason(row.call_status)
      if (why) return fail($, why)
      if (row.call_status !== 'completed') return show($, 'ringing', 'In call')
      const result = parseLog(row)
      if (result) return finish($, row, result)
      // Seen twice, so a log that is still being written is not called silent too early.
      if (++silent >= 2) return fail($, 'The call connected but nobody spoke')
    } catch {
      if (++errors >= 3) return fail($, 'Could not read call logs')
    }
  })
}

async function startTest($: EngineInterface): Promise<string> {
  const problem = settingsProblem()
  if (problem) return problem
  if (isBusy) return 'A test call is already running.'

  const { agent_id, phone } = settings
  demoId++ // stop a demo that is still playing; the real call owns the display now
  demoMascot = undefined
  isBusy = true
  try {
    await show($, 'dialing', 'Checking your latest call log')
    const before = (await latestLogs($))[0]?.id ?? 0
    await show($, 'dialing', 'Dialing')
    const sent = await api($, '/calls/dispatch', {
      method: 'POST',
      body: JSON.stringify({ agent_id: Number(agent_id), to_number: phone }),
    })
    if (sent.success === false) throw new Error('OmniDimension refused the call')
    await show($, 'ringing', `Ringing ${phone.slice(0, 3)}…${phone.slice(-2)}`)
    watch($, before)
    return 'Dialing your phone. Pick up when it rings and talk to the agent. Your omni cat will report back.'
  } catch (error) {
    await fail($, 'Could not start the call')
    return `Test call did not start: ${(error as Error).message}`
  }
}

async function demo($: EngineInterface, character: Mascot | undefined) {
  const mine = ++demoId
  demoMascot = character
  const sleep = (ms: number) => new Promise<void>(resolve => $.clock.after(ms, resolve))
  const fake = (sentiment: string): Result => ({ seconds: 42, sentiment, cost: 0.12, summary: 'demo' })
  const steps: [Phase, string, string, number][] = [
    ['dialing', 'Dialing (demo)', '', 3000],
    ['ringing', 'Ringing (demo)', '', 5000],
    ['done', 'Call finished (demo)', 'Positive', 4000],
    ['done', 'Call finished (demo)', 'Neutral', 4000],
    ['done', 'Call finished (demo)', 'Negative', 4000],
    ['failed', 'The call connected but nobody spoke (demo)', '', 4000],
  ]
  for (const [phase, note, sentiment, ms] of steps) {
    if (mine !== demoId) return // a test call or /omni clear took over the display
    await show($, phase, note, sentiment ? fake(sentiment) : null)
    await sleep(ms)
  }
  if (mine !== demoId) return
  demoMascot = undefined
  await show($, 'idle')
}

export const register: Register = (on, options) => {
  settings = options as Settings

  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'omni', description: 'Run an OmniDimension test call with your omni cat' })
    return next(e)
  })

  on('command.run', { command: 'omni' }, async ($, e) => {
    const sub = e.args.trim().split(/\s+/)[0]

    if (sub === 'test') return { text: await startTest($) }
    if (sub === 'check') {
      const problem = settingsProblem()
      if (problem) return { text: problem }
      try {
        const [latest] = await latestLogs($)
        return { text: latest ? `Connected to OmniDimension. Latest call log for this agent: #${latest.id}.` : 'Connected to OmniDimension. This agent has no call logs yet.' }
      } catch (error) {
        return { text: `OmniDimension check failed: ${(error as Error).message}` }
      }
    }
    if (sub === 'demo') {
      const pick = e.args.trim().split(/\s+/)[1] as Mascot | undefined
      if (pick && !MASCOTS.includes(pick)) return { text: `Pick one of: ${MASCOTS.join(', ')}.` }
      if (isBusy) return { text: 'A test call is running. Run /omni clear to stop it first.' }
      void demo($, pick)
      return { text: `Demo running with the ${pick ?? settings.mascot}. It ends by itself.` }
    }
    if (sub === 'clear') {
      isBusy = false
      demoId++
      demoMascot = undefined
      poller?.cancel()
      await show($, 'idle')
      return { text: 'Sent your omni cat home.' }
    }
    if (sub === 'last') {
      if (!lastRow) return { text: 'No test call yet. Run /omni test first.' }
      const transcript = String(lastRow.call_conversation ?? '').replace(/<br\s*\/?>/g, '\n')
      return {
        text: 'Last test call loaded for Claude. Ask what to change in the prompt.',
        context: [`Transcript of the last OmniDimension test call:\n${transcript.slice(0, 6000)}`],
      }
    }
    return { text: USAGE }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const { phase, note, result } = await read($, call)
    if (phase === 'idle' || e.props.hasSurvey) return next(e)

    const frame = await read($, tick)
    const { Box, Text, Raster } = $.ui.resolve(e)
    const detail = result
      ? `${result.sentiment}, ${result.seconds}s${result.cost === null ? '' : `, $${result.cost.toFixed(2)}`}`
      : ''
    const pixels = draw(demoMascot ?? settings.mascot, phase, frame, result?.sentiment)

    return (
      <Box gap={2}>
        <Raster key="mascot" columns={pixels.w} rows={pixels.h / 2} cells={toCells(pixels)} />
        <Box flexDirection="column">
          <Text bold>{note}</Text>
          {detail !== '' && <Text dimColor>{detail}</Text>}
        </Box>
      </Box>
    )
  })
}
