// Japanese text-to-speech via the Web Speech API.
// iOS rules: speech must start inside a user gesture (call speak() synchronously from the tap handler),
// and the voice list is unreliable (ja-JP voices may be missing from getVoices() yet still work via utterance.lang).

import { useSyncExternalStore } from 'react'

export const ttsSupported = typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window

let allVoices: SpeechSynthesisVoice[] = []
let jaVoices: SpeechSynthesisVoice[] = []
let loaded = false
const listeners = new Set<() => void>()

const PREFERRED = ['Kyoko', 'O-ren', 'Otoya', 'Hattori', 'Google 日本語', 'Nanami', 'Keita', 'Ayumi', 'Haruka', 'Ichiro', 'Sayaka']

function loadVoices() {
  if (!ttsSupported) return
  allVoices = window.speechSynthesis.getVoices()
  jaVoices = allVoices
    .filter((v) => v.lang.replace('_', '-').toLowerCase().startsWith('ja'))
    .sort((a, b) => score(b) - score(a))
  if (allVoices.length) loaded = true
  snapshot = { voices: jaVoices, loaded, anyVoices: allVoices.length > 0 }
  listeners.forEach((f) => f())
}

function score(v: SpeechSynthesisVoice): number {
  const i = PREFERRED.findIndex((p) => v.name.includes(p))
  let s = i >= 0 ? 100 - i : 0
  if (/enhanced|premium|拡張|高品質/i.test(v.name)) s += 50
  if (v.localService) s += 5
  return s
}

let snapshot = { voices: jaVoices, loaded, anyVoices: false }

if (ttsSupported) {
  loadVoices()
  window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices)
  // Safari sometimes never fires voiceschanged — poll briefly.
  let tries = 0
  const poll = setInterval(() => {
    loadVoices()
    if (loaded || ++tries > 20) clearInterval(poll)
  }, 250)
  // iOS can leave the synth stuck after the app is backgrounded.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) window.speechSynthesis.cancel()
  })
}

export function useJapaneseVoices() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => snapshot,
    () => snapshot,
  )
}

export function pickVoice(uri?: string): SpeechSynthesisVoice | undefined {
  if (uri) {
    const v = jaVoices.find((x) => x.voiceURI === uri)
    if (v) return v
  }
  return jaVoices[0]
}

export type SpeakResult = 'ok' | 'unsupported' | 'error' | 'silent'

let current: SpeechSynthesisUtterance | null = null

/** Speak Japanese text. Must be called directly from a user gesture on iOS. */
export function speak(
  text: string,
  opts: { rate?: number; voiceURI?: string; onEnd?: () => void } = {},
): Promise<SpeakResult> {
  if (!ttsSupported || !text) return Promise.resolve('unsupported')
  const synth = window.speechSynthesis
  synth.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'ja-JP'
  const voice = pickVoice(opts.voiceURI)
  if (voice) u.voice = voice
  u.rate = opts.rate ?? 0.9
  current = u
  return new Promise((resolve) => {
    let started = false
    const timer = setTimeout(() => {
      // No start event in time: either no voice, or the engine is busy.
      if (!started && current === u) resolve('silent')
    }, 2500)
    u.onstart = () => {
      started = true
      clearTimeout(timer)
      resolve('ok')
    }
    u.onend = () => {
      clearTimeout(timer)
      if (!started) resolve('ok')
      opts.onEnd?.()
    }
    u.onerror = (e) => {
      clearTimeout(timer)
      // "interrupted"/"canceled" happen when we start a new utterance — not a failure.
      if (e.error === 'interrupted' || e.error === 'canceled') resolve('ok')
      else resolve('error')
      opts.onEnd?.()
    }
    synth.speak(u)
    if (synth.paused) synth.resume()
  })
}

export function stopSpeaking() {
  if (ttsSupported) window.speechSynthesis.cancel()
}

/** iOS only lets speech start from a user gesture; a silent utterance inside a tap unlocks later auto-play. */
export function unlockSpeech() {
  if (!ttsSupported) return
  const u = new SpeechSynthesisUtterance(' ')
  u.volume = 0
  u.lang = 'ja-JP'
  window.speechSynthesis.speak(u)
}
