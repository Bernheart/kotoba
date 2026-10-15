import { Component, type ErrorInfo, type ReactNode } from 'react'

/** Keeps one broken screen from blanking the whole app; offers a reload. */
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) {
    return { error }
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-md px-6 pt-[calc(48px+var(--safe-top))] text-center">
        <p lang="ja" className="jp-serif text-[40px]">
          あれっ
        </p>
        <p className="mt-2 text-muted">Something went wrong / Coś poszło nie tak.</p>
        <pre className="mt-4 overflow-auto rounded-2xl bg-surface p-3 text-left text-[12px] whitespace-pre-wrap text-faint">{String(this.state.error.message)}</pre>
        <button className="mt-6 h-12 rounded-2xl bg-accent px-6 font-semibold text-accent-ink" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
