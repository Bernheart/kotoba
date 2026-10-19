import { MotionConfig } from 'motion/react'
import { lazy, Suspense, useEffect, useState } from 'react'
import { Route, Router, Switch, useLocation } from 'wouter'
import { useHashLocation } from 'wouter/use-hash-location'
import { ErrorBoundary } from './components/ErrorBoundary'
import { BottomNav, SideRail } from './components/Nav'
import { Page } from './components/Page'
import { PwaUpdater } from './components/PwaUpdater'
import { ToastProvider } from './components/ui'
import { requestPersistence, storageWorks } from './lib/db'
import { firstSyncDone, startSync } from './lib/sync/engine'
import { applyScheduler } from './lib/srs/schedule'
import { useT } from './lib/i18n'
import { LibraryPage } from './features/library/LibraryPage'
import { ReviewPage } from './features/review/ReviewPage'
import { StudyPage } from './features/study/StudyPage'
import { SettingsPage } from './features/settings/SettingsPage'
import { TodayPage } from './features/today/TodayPage'
import { WelcomeSheet } from './features/today/WelcomeSheet'
import { WordSheetProvider } from './features/word/WordSheet'
import { useSettings } from './lib/settings'
import { VocabProvider } from './lib/vocab-context'

const ImportPage = lazy(() => import('./features/library/ImportPage').then((m) => ({ default: m.ImportPage })))
const ConjugationPage = lazy(() => import('./features/quiz/ConjugationPage').then((m) => ({ default: m.ConjugationPage })))
const KanaPage = lazy(() => import('./features/quiz/KanaPage').then((m) => ({ default: m.KanaPage })))
const MatchingPage = lazy(() => import('./features/quiz/MatchingPage').then((m) => ({ default: m.MatchingPage })))
const QuizPage = lazy(() => import('./features/quiz/QuizPage').then((m) => ({ default: m.QuizPage })))
const SessionPage = lazy(() => import('./features/quiz/SessionPage').then((m) => ({ default: m.SessionPage })))
const ShadowingPage = lazy(() => import('./features/quiz/ShadowingPage').then((m) => ({ default: m.ShadowingPage })))
const StatsPage = lazy(() => import('./features/stats/StatsPage').then((m) => ({ default: m.StatsPage })))
const FOCUS_ROUTES = ['/review', '/session', '/quiz', '/conjugation', '/kana', '/shadowing', '/matching']

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

/** Single-file mode (file://) may not persist IndexedDB — warn so the user exports a backup. */
function StorageWarning() {
  const t = useT()
  const [bad, setBad] = useState(false)
  useEffect(() => {
    if (location.protocol === 'file:' || __SINGLE__) void storageWorks().then((ok) => setBad(!ok || location.protocol === 'file:'))
  }, [])
  if (!bad) return null
  return <div className="bg-warn/15 px-4 pt-[calc(8px+var(--safe-top))] pb-2 text-center text-[13px] text-warn">{t.pwa.singleFile}</div>
}

function Shell() {
  useApplySettings()
  useEffect(() => {
    void requestPersistence()
    startSync()
    // Re-schedule cards with the selected algorithm once the other device's answers have been pulled in.
    void Promise.race([firstSyncDone, new Promise((r) => setTimeout(r, 8000))]).then(() => applyScheduler())
  }, [])
  const [loc] = useLocation()
  const focus = FOCUS_ROUTES.some((r) => loc.startsWith(r))
  return (
    <div className="ambient min-h-dvh">
      <StorageWarning />
      {!focus && <SideRail />}
      <div className={focus ? '' : 'lg:pl-60'}>
        <ErrorBoundary key={loc}>
        <Suspense fallback={<div className="min-h-dvh" />}>
        <Switch>
          <Route path="/" component={TodayPage} />
          <Route path="/library" component={LibraryPage} />
          <Route path="/import" component={ImportPage} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/review" component={ReviewPage} />
          <Route path="/study" component={StudyPage} />
          <Route path="/stats" component={StatsPage} />
          <Route path="/quiz/:mode" component={QuizPage} />
          <Route path="/matching" component={MatchingPage} />
          <Route path="/conjugation" component={ConjugationPage} />
          <Route path="/kana" component={KanaPage} />
          <Route path="/shadowing" component={ShadowingPage} />
          <Route path="/session" component={SessionPage} />
          <Route>
            <Page title="404">
              <p className="text-muted">Not found.</p>
            </Page>
          </Route>
        </Switch>
        </Suspense>
        </ErrorBoundary>
      </div>
      {!focus && <BottomNav />}
      <PwaUpdater />
      <WelcomeSheet />
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
