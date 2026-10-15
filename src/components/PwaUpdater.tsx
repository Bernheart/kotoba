import { useEffect, useState } from 'react'
import { useT } from '../lib/i18n'
import { Button } from './ui'

/** Registers the service worker (PWA build only) and offers a reload when a new version is waiting. */
export function PwaUpdater() {
  const t = useT()
  const [update, setUpdate] = useState<null | (() => void)>(null)
  useEffect(() => {
    if (__SINGLE__ || import.meta.env.DEV || !('serviceWorker' in navigator)) return
    void import('virtual:pwa-register').then(({ registerSW }) => {
      const updateSW = registerSW({
        immediate: true,
        onNeedRefresh: () => setUpdate(() => () => void updateSW(true)),
        onRegisteredSW(_url, reg) {
          // Check for updates when the app comes back to the foreground (iOS rarely restarts PWAs).
          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) void reg?.update()
          })
        },
      })
    })
  }, [])
  if (!update) return null
  return (
    <div className="glass fixed inset-x-3 bottom-[calc(var(--nav-h)+var(--safe-bottom)+10px)] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line px-4 py-3 shadow-xl lg:bottom-4">
      <span className="flex-1 text-[15px]">{t.pwa.update}</span>
      <Button size="sm" variant="primary" onClick={update}>
        {t.pwa.reload}
      </Button>
    </div>
  )
}
