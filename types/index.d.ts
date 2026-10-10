export type Phase = 'idle' | 'dialing' | 'ringing' | 'done' | 'failed'

export type Result = {
  seconds: number
  sentiment: string
  cost: number | null
  summary: string
}

export type Call = { phase: Phase; note: string; result: Result | null }

declare module 'claude-code' {
  interface PluginState {
    'omni-cat': { call: Call; tick: number }
  }
}
