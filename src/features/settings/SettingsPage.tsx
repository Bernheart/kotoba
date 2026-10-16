import { useEffect, useState, type ReactNode } from 'react'
import { Page } from '../../components/Page'
import { Button, Card, Segmented, Toggle } from '../../components/ui'
import { requestPersistence } from '../../lib/db'
import { useT } from '../../lib/i18n'
import { setSetting, useSettings } from '../../lib/settings'
import { useSpeak } from '../../components/SpeakButton'
import { ttsSupported, useJapaneseVoices } from '../../lib/tts'
import { BackupSection } from './BackupSection'
import { SyncSection } from './SyncSection'

export function Row({ label, hint, children }: { label: ReactNode; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/50 px-4 py-3.5 last:border-0">
      <div className="min-w-0">
        <div className="text-[15px]">{label}</div>
        {hint && <div className="mt-0.5 text-[13px] text-faint">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 px-1 text-[13px] font-semibold text-muted">{title}</h2>
      <Card className="overflow-hidden">{children}</Card>
    </section>
  )
}

export function Stepper({ value, min, max, step = 1, onChange, format }: { value: number; min: number; max: number; step?: number; onChange: (v: number) => void; format?: (v: number) => string }) {
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-line bg-bg-2 p-1">
      <button className="h-9 w-9 rounded-xl text-[18px] active:bg-raised disabled:opacity-30" disabled={value <= min} onClick={() => onChange(Math.max(min, +(value - step).toFixed(2)))} aria-label="−">
        −
      </button>
      <span className="min-w-[3.2ch] text-center text-[15px] tabular-nums">{format ? format(value) : value}</span>
      <button className="h-9 w-9 rounded-xl text-[18px] active:bg-raised disabled:opacity-30" disabled={value >= max} onClick={() => onChange(Math.min(max, +(value + step).toFixed(2)))} aria-label="+">
        +
      </button>
    </div>
  )
}

export function SettingsPage() {
  const t = useT()
  const s = useSettings()
  const { voices, loaded } = useJapaneseVoices()
  const say = useSpeak()
  const [persisted, setPersisted] = useState<boolean | null>(null)
  useEffect(() => {
    void requestPersistence().then(setPersisted)
  }, [])
  const standalone = typeof window !== 'undefined' && (matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true)

  return (
    <Page title={t.settings.title}>
      <Group title={t.settings.language}>
        <Row label={t.settings.language} hint={t.settings.languageHint}>
          <Segmented
            value={s.lang}
            onChange={(v) => setSetting('lang', v)}
            options={[
              { value: 'en', label: 'English' },
              { value: 'pl', label: 'Polski' },
            ]}
          />
        </Row>
      </Group>

      <Group title={t.settings.display}>
        <Row label={t.settings.theme}>
          <Segmented
            value={s.theme}
            onChange={(v) => setSetting('theme', v)}
            options={[
              { value: 'dark', label: t.settings.themeDark },
              { value: 'light', label: t.settings.themeLight },
              { value: 'system', label: t.settings.themeSystem },
            ]}
          />
        </Row>
        <Row
          label={
            <span>
              {t.common.furigana}{' '}
              <ruby lang="ja" className="text-[15px]">
                漢字<rt>かんじ</rt>
              </ruby>
            </span>
          }
          hint={t.settings.furiganaHint}
        >
          <Toggle checked={s.furigana} onChange={(v) => setSetting('furigana', v)} label={t.common.furigana} />
        </Row>
      </Group>

      <Group title={t.settings.learning}>
        <Row label={t.settings.currentLesson} hint={t.settings.currentLessonHint}>
          <Stepper value={s.currentLesson} min={1} max={23} onChange={(v) => setSetting('currentLesson', v)} />
        </Row>
        <Row label={t.settings.newPerDay}>
          <Stepper value={s.newPerDay} min={0} max={50} step={5} onChange={(v) => setSetting('newPerDay', v)} />
        </Row>
        <Row label={t.settings.dailyGoal}>
          <Stepper value={s.dailyGoal} min={10} max={300} step={10} onChange={(v) => setSetting('dailyGoal', v)} />
        </Row>
        <Row label={t.settings.reviewStyle}>
          <Segmented
            value={s.reviewStyle}
            onChange={(v) => setSetting('reviewStyle', v)}
            options={[
              { value: 'flip', label: t.settings.reviewFlip },
              { value: 'type', label: t.settings.reviewType },
            ]}
          />
        </Row>
        <Row label={t.settings.recallCards}>
          <Toggle checked={s.recallCards} onChange={(v) => setSetting('recallCards', v)} label={t.settings.recallCards} />
        </Row>
        <Row label={t.settings.retention} hint={t.settings.retentionHint}>
          <Stepper value={s.retention} min={0.8} max={0.97} step={0.01} onChange={(v) => setSetting('retention', v)} format={(v) => `${Math.round(v * 100)}%`} />
        </Row>
        <Row label={t.settings.leech}>
          <Stepper value={s.leechThreshold} min={3} max={16} onChange={(v) => setSetting('leechThreshold', v)} />
        </Row>
      </Group>

      <Group title={t.settings.audio}>
        {ttsSupported && loaded && voices.length === 0 && (
          <div className="border-b border-line/50 bg-warn/10 px-4 py-3 text-[14px] text-warn">
            <b>{t.settings.noVoiceTitle}.</b> {t.settings.noVoiceIos} {t.settings.noVoiceMac} {t.settings.noVoiceAfter}
          </div>
        )}
        <Row label={t.settings.voice}>
          <select
            value={s.voiceURI}
            onChange={(e) => setSetting('voiceURI', e.target.value)}
            className="h-10 max-w-[180px] rounded-xl border border-line bg-bg-2 px-2 text-[15px]"
          >
            <option value="">{t.settings.voiceAuto}</option>
            {voices.map((v) => (
              <option key={v.voiceURI} value={v.voiceURI}>
                {v.name}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t.settings.rate}>
          <Stepper value={s.ttsRate} min={0.5} max={1.2} step={0.05} onChange={(v) => setSetting('ttsRate', v)} format={(v) => `${v.toFixed(2)}×`} />
        </Row>
        <Row label={t.settings.autoplay}>
          <Toggle checked={s.autoplayAudio} onChange={(v) => setSetting('autoplayAudio', v)} label={t.settings.autoplay} />
        </Row>
        <Row label={t.settings.test}>
          <Button size="sm" onClick={() => say('こんにちは。日本語の勉強、がんばりましょう！')}>
            ▶ こんにちは
          </Button>
        </Row>
      </Group>

      <SyncSection />
      <BackupSection persisted={persisted} />

      <Group title={t.settings.install}>
        <div className="px-4 py-3.5 text-[14px] text-muted">{standalone ? `✓ ${t.settings.standalone}` : t.settings.installSteps}</div>
      </Group>

      <Group title={t.settings.about}>
        <div className="space-y-2 px-4 py-3.5 text-[14px] text-muted">
          <p>{t.settings.aboutBody}</p>
          <a className="inline-block text-accent underline-offset-4 hover:underline" href="https://github.com/Bernheart/kotoba" target="_blank" rel="noreferrer">
            {t.settings.source} ↗
          </a>
        </div>
      </Group>

      <p className="mt-8 text-center text-[12px] text-faint">{t.settings.version(__APP_VERSION__)}</p>
    </Page>
  )
}
