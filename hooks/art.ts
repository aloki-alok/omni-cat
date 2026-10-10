// Pixel art for the band. A Grid is a canvas of 0xRRGGBB pixels; toCells packs it two pixels per
// terminal cell (the upper half block, foreground on top, background below) for the Raster element.

import type { Phase } from '../types'

export type Px = number | null

export class Grid {
  px: Px[]
  constructor(
    public w: number,
    public h: number,
  ) {
    this.px = new Array(w * h).fill(null)
  }

  set(x: number, y: number, c: Px) {
    x = Math.round(x)
    y = Math.round(y)
    if (x >= 0 && x < this.w && y >= 0 && y < this.h) this.px[y * this.w + x] = c
  }

  get(x: number, y: number): Px {
    return x >= 0 && x < this.w && y >= 0 && y < this.h ? this.px[y * this.w + x] : null
  }

  // `c` may be a function of the pixel, for shading.
  ellipse(cx: number, cy: number, rx: number, ry: number, c: number | ((x: number, y: number) => Px)) {
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++)
        if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1)
          this.set(x, y, typeof c === 'function' ? c(x, y) : c)
  }

  rect(x: number, y: number, w: number, h: number, c: Px) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c)
  }
}

export const MASCOTS = ['cat', 'crab', 'logo'] as const
export type Mascot = (typeof MASCOTS)[number]

const W = 24
const H = 12
const CX = 12

const BLACK = 0x1b1b24
const WHITE = 0xffffff
const PINK = 0xff8fa3
const GOLD = 0xffd23f
const CYAN = 0x00ffff

type Mood = 'calm' | 'focus' | 'happy' | 'flat' | 'sad' | 'dead'

// What the mascot is doing this frame, shared by all of them so they react the same way.
type Pose = { dx: number; dy: number; mood: Mood; blink: boolean; walk: boolean; clawsUp: 0 | 1 | 2; tick: number; phase: Phase }

function pose(phase: Phase, tick: number, sentiment: string): Pose {
  const base: Pose = { dx: 0, dy: 0, mood: 'calm', blink: false, walk: false, clawsUp: 0, tick, phase }
  if (phase === 'idle') return { ...base, blink: tick % 6 === 5 }
  if (phase === 'dialing') return { ...base, dx: [-1, 0, 1, 0][tick % 4], mood: 'focus', walk: true, clawsUp: 1 }
  if (phase === 'ringing') return { ...base, dx: tick % 2 ? 1 : -1, mood: 'focus', walk: true }
  if (phase === 'failed') return { ...base, mood: 'dead' }
  const mood = /pos/i.test(sentiment) ? 'happy' : /neg/i.test(sentiment) ? 'sad' : 'flat'
  return { ...base, mood, dy: mood === 'happy' && tick % 2 ? -1 : 0, clawsUp: mood === 'happy' ? 2 : 0 }
}

// Two arcs that grow out to the right while the phone rings.
function waves(g: Grid, x: number, y: number, tick: number) {
  for (const r of [2, 4]) {
    if ((tick + (r === 2 ? 0 : 1)) % 3 === 2) continue
    for (let a = -0.9; a <= 0.9; a += 0.3) g.set(x + Math.cos(a) * r, y + Math.sin(a) * r, CYAN)
  }
}

function sparkles(g: Grid, tick: number) {
  const spots = [[3, 1], [21, 2], [5, 9], [20, 8]]
  spots.forEach(([x, y], i) => {
    if ((tick + i) % 2 === 0) g.set(x, y, i % 2 ? GOLD : WHITE)
  })
}

const SHELL = 0xe9733a
const SHELL_L = 0xff9a5c
const SHELL_D = 0xb5522b

