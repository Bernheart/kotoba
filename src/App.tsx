import { MotionConfig } from 'motion/react'
import { useEffect } from 'react'
import { Route, Router, Switch, useLocation } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'
import { ErrorBoundary } from './components/ErrorBoundary'
import { BottomNav, SideRail } from './components/Nav'
import { Page } from './components/Page'
import { ToastProvider } from './components/ui'
import { ImportPage } from './features/library/ImportPage'
import { LibraryPage } from './features/library/LibraryPage'
import { ReviewPage } from './features/review/ReviewPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { TodayPage } from './features/today/TodayPage'
import { WordSheetProvider } from './features/word/WordSheet'
import { useSettings } from './lib/settings'
import { VocabProvider } from './lib/vocab-context'

const FOCUS_ROUTES = ['/review', '/session', '/quiz', '/conjugation', '/kana', '/shadowing', '/learn']

function useApplySettings() {
  const s = useSettings()
  useEffect(() => {
    const root = document.documentElement
    const dark = s.theme === 'dark' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
    root.dataset.theme = dark ? 'dark' : 'light'
    root.dataset.furigana = s.furigana ? 'on' : 'off'
    root.lang = s.lang
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f1117' : '#f3efe7')
  }, [s.theme, s.furigana, s.lang])
}

function Shell() {
  useApplySettings()
  const [loc] = useLocation()
  const focus = FOCUS_ROUTES.some((r) => loc.startsWith(r))
  return (
    <div className="ambient min-h-dvh">
      {!focus && <SideRail />}
      <div className={focus ? '' : 'lg:pl-60'}>
        <ErrorBoundary key={loc}>
        <Switch>
          <Route path="/" component={TodayPage} />
          <Route path="/library" component={LibraryPage} />
          <Route path="/import" component={ImportPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/review" component={ReviewPage} />
          <Route>
            <Page title="404">
              <p className="text-muted">Not found.</p>
            </Page>
          </Route>
        </Switch>
        </ErrorBoundary>
      </div>
      {!focus && <BottomNav />}
    </div>
  )
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <Router hook={useHashLocation}>
        <ToastProvider>
          <VocabProvider>
            <WordSheetProvider>
              <Shell />
            </WordSheetProvider>
          </VocabProvider>
        </ToastProvider>
      </Router>
    </MotionConfig>
  )
}
