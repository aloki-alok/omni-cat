import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const options = {
  api_key: 'k-test',
  agent_id: '12',
  phone: '+15551234567',
}
const reply = (status: number, body: unknown) => ({
  status,
  ok: status >= 200 && status < 300,
  headers: {},
  text: JSON.stringify(body),
})

// The API as the test call sees it: the newest log is id 5 until the call is dialed, then `after`.
function fakeApi(on: On, after: object[], dispatch = reply(200, { success: true })) {
  const seen: { url: string; method?: string; auth?: string; body?: string }[] = []
  let isDialed = false
  on('http.fetch', async ($, e) => {
    seen.push({ url: e.url, method: e.init?.method, auth: e.init?.headers?.Authorization, body: e.init?.body })
    if (e.url.endsWith('/calls/dispatch')) {
      isDialed = true
      return { value: dispatch }
    }
    return { value: reply(200, { call_log_data: isDialed ? after : [{ id: 5 }] }) }
  })
  return seen
}

function toasts(on: On) {
  const texts: string[] = []
  on('ui.toast', async ($, e) => {
    texts.push(e.text)
    return { value: undefined }
  })
  return texts
}

test('a connected call where nobody spoke is reported, not called a success', { options }, async ($, on) => {
  const clock = mock.clock(on)
  const seen = fakeApi(on, [{ id: 6, call_status: 'completed', call_conversation: ' <br/> user:  <br/> ' }])
  const said = toasts(on)

  await $.command.run({ command: 'omni', args: 'test' })
  await clock.advance(15_000)

  expect(said.join()).toContain('nobody spoke')
  const dial = seen.find(s => s.url.endsWith('/calls/dispatch'))
  expect(dial?.method).toBe('POST')
  expect(JSON.parse(dial?.body ?? '{}')).toEqual({ agent_id: 12, to_number: '+15551234567' })
  expect(dial?.auth).toBe('Bearer k-test')
})

test('the poll reads one small log row for this agent, never a big page', { options }, async ($, on) => {
  const clock = mock.clock(on)
  const seen = fakeApi(on, [])

  await $.command.run({ command: 'omni', args: 'test' })
  await clock.advance(6_000)

  const reads = seen.filter(s => s.url.includes('/calls/logs'))
  expect(reads.length).toBeGreaterThan(1)
  for (const read of reads) expect(read.url).toBe('https://omnidim.io/api/v1/calls/logs?pageno=1&pagesize=1&agentid=12')
})

test('a call with speech reports its sentiment once it completes', { options }, async ($, on) => {
  const clock = mock.clock(on)
  fakeApi(on, [
    {
      id: 6,
      call_status: 'completed',
      call_conversation: ' <br/> LLM: Hello <br/> user: hi <br/>',
      sentiment_score: 'Positive',
      call_duration_in_seconds: 30,
    },
  ])
  const said = toasts(on)

  await $.command.run({ command: 'omni', args: 'test' })
  await clock.advance(6_000)

  expect(said.join()).toContain('Positive')
})

test('a refused dispatch shows the reason and nothing is polled', { options }, async ($, on) => {
  const seen = fakeApi(on, [], reply(402, { message: 'Insufficient credit' }))

  const result = await $.command.run({ command: 'omni', args: 'test' })

  expect(result.text).toContain('Insufficient credit')
  expect(seen.filter(s => s.url.includes('/calls/logs'))).toHaveLength(1) // only the snapshot before dialing
})

test('a missing API key says how to set it and dials nothing', { options: { ...options, api_key: '' } }, async ($, on) => {
  const seen = fakeApi(on, [])

  const result = await $.command.run({ command: 'omni', args: 'test' })

  expect(result.text).toContain('/plugin configure omni-cat')
  expect(seen).toHaveLength(0)
})

test('a missing phone stops the call before anything is dialed', { options: { ...options, phone: '' } }, async ($, on) => {
  const seen = fakeApi(on, [])

  const result = await $.command.run({ command: 'omni', args: 'test' })

  expect(result.text).toContain('/config')
  expect(seen).toHaveLength(0)
})

test('/omni check reads one log row and dials nothing', { options }, async ($, on) => {
  const seen = fakeApi(on, [])

  const result = await $.command.run({ command: 'omni', args: 'check' })

  expect(result.text).toContain('Connected')
  expect(seen.map(s => s.url)).toEqual(['https://omnidim.io/api/v1/calls/logs?pageno=1&pagesize=1&agentid=12'])
})

for (const mascot of ['cat', 'crab', 'logo']) {
  test(`the ${mascot} band is a valid terminal drawing while a demo runs`, { options: { ...options, mascot } }, async ($, on) => {
    const clock = mock.clock(on)
    await $.command.run({ command: 'omni', args: 'demo' })
    await clock.advance(4_000)

    const band = await $.ui.mount({ plugin: 'omni-cat', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false } })

    expect(await band.find({ key: 'mascot' })).toBeDefined()
  })
}

test('a call nobody answered says so at once instead of waiting', { options }, async ($, on) => {
  const clock = mock.clock(on)
  fakeApi(on, [{ id: 6, call_status: 'no-answer', call_conversation: '' }])
  const said = toasts(on)

  await $.command.run({ command: 'omni', args: 'test' })
  await clock.advance(6_000)

  expect(said.join()).toContain('Nobody picked up')
})

test('starting a test call stops a demo that is still playing', { options }, async ($, on) => {
  const clock = mock.clock(on)
  fakeApi(on, [{ id: 6, call_status: 'completed', call_conversation: ' <br/> LLM: Hi <br/> user: yo <br/>', sentiment_score: 'Positive', call_duration_in_seconds: 30 }])

  await $.command.run({ command: 'omni', args: 'demo' })
  await clock.advance(1_000)
  await $.command.run({ command: 'omni', args: 'test' })
  await clock.advance(25_000) // long enough for the demo to have run to its end and hidden the band

  const band = await $.ui.mount({ plugin: 'omni-cat', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false } })
  expect(await band.find({ text: 'Positive, 30s' })).toBeDefined()
})

test('a demo will not start over a running test call', { options }, async ($, on) => {
  fakeApi(on, [])
  await $.command.run({ command: 'omni', args: 'test' })

  const result = await $.command.run({ command: 'omni', args: 'demo' })

  expect(result.text).toContain('test call is running')
})
