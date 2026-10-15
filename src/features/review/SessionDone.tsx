import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { useT } from '../../lib/i18n'

/** The one signature moment: a vermilion hanko stamp when a session is complete. */
export function Hanko({ text = 'よくできました' }: { text?: string }) {
  return (
    <motion.div
      initial={{ scale: 2.2, rotate: -18, opacity: 0 }}
      animate={{ scale: 1, rotate: -8, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 14, delay: 0.15 }}
      className="relative mx-auto grid h-36 w-36 place-items-center rounded-[28px] border-[5px] border-accent text-accent"
      style={{ boxShadow: 'inset 0 0 0 3px color-mix(in oklab, var(--k-accent) 35%, transparent)' }}
      aria-hidden="true"
    >
      <span lang="ja" className="jp-serif text-center text-[26px] leading-[1.25] font-bold [writing-mode:vertical-rl]">
        {text}
      </span>
      <motion.span
        className="absolute inset-0 rounded-[24px] bg-accent/20"
        initial={{ opacity: 0.8 }}
        animate={{ opacity: 0 }}
        transition={{ delay: 0.35, duration: 0.6 }}
      />
    </motion.div>
  )
}

export function SessionDone({
  title,
  stats,
  children,
  stamp = true,
}: {
  title?: string
  stats: { label: string; value: ReactNode }[]
  children?: ReactNode
  stamp?: boolean
}) {
  const t = useT()
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-8 text-center">
      {stamp && <Hanko />}
      <h2 className="mt-8 text-[24px] font-bold">{title ?? t.review.sessionDone}</h2>
      <div className="mt-5 grid w-full max-w-sm grid-cols-3 gap-2">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl bg-surface px-2 py-3">
            <div className="text-[20px] font-semibold tabular-nums">{s.value}</div>
            <div className="text-[12px] text-faint">{s.label}</div>
          </div>
        ))}
      </div>
      <div className="mt-8 flex w-full max-w-sm flex-col gap-2">{children}</div>
    </div>
  )
}
