import type { ReactNode } from 'react'
import { useLocation } from 'wouter'
import { IconBack } from './icons'
import { IconButton } from './ui'

/** Standard tab page: safe-area aware, room for the bottom nav on phones. */
export function Page({
  title,
  subtitle,
  actions,
  children,
  wide,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  actions?: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  return (
    <main
      className={`mx-auto w-full px-4 pt-[calc(18px+var(--safe-top))] pb-[calc(var(--nav-h)+28px+var(--safe-bottom))] sm:px-6 lg:pt-10 lg:pb-12 ${
        wide ? 'max-w-5xl' : 'max-w-2xl'
      }`}
    >
      {(title || actions) && (
        <header className="mb-5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h1 className="text-[28px] leading-tight font-bold tracking-tight">{title}</h1>}
            {subtitle && <p className="mt-1 text-[15px] text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </header>
      )}
      {children}
    </main>
  )
}

/** Full-screen focus layout (reviews, quizzes): no tab bar, a back button, keyboard-aware bottom area. */
export function FocusLayout({
  title,
  right,
  children,
  onExit,
  progress,
}: {
  title?: ReactNode
  right?: ReactNode
  children: ReactNode
  onExit?: () => void
  progress?: ReactNode
}) {
  const [, navigate] = useLocation()
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col px-4 pt-[calc(8px+var(--safe-top))] pb-[calc(12px+var(--safe-bottom))] sm:px-6 lg:pt-6">
      <header className="flex h-12 items-center gap-2">
        <IconButton label="Back" onClick={onExit ?? (() => (history.length > 1 ? history.back() : navigate('/')))} className="-ml-2">
          <IconBack size={24} />
        </IconButton>
        <div className="min-w-0 flex-1">{progress ?? <div className="truncate text-[15px] font-semibold">{title}</div>}</div>
        {right}
      </header>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  )
}