function crab(p: Pose): Grid {
  const g = new Grid(W, H)
  const cx = CX + p.dx
  const y0 = p.dy + 1 // one row of headroom so the hop and the raised claws do not clip

  for (const s of [-1, 1])
    for (const k of [3, 5]) {
      const bend = p.walk && (p.tick + k) % 2 ? 1 : 0
      g.set(cx + s * k, 9 + y0, SHELL_D)
      g.set(cx + s * (k + bend), 10 + y0, SHELL_D)
    }

  g.ellipse(cx, 7 + y0, 5.5, 3.2, (_x, y) => (y - y0 >= 9 ? SHELL_D : y - y0 <= 5 ? SHELL_L : SHELL))

  for (const s of [-1, 1]) {
    const isUp = p.clawsUp === 2 || (p.clawsUp === 1 && (s === -1) === (p.tick % 2 === 0))
    const cy = (isUp ? 2.5 : 5.5) + y0
    g.set(cx + s * 5, isUp ? 5 + y0 : 6 + y0, SHELL)
    g.ellipse(cx + s * 6.4, cy, 2, 1.9, SHELL)
    g.set(cx + s * 6.4 + (s === -1 ? 0 : -1), cy - 1.5, null)
  }

  for (const x of [cx - 3, cx + 1]) {
    g.set(x + 1, 3 + y0, SHELL_D)
    const left = x === cx - 3
    const inner = left ? x + 1 : x
    // White eyes first so the black marks (lids, ^, x) read on a dark terminal.
    g.rect(x, 1 + y0, 2, 2, WHITE)
    if (p.mood === 'dead') {
      g.set(x, 1 + y0, BLACK), g.set(x + 1, 2 + y0, BLACK)
    } else if (p.blink || p.mood === 'flat') {
      g.rect(x, 2 + y0, 2, 1, BLACK)
    } else if (p.mood === 'happy') {
      g.set(x + (left ? 0 : 1), 2 + y0, BLACK), g.set(x + (left ? 1 : 0), 1 + y0, BLACK)
    } else {
      g.set(inner, (p.mood === 'focus' ? 1 : 2) + y0, BLACK)
    }
  }

  const mouth: Record<Mood, [number, number][]> = {
    calm: [[-1, 8], [0, 8]],
    focus: [[-1, 8], [0, 8]],
    flat: [[-1, 8], [0, 8]],
    happy: [[-2, 7], [-1, 8], [0, 8], [1, 7]],
    sad: [[-1, 8], [0, 8], [-2, 9], [1, 9]],
    dead: [[-2, 8], [-1, 9], [0, 8], [1, 9]],
  }
  for (const [x, y] of mouth[p.mood]) g.set(cx + x, y + y0, BLACK)
  if (p.mood === 'happy') (g.set(cx - 4, 7 + y0, PINK), g.set(cx + 3, 7 + y0, PINK))
  if (p.mood === 'sad') g.set(cx - 3, 3 + (p.tick % 4) + y0, CYAN)

  if (p.phase === 'ringing') waves(g, CX + 7, 3, p.tick)
  if (p.mood === 'happy') sparkles(g, p.tick)
  return g
}

const FUR = 0xf2d3a4
const FUR_D = 0xc98b4f
const MUZZLE = 0xfff6e8
const EYE = 0x00e5ff
const WHISKER = 0xdcdcdc

// A sitting cat seen from the front: pointed ears, cyan slit eyes, whiskers, paws and a tail
// that swishes while the phone rings. Offsets named `rel` are columns from the middle, mirrored.
function cat(p: Pose): Grid {
  const g = new Grid(W, H)
  const cx = CX + p.dx
  const y0 = p.dy + 1 // one row of headroom so the hop does not clip the ears
  const both = (rel: number, y: number, c: Px) => {
    g.set(cx + rel, y + y0, c)
    g.set(cx - rel - 1, y + y0, c)
  }
  const busy = p.walk || p.mood === 'happy'

  // Tail along the floor, rising at the right. It swishes while busy.
  const rise = 3 + (busy ? [0, 1, 2, 1][p.tick % 4] : 0)
  for (let x = cx + 5; x <= cx + 9; x++) g.set(x, 10 + y0, FUR)
  for (let i = 0; i < rise; i++) g.set(cx + 10, 9 - i + y0, i === rise - 1 ? FUR_D : FUR)

  // Body, white chest and paws.
  g.ellipse(cx, 10.5 + y0, 5, 3, FUR)
  g.ellipse(cx, 10.5 + y0, 2.2, 2.2, MUZZLE)
  g.rect(cx - 3, 10 + y0, 2, 1, MUZZLE)
  g.rect(cx + 1, 10 + y0, 2, 1, MUZZLE)

  // Ears: the right one flicks while dialing, both droop when the call went badly.
  const droop = p.mood === 'sad' ? 1 : 0
  for (const side of [-1, 1] as const) {
    const flick = side === 1 && p.phase === 'dialing' && p.tick % 2 ? 1 : 0
    const ey = y0 + droop + flick
    const put = (rel: number, y: number, c: number) => g.set(side === -1 ? cx + rel : cx - rel - 1, y + ey, c)
    put(-5, 0, FUR_D)
    for (let r = -6; r <= -4; r++) put(r, 1, r === -5 ? PINK : FUR)
    for (let r = -6; r <= -3; r++) put(r, 2, r === -5 || r === -4 ? PINK : FUR)
  }

  // Head, forehead stripes, cheek stripes and a pale muzzle.
  g.ellipse(cx, 5 + y0, 6.5, 3.5, FUR)
  both(0, 2, FUR_D), both(0, 3, FUR_D), both(-3, 2, FUR_D), both(-6, 5, FUR_D), both(-6, 7, FUR_D)
  g.ellipse(cx, 6.8 + y0, 2.6, 1.7, MUZZLE)

  // Eyes: cyan with a black slit. They close for a blink, a flat call, or smile when the call went well.
  for (const x0 of [cx - 5, cx + 2]) {
    if (p.mood === 'dead') {
      for (const [dx, y] of [[0, 4], [2, 4], [1, 5], [0, 6], [2, 6]]) g.set(x0 + dx, y + y0, BLACK)
    } else if (p.mood === 'happy') {
      g.set(x0, 5 + y0, EYE), g.set(x0 + 1, 4 + y0, EYE), g.set(x0 + 2, 5 + y0, EYE)
    } else if (p.blink || p.mood === 'flat') {
      g.rect(x0, 5 + y0, 3, 1, BLACK)
    } else {
      g.rect(x0, 4 + y0, 3, 2, EYE)
      g.set(x0 + 1, 4 + y0, BLACK), g.set(x0 + 1, 5 + y0, BLACK)
      g.set(x0, 4 + y0, 0xc8ffff)
    }
  }
  if (p.mood === 'sad') g.set(cx - 5, 6 + (p.tick % 3) + y0, CYAN)

  // Nose and mouth.
  g.set(cx - 1, 6 + y0, PINK), g.set(cx, 6 + y0, PINK)
  const mouth: Record<Mood, [number, number][]> = {
    calm: [[-1, 7], [0, 7], [-2, 8], [1, 8]],
    focus: [[-1, 7], [0, 7], [-2, 8], [1, 8]],
    flat: [[-1, 7], [0, 7]],
    happy: [[-2, 7], [-1, 8], [0, 8], [1, 7]],
    sad: [[-1, 8], [0, 8], [-2, 9], [1, 9]],
    dead: [[-2, 8], [-1, 7], [0, 8], [1, 7]],
  }
  for (const [x, y] of mouth[p.mood]) g.set(cx + x, y + y0, BLACK)
  if (p.mood === 'happy') (g.set(cx - 5, 7 + y0, PINK), g.set(cx + 4, 7 + y0, PINK))

  // Whiskers, two a side with a row between so they read as lines and not a block.
  for (const [rel, y] of [[-7, 5], [-8, 5], [-9, 4], [-7, 7], [-8, 7], [-9, 8]]) both(rel, y, WHISKER)

  if (p.phase === 'ringing') waves(g, CX + 7, 2, p.tick)
  if (p.mood === 'happy') sparkles(g, p.tick)
  return g
}

