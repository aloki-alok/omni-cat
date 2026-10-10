import { expect, test } from 'claude-code/testing'

import { draw, Grid, MASCOTS, toCells } from './art'

const DEFAULT = 0x01000000
const unpack = (b64: string) => [...new Uint32Array(Uint8Array.fromBase64(b64).buffer)]

test('two stacked pixels become one half-block cell', () => {
  const g = new Grid(4, 2)
  g.set(0, 0, 0xff0000) // top only
  g.set(1, 1, 0x00ff00) // bottom only
  g.set(2, 0, 0x0000ff)
  g.set(2, 1, 0xffff00) // both, different
  g.set(3, 0, 0xabcdef)
  g.set(3, 1, 0xabcdef) // both, same

  expect(unpack(toCells(g))).toEqual([
    0x2580, 0xff0000, DEFAULT,
    0x2584, 0x00ff00, DEFAULT,
    0x2580, 0x0000ff, 0xffff00,
    0x2588, 0xabcdef, DEFAULT,
  ])
})

test('an empty cell keeps the terminal background', () => {
  expect(unpack(toCells(new Grid(1, 2)))).toEqual([0x20, DEFAULT, DEFAULT])
})

const PHASES = ['idle', 'dialing', 'ringing', 'done', 'failed'] as const
const key = (g: Grid) => g.px.join()

for (const mascot of MASCOTS) {
  test(`${mascot}: every state draws something at one fixed size`, () => {
    const sizes = new Set<string>()
    for (const phase of PHASES)
      for (const tick of [0, 1, 2, 3, 6]) {
        const g = draw(mascot, phase, tick, 'Positive')
        sizes.add(`${g.w}x${g.h}`)
        expect(g.px.some(p => p !== null)).toBe(true)
      }
    expect(sizes.size).toBe(1)
  })

  test(`${mascot}: moves while dialing and ringing, holds still when idle`, () => {
    expect(key(draw(mascot, 'dialing', 0))).not.toBe(key(draw(mascot, 'dialing', 1)))
    expect(key(draw(mascot, 'ringing', 0))).not.toBe(key(draw(mascot, 'ringing', 1)))
    expect(key(draw(mascot, 'idle', 1))).toBe(key(draw(mascot, 'idle', 2)))
  })

  test(`${mascot}: a good, a flat and a bad call look different, and a failure differs from all`, () => {
    const [good, flat, bad] = ['Positive', 'Neutral', 'Negative'].map(s => key(draw(mascot, 'done', 0, s)))
    const failed = key(draw(mascot, 'failed', 0))

    expect(new Set([good, flat, bad, failed]).size).toBe(4)
  })
}
