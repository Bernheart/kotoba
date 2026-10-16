import { useLiveQuery } from 'dexie-react-hooks'
import { useState } from 'react'
import { Hanko } from '../../components/Nav'
import { Button, Segmented, Sheet } from '../../components/ui'
import { db, setMeta } from '../../lib/db'
import { useT } from '../../lib/i18n'
import { setSetting, useSettings } from '../../lib/settings'
import { Stepper } from '../settings/SettingsPage'

function skipWelcome() {
  try {
    return localStorage.getItem('kotoba.nowelcome') === '1' // set by the e2e tests
  } catch {
    return false
  }
}

/** First-run sheet for new users: language, current Genki lesson, and how the app treats their data. */
export function WelcomeSheet() {
  const t = useT()
  const s = useSettings()
  const [closed, setClosed] = useState(false)
  // Show only on a fresh device: never welcomed and nothing studied yet (existing users skip it).
  const show = useLiveQuery(async () => {
    if (skipWelcome()) return false
    const welcomed = await db.meta.get('welcomed')
    if (welcomed) return false
    return (await db.reviewLogs.count()) === 0
  }, [])
  const done = () => {
    setClosed(true)
    void setMeta('welcomed', Date.now())
  }
  return (
    <Sheet open={!!show && !closed} onClose={done}>
      <div className="space-y-5 pb-2">
        <div className="flex items-center gap-3">
          <Hanko size={44} />
          <div>
            <h2 className="text-[22px] font-bold">{t.welcome.title}</h2>
            <p className="text-[14px] text-muted">{t.welcome.tagline}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="text-[15px]">{t.welcome.language}</span>
          <Segmented
            value={s.lang}
            onChange={(v) => setSetting('lang', v)}
            options={[
              { value: 'en', label: 'English' },
              { value: 'pl', label: 'Polski' },
            ]}
          />
        </div>
        <div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-[15px]">{t.welcome.lesson}</span>
            <Stepper value={s.currentLesson} min={1} max={23} onChange={(v) => setSetting('currentLesson', v)} />
          </div>
          <p className="mt-1 text-[12px] text-faint">{t.welcome.lessonHint}</p>
        </div>
        <ul className="space-y-2.5 rounded-3xl bg-bg-2 p-4 text-[14px] leading-snug text-muted">
          <li>📲 {t.welcome.p1}</li>
          <li>💾 {t.welcome.p2}</li>
          <li>⚠️ {t.welcome.p3}</li>
        </ul>
        <Button variant="primary" size="lg" className="w-full" onClick={done}>
          {t.welcome.start}
        </Button>
      </div>
    </Sheet>
  )
}
