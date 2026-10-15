import { AnimatePresence, motion } from 'motion/react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ComponentProps,
  type ReactNode,
} from 'react'
import { IconClose } from './icons'

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger'

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ComponentProps<'button'> & { variant?: BtnVariant; size?: 'sm' | 'md' | 'lg' }) {
  const v: Record<BtnVariant, string> = {
    primary: 'bg-accent text-accent-ink font-semibold shadow-[0_8px_24px_-10px_var(--k-accent)] active:brightness-95',
    secondary: 'bg-raised text-text border border-line active:bg-surface',
    ghost: 'text-muted active:bg-raised',
    danger: 'bg-transparent text-accent border border-accent/50 active:bg-accent/10',
  }
  const s = { sm: 'h-9 px-3 text-sm rounded-xl', md: 'h-11 px-4 text-[15px] rounded-2xl', lg: 'h-14 px-6 text-[17px] rounded-2xl' }
  return (
    <button
      className={`inline-flex select-none items-center justify-center gap-2 transition-[transform,background,filter] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40 ${v[variant]} ${s[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function IconButton({
  label,
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      aria-label={label}
      title={label}
      className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition active:scale-95 active:bg-raised hover:text-text ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Chip({
  active,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      aria-pressed={active}
      className={`inline-flex h-9 shrink-0 select-none items-center gap-1.5 rounded-full border px-3.5 text-sm transition active:scale-[0.97] ${
        active ? 'border-accent/60 bg-accent/15 text-text' : 'border-line bg-surface text-muted hover:text-text'
      } ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  className = '',
}: {
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div role="radiogroup" className={`flex rounded-2xl border border-line bg-bg-2 p-1 ${className}`}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          role="radio"
          aria-checked={o.value === value}
          onClick={() => onChange(o.value)}
          className={`relative flex-1 rounded-xl px-3 py-2 text-sm transition ${o.value === value ? 'text-text' : 'text-muted'}`}
        >
          {o.value === value && (
            <motion.span
              layoutId={`seg-${options.map((x) => x.value).join('-')}`}
              className="absolute inset-0 rounded-xl bg-raised shadow-sm"
              transition={{ type: 'spring', stiffness: 500, damping: 38 }}
            />
          )}
          <span className="relative">{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-8 w-[52px] shrink-0 rounded-full transition-colors ${checked ? 'bg-good' : 'bg-line'}`}
    >
      <motion.span
        className="absolute top-1 left-1 h-6 w-6 rounded-full bg-[#f5f1ea] shadow"
        animate={{ x: checked ? 20 : 0 }}
        transition={{ type: 'spring', stiffness: 600, damping: 35 }}
      />
    </button>
  )
}

export function Card({ className = '', children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-3xl border border-line/70 bg-surface ${className}`}>{children}</div>
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-end justify-between gap-3 px-1">
      <h2 className="text-[13px] font-semibold tracking-wide text-muted">{children}</h2>
      {action}
    </div>
  )
}

export function ProgressBar({ value, className = '', color = 'var(--k-accent)' }: { value: number; className?: string; color?: string }) {
  return (
    <div className={`h-1.5 overflow-hidden rounded-full bg-line/60 ${className}`}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={false}
        animate={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }}
        transition={{ type: 'spring', stiffness: 200, damping: 30 }}
      />
    </div>
  )
}

export function Ring({ value, size = 64, stroke = 6, color = 'var(--k-accent)', children }: { value: number; size?: number; stroke?: number; color?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--k-line)" strokeWidth={stroke} fill="none" />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          initial={false}
          animate={{ strokeDashoffset: c * (1 - Math.max(0, Math.min(1, value))) }}
          transition={{ type: 'spring', stiffness: 120, damping: 24 }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  )
}

/** Bottom sheet on phones, centered dialog on desktop. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open, onClose])
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="dialog" aria-modal="true">
          <motion.div
            className="absolute inset-0 bg-black/55"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            ref={ref}
            className={`relative flex max-h-[92dvh] w-full flex-col rounded-t-[28px] border border-line bg-surface shadow-2xl lg:rounded-[28px] ${wide ? 'lg:max-w-3xl' : 'lg:max-w-xl'}`}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 38 }}
          >
            <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-line lg:hidden" />
            <div className="flex items-center justify-between gap-3 px-5 pt-3 pb-2">
              <div className="min-w-0 text-[17px] font-semibold">{title}</div>
              <IconButton label="Close" onClick={onClose} className="-mr-2">
                <IconClose size={22} />
              </IconButton>
            </div>
            <div className="overflow-y-auto overscroll-contain px-5 pb-[calc(20px+var(--safe-bottom))]">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/* ---------- Toasts ---------- */
interface Toast {
  id: number
  text: ReactNode
  action?: { label: string; run: () => void }
  tone?: 'info' | 'good' | 'bad'
}
const ToastCtx = createContext<(t: Omit<Toast, 'id'> & { ms?: number }) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((t: Omit<Toast, 'id'> & { ms?: number }) => {
    const id = Date.now() + Math.random()
    setToasts((ts) => [...ts.slice(-2), { ...t, id }])
    setTimeout(() => setToasts((ts) => ts.filter((x) => x.id !== id)), t.ms ?? 3200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-[calc(12px+var(--safe-top))] z-[60] flex flex-col items-center gap-2 px-4">
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ y: -16, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: -16, opacity: 0 }}
              className="glass pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl border border-line px-4 py-3 text-[15px] shadow-xl"
              role="status"
            >
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${t.tone === 'good' ? 'bg-good' : t.tone === 'bad' ? 'bg-accent' : 'bg-easy'}`}
              />
              <span className="min-w-0">{t.text}</span>
              {t.action && (
                <button className="ml-1 shrink-0 font-semibold text-accent" onClick={t.action.run}>
                  {t.action.label}
                </button>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}
