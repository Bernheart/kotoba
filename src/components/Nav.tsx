import { motion } from 'motion/react'
import { Link, useLocation } from 'wouter'
import { useT } from '../lib/i18n'
import { IconLibrary, IconSettings, IconStats, IconStudy, IconToday } from './icons'

const ITEMS = [
  { href: '/', key: 'today', Icon: IconToday },
  { href: '/study', key: 'study', Icon: IconStudy },
  { href: '/library', key: 'library', Icon: IconLibrary },
  { href: '/stats', key: 'stats', Icon: IconStats },
  { href: '/settings', key: 'settings', Icon: IconSettings },
] as const

function isActive(loc: string, href: string) {
  return href === '/' ? loc === '/' : loc.startsWith(href)
}

export function Hanko({ size = 36 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="jp-serif inline-grid place-items-center rounded-[10px] bg-accent font-bold text-[#fff6f0] shadow-[0_6px_18px_-8px_var(--k-accent)]"
      style={{ width: size, height: size, fontSize: size * 0.56 }}
      lang="ja"
    >
      言
    </span>
  )
}

export function BottomNav() {
  const [loc] = useLocation()
  const t = useT()
  return (
    <nav
      className="glass fixed inset-x-0 bottom-0 z-40 border-t border-line/70 pb-[var(--safe-bottom)] lg:hidden"
      aria-label="Main"
    >
      <ul className="mx-auto flex h-[var(--nav-h)] max-w-xl items-stretch justify-around px-2">
        {ITEMS.map(({ href, key, Icon }) => {
          const active = isActive(loc, href)
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={`relative flex h-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  active ? 'text-text' : 'text-faint'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {active && (
                  <motion.span
                    layoutId="nav-dot"
                    className="absolute top-1.5 h-1 w-5 rounded-full bg-accent"
                    transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                  />
                )}
                <Icon size={24} />
                <span>{t.nav[key]}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

export function SideRail() {
  const [loc] = useLocation()
  const t = useT()
  return (
    <nav className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-line/60 bg-bg-2/70 px-4 py-6 lg:flex" aria-label="Main">
      <Link href="/" className="mb-8 flex items-center gap-3 px-2">
        <Hanko />
        <span className="text-lg font-semibold tracking-tight">Kotoba</span>
      </Link>
      <ul className="flex flex-col gap-1">
        {ITEMS.map(({ href, key, Icon }) => {
          const active = isActive(loc, href)
          return (
            <li key={href}>
              <Link
                href={href}
                className={`relative flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] transition-colors ${
                  active ? 'bg-raised text-text' : 'text-muted hover:bg-surface hover:text-text'
                }`}
                aria-current={active ? 'page' : undefined}
              >
                {active && <span className="absolute left-0 h-5 w-1 rounded-r-full bg-accent" />}
                <Icon size={22} />
                {t.nav[key]}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
