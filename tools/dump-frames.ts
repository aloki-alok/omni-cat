// Dumps the plugin's real frames as JSON for tools/compose.py. Run with bun:
//   bun tools/dump-frames.ts > /tmp/frames.json
import { draw, type Mascot } from '../hooks/art'
import type { Phase } from '../types'

type Spec = { phase: Phase; tick: number; sentiment?: string }

const grid = (mascot: Mascot, s: Spec) => {
  const g = draw(mascot, s.phase, s.tick, s.sentiment ?? '')
  return { w: g.w, h: g.h, px: g.px.map(p => (p === null ? null : p.toString(16).padStart(6, '0'))) }
}

const range = (n: number) => [...Array(n).keys()]

// The demo: dial, ring, then a good call. The notes match the plugin's own band text.
const hero = [
  ...range(5).map(tick => ({ spec: { phase: 'dialing', tick } as Spec, note: 'Dialing', detail: '' })),
  ...range(7).map(tick => ({ spec: { phase: 'ringing', tick } as Spec, note: 'Ringing +15…71', detail: '' })),
  ...range(8).map(tick => ({
    spec: { phase: 'done', tick, sentiment: 'Positive' } as Spec,
    note: 'Call finished',
    detail: 'Positive, 42s, $0.12',
  })),
].map(f => ({ ...f, frame: grid('cat', f.spec) }))

const states: { label: string; spec: Spec }[] = [
  { label: 'idle', spec: { phase: 'idle', tick: 0 } },
  { label: 'dialing', spec: { phase: 'dialing', tick: 1 } },
  { label: 'ringing', spec: { phase: 'ringing', tick: 1 } },
  { label: 'good call', spec: { phase: 'done', tick: 1, sentiment: 'Positive' } },
  { label: 'flat call', spec: { phase: 'done', tick: 0, sentiment: 'Neutral' } },
  { label: 'bad call', spec: { phase: 'done', tick: 1, sentiment: 'Negative' } },
  { label: 'failed', spec: { phase: 'failed', tick: 0 } },
]
const sheet = {
  labels: states.map(s => s.label),
  rows: (['cat', 'crab', 'logo'] as Mascot[]).map(name => ({
    name,
    frames: states.map(s => grid(name, s.spec)),
  })),
}

const preview = grid('cat', { phase: 'done', tick: 1, sentiment: 'Positive' })

console.log(JSON.stringify({ hero, sheet, preview }))