const TINT: Record<Mood, number> = {
  calm: CYAN,
  focus: CYAN,
  happy: CYAN,
  flat: 0x5fb8c0,
  sad: 0x3a6b8f,
  dead: 0x808080,
}

// The OmniDimension mark: a cyan O with a white arc offset behind it.
function logo(p: Pose): Grid {
  const g = new Grid(W, H)
  const cx = CX + p.dx - 1
  const cy = 6 + p.dy
  const slide = p.phase === 'dialing' ? [0, 1, 2, 1][p.tick % 4] : p.phase === 'ringing' ? p.tick % 2 : 0
  const tint = p.phase === 'ringing' && p.tick % 2 ? 0x9bffff : TINT[p.mood]

  const inCyanOuter = (x: number, y: number, grow: number) => ((x + 0.5 - cx) / (5 + grow)) ** 2 + ((y + 0.5 - cy) / (5.4 + grow)) ** 2 <= 1
  g.ellipse(cx + 3 + slide, cy, 5, 5.4, (x, y) => {
    const inner = ((x + 0.5 - (cx + 3 + slide)) / 2.8) ** 2 + ((y + 0.5 - cy) / 3.4) ** 2 <= 1
    return inner || inCyanOuter(x, y, 1) ? null : p.mood === 'dead' ? 0x606060 : WHITE
  })
  g.ellipse(cx, cy, 5, 5.4, (x, y) => (((x + 0.5 - cx) / 2.8) ** 2 + ((y + 0.5 - cy) / 3.4) ** 2 <= 1 ? null : tint))

  if (p.mood === 'dead') for (const [x, y] of [[-1, -1], [0, 0], [1, 1], [1, -1], [-1, 1]]) g.set(cx + 1 + x, cy + y, 0xff4444)
  if (p.mood === 'happy') (g.set(cx - 1, cy, WHITE), g.set(cx + 1, cy, WHITE), g.set(cx, cy + 1, WHITE))
  if (p.mood === 'sad') g.set(cx - 5, cy + 1 + (p.tick % 4), CYAN)
  if (p.phase === 'ringing') waves(g, CX + 8, 3, p.tick)
  if (p.mood === 'happy') sparkles(g, p.tick)
  return g
}

export function draw(mascot: Mascot, phase: Phase, tick: number, sentiment = ''): Grid {
  const p = pose(phase, tick, sentiment)
  return mascot === 'cat' ? cat(p) : mascot === 'logo' ? logo(p) : crab(p)
}

const DEFAULT = 0x01000000

export function toCells(g: Grid): string {
  const rows = Math.ceil(g.h / 2)
  const words = new Uint32Array(g.w * rows * 3)
  let i = 0
  for (let row = 0; row < rows; row++)
    for (let x = 0; x < g.w; x++) {
      const top = g.get(x, row * 2)
      const bottom = g.get(x, row * 2 + 1)
      const [glyph, fg, bg] =
        top === null && bottom === null
          ? [0x20, DEFAULT, DEFAULT]
          : bottom === null
            ? [0x2580, top as number, DEFAULT]
            : top === null
              ? [0x2584, bottom, DEFAULT]
              : top === bottom
                ? [0x2588, top, DEFAULT]
                : [0x2580, top, bottom]
      words.set([glyph, fg, bg], i)
      i += 3
    }
  return new Uint8Array(words.buffer).toBase64()
}
