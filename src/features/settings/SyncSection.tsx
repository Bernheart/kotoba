import { useEffect, useState } from 'react'
import { IconSync } from '../../components/icons'
import { Button, useToast } from '../../components/ui'
import { relativeDay, useLang, useT } from '../../lib/i18n'
import { setSetting, useSettings } from '../../lib/settings'
import { refreshAuth, sendCode, signOut, syncConfig, syncNow, useSyncStatus, verifyCode } from '../../lib/sync/engine'
import { Group } from './SettingsPage'

const inputCls = 'h-12 w-full rounded-2xl border border-line bg-bg-2 px-3.5 text-[16px] placeholder:text-faint focus:border-accent/60 focus:outline-none'

export function SyncSection() {
  const t = useT()
  const lang = useLang()
  const s = useSettings()
  const toast = useToast()
  const st = useSyncStatus()
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState(s.supabaseUrl)
  const [key, setKey] = useState(s.supabaseKey)
  const configured = !!syncConfig()

  useEffect(() => {
    void refreshAuth()
  }, [s.supabaseUrl, s.supabaseKey])

  const run = async (f: () => Promise<void>) => {
    setBusy(true)
    try {
      await f()
    } catch (e) {
      toast({ text: t.sync.failed(e instanceof Error ? e.message : String(e)), tone: 'bad', ms: 6000 })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Group title={t.settings.sync}>
      <div className="space-y-3 px-4 py-4">
        {!configured || st.state === 'off' ? (
          <>
            <p className="text-[14px] text-muted">{t.sync.notConfigured}</p>
            <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={`${t.sync.url} — https://xxxx.supabase.co`} className={inputCls} autoCapitalize="off" autoCorrect="off" />
            <input value={key} onChange={(e) => setKey(e.target.value)} placeholder={t.sync.key} className={inputCls} autoCapitalize="off" autoCorrect="off" />
            <Button
              disabled={!url || !key}
              onClick={() =>
                run(async () => {
                  await setSetting('supabaseUrl', url.trim())
                  await setSetting('supabaseKey', key.trim())
                  await refreshAuth()
                })
              }
            >
              {t.common.save}
            </Button>
          </>
        ) : st.email ? (
          <>
            <p className="text-[15px]">{t.sync.signedIn(st.email)}</p>
            <p className={`text-[13px] ${st.state === 'error' ? 'text-accent' : 'text-faint'}`}>
              {st.state === 'syncing'
                ? t.sync.syncing
                : st.state === 'error'
                  ? st.maybePaused
                    ? t.sync.paused
                    : t.sync.failed(st.error ?? '')
                  : st.lastSync
                    ? t.sync.lastSync(relativeDay(st.lastSync, lang))
                    : t.sync.ok}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="primary" disabled={st.state === 'syncing'} onClick={() => void syncNow()}>
                <IconSync size={16} className={st.state === 'syncing' ? 'animate-spin' : ''} /> {t.sync.now}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => run(signOut)}>
                {t.sync.signOut}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[14px] text-muted">{t.sync.intro}</p>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t.sync.email}
              className={inputCls}
              autoCapitalize="off"
            />
            {sent && (
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder={t.sync.code}
                className={`${inputCls} tracking-[0.3em]`}
              />
            )}
            <div className="flex gap-2">
              <Button
                disabled={busy || !/.+@.+\..+/.test(email)}
                onClick={() =>
                  run(async () => {
                    await sendCode(email.trim())
                    setSent(true)
                    toast({ text: t.sync.codeSent, tone: 'good' })
                  })
                }
              >
                {t.sync.sendCode}
              </Button>
              {sent && (
                <Button variant="primary" disabled={busy || code.length < 6} onClick={() => run(() => verifyCode(email.trim(), code))}>
                  {t.sync.verify}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </Group>
  )
}
