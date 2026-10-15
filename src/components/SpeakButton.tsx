import { useState } from 'react'
import { useT } from '../lib/i18n'
import { getSettings } from '../lib/settings'
import { speak, ttsSupported, useJapaneseVoices } from '../lib/tts'
import { IconSpeaker } from './icons'
import { useToast } from './ui'

export function useSpeak() {
  const t = useT()
  const toast = useToast()
  const { voices, loaded } = useJapaneseVoices()
  return (text: string, rate?: number, onEnd?: () => void) => {
    const s = getSettings()
    const p = speak(text, { rate: rate ?? s.ttsRate, voiceURI: s.voiceURI, onEnd })
    p.then((r) => {
      if (r === 'unsupported' || ((r === 'silent' || r === 'error') && loaded && voices.length === 0)) {
        toast({
          tone: 'bad',
          ms: 9000,
          text: (
            <span>
              <b>{t.settings.noVoiceTitle}.</b> {/iPhone|iPad/.test(navigator.userAgent) ? t.settings.noVoiceIos : t.settings.noVoiceMac}
            </span>
          ),
        })
      }
    })
    return p
  }
}

export function SpeakButton({
  text,
  size = 'md',
  className = '',
  label,
}: {
  text: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
  label?: string
}) {
  const t = useT()
  const say = useSpeak()
  const [playing, setPlaying] = useState(false)
  if (!ttsSupported) return null
  const dims = { sm: 'h-9 w-9', md: 'h-11 w-11', lg: 'h-14 w-14' }[size]
  const icon = { sm: 18, md: 22, lg: 26 }[size]
  return (
    <button
      type="button"
      aria-label={label ?? t.common.play}
      title={label ?? t.common.play}
      onClick={(e) => {
        e.stopPropagation()
        setPlaying(true)
        void say(text, undefined, () => setPlaying(false))
        setTimeout(() => setPlaying(false), 6000)
      }}
      className={`inline-grid shrink-0 place-items-center rounded-full border border-line bg-raised text-text transition active:scale-95 ${
        playing ? 'text-accent ring-2 ring-accent/40' : ''
      } ${dims} ${className}`}
    >
      <IconSpeaker size={icon} />
    </button>
  )
}

export function wordSpeech(w: { kana: string; tts?: string }): string {
  return (w.tts ?? w.kana).replace(/[～〜]/g, '')
}
