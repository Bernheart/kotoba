import { useEffect, useState } from 'react'
import { IconSync } from '../../components/icons'
import { Button, Segmented, useToast } from '../../components/ui'
import { relativeDay, useLang, useT } from '../../lib/i18n'
import { setSetting, useSettings } from '../../lib/settings'
import {
  refreshAuth,
  sendCode,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  syncConfig,
  syncNow,
  usingBuiltInServer,
  useSyncStatus,
  verifyCode,
} from '../../lib/sync/engine'
import { Group } from './SettingsPage'

const inputCls = 'h-12 w-full rounded-2xl border border-line bg-bg-2 px-3.5 text-[16px] placeholder:text-faint focus:border-accent/60 focus:outline-none'

export function SyncSection() {
  const t = useT()
  const lang = useLang()
  const s = useSettings()
  const toast = useToast()
  const st = useSyncStatus()
  const [email, setEmail] = useState('')
  const [method, setMethod] = useState<'password' | 'code'>('password')
  const [password, setPassword] = useState('')
  const [code, setCode] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState(s.supabaseUrl)
  const [key, setKey] = useState(s.supabaseKey)
  const [ownerMode, setOwnerMode] = useState(false)
  const [customOpen, setCustomOpen] = useState(false)
  const configured = !!syncConfig()
  const builtIn = usingBuiltInServer()

  useEffect(() => {
    void refreshAuth()
  }, [s.supabaseUrl, s.supabaseKey])

  const run = async (f: () => Promise<void>) => {
    setBusy(true)
    try {
      await f()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/signups? not allowed|signup.*disabled/i.test(msg)) toast({ text: t.sync.signupsClosed, tone: 'bad', ms: 9000 })
      else toast({ text: t.sync.failed(msg), tone: 'bad', ms: 6000 })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Group title={t.settings.sync}>
      <div className="space-y-3 px-4 py-4">
        {!configured || st.state === 'off' || customOpen ? (
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
                  setCustomOpen(false)
                })
              }
            >
              {t.common.save}
            </Button>
            {customOpen && (
              <button className="ml-3 text-[14px] text-muted" onClick={() => setCustomOpen(false)}>
                {t.common.cancel}
              </button>
            )}
          </>
        ) : st.email ? (
          <>
            <p className="text-[15px]">{t.sync.signedIn(st.email)}</p>
            {!builtIn && import.meta.env.VITE_SUPABASE_URL && <p className="text-[12px] text-faint">{s.supabaseUrl}</p>}
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
        ) : builtIn && !ownerMode ? (
          <>
            <p className="text-[15px] font-semibold">🔒 {t.sync.privateTitle}</p>
            <p className="text-[14px] text-muted">{t.sync.privateBody}</p>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={() => setCustomOpen(true)}>
                {t.sync.useOwn}
              </Button>
              <button className="text-[13px] text-faint underline-offset-4 hover:underline" onClick={() => setOwnerMode(true)}>
                {t.sync.ownerSignIn}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[14px] text-muted">{t.sync.intro}</p>
            <Segmented
              value={method}
              onChange={setMethod}
              options={[
                { value: 'password', label: t.sync.methodPassword },
                { value: 'code', label: t.sync.methodCode },
              ]}
            />
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
            {method === 'password' ? (
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  void run(() => signInWithPassword(email.trim(), password))
                }}
              >
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={t.sync.password}
                  className={inputCls}
                />
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" variant="primary" disabled={busy || !/.+@.+\..+/.test(email) || password.length < 6}>
                    {t.sync.signIn}
                  </Button>
                  <Button
                    type="button"
                    disabled={busy || !/.+@.+\..+/.test(email) || password.length < 6}
                    onClick={() =>
                      run(async () => {
                        const r = await signUpWithPassword(email.trim(), password)
                        if (r === 'confirm-email') toast({ text: t.sync.confirmEmail, ms: 12000 })
                      })
                    }
                  >
                    {t.sync.createAccount}
                  </Button>
                  {!builtIn && import.meta.env.VITE_SUPABASE_URL && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() =>
                        run(async () => {
                          await setSetting('supabaseUrl', '')
                          await setSetting('supabaseKey', '')
                          setUrl('')
                          setKey('')
                          await refreshAuth()
                        })
                      }
                    >
                      {t.sync.useDefault}
                    </Button>
                  )}
                </div>
              </form>
            ) : (
              <>
                <p className="text-[12px] text-faint">{t.sync.codeNeedsSmtp}</p>
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
          </>
        )}
      </div>
    </Group>
  )
}
