import type { Result } from '../types'

// A turn is "user:" or "LLM:" followed by real text. A call that rang but stayed silent
// leaves only empty turns, so the log existing does not mean anyone spoke.
const SPOKEN_TURN = /(?:user|LLM):\s*[^\s<]/

export function parseLog(row: Record<string, unknown>): Result | null {
  if (!SPOKEN_TURN.test(String(row.call_conversation ?? ''))) return null

  const cost = row.aggregated_estimated_cost
  return {
    seconds: Number(row.call_duration_in_seconds) || 0,
    sentiment: String(row.sentiment_score || 'Unknown'),
    cost: typeof cost === 'number' ? cost : null,
    summary: String(row.sentiment_analysis_details || ''),
  }
}

// call_request_id is an object, not a scalar, so a dispatch cannot be matched to its log.
// Snapshot the newest log id before dialing and take the newest one past it.
export function newerLog<T extends { id: number }>(rows: T[], before: number): T | undefined {
  return rows.filter(r => r.id > before).sort((a, b) => b.id - a.id)[0]
}

// The call_status values the platform reports when a call ends without a conversation.
// `completed` is parsed for speech instead; any other status counts as still live.
const UNANSWERED: Record<string, string> = {
  'no-answer': 'Nobody picked up',
  busy: 'The line was busy',
  failed: 'The call failed',
  voicemail_detected: 'It reached voicemail',
}

export function unansweredReason(status: unknown): string | null {
  return UNANSWERED[String(status)] ?? null
}
