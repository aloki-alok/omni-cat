import { expect, test } from 'claude-code/testing'

import { newerLog, parseLog, unansweredReason } from './lib'

const row = (conversation: string) => ({
  id: 7,
  call_conversation: conversation,
  call_duration_in_seconds: 42,
  sentiment_score: 'Positive',
  aggregated_estimated_cost: 0.123,
  sentiment_analysis_details: 'Caller booked a meeting.',
})

test('a log with no spoken turns is not a finished call', () => {
  expect(parseLog(row(' <br/> user:  <br/> LLM:  <br/> '))).toBeNull()
  expect(parseLog(row(''))).toBeNull()
})

test('a log with a spoken turn gives the result', () => {
  const turns = ' <br/> LLM: Hello, this is Alok. <br/> <br/> user: hi <br/>'

  expect(parseLog(row(turns))).toEqual({
    seconds: 42,
    sentiment: 'Positive',
    cost: 0.123,
    summary: 'Caller booked a meeting.',
  })
})

test('only a log newer than the one seen before dialing counts', () => {
  const rows = [{ id: 8 }, { id: 9 }, { id: 7 }]

  expect(newerLog(rows, 8)).toEqual({ id: 9 })
  expect(newerLog(rows, 9)).toBeUndefined()
  expect(newerLog([], 0)).toBeUndefined()
})

test('a call that never reached a person says why, and a live or finished one does not', () => {
  expect(unansweredReason('no-answer')).toBe('Nobody picked up')
  expect(unansweredReason('busy')).toBe('The line was busy')
  expect(unansweredReason('failed')).toBe('The call failed')
  expect(unansweredReason('voicemail_detected')).toBe('It reached voicemail')
  expect(unansweredReason('completed')).toBeNull()
  expect(unansweredReason('in-progress')).toBeNull()
  expect(unansweredReason(undefined)).toBeNull()
})
