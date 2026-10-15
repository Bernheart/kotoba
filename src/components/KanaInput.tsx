import { forwardRef, useRef, type InputHTMLAttributes } from 'react'
import { toKana, toKatakana } from 'wanakana'

/**
 * Text input that turns romaji into kana as you type (IME mode keeps a trailing "n" until the next key),
 * while leaving native Japanese-keyboard input alone during composition.
 */
export const KanaInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
    value: string
    onValueChange: (v: string) => void
    /** 'kana' converts romaji; 'off' behaves like a plain input */
    mode?: 'kana' | 'katakana' | 'off'
  }
>(function KanaInput({ value, onValueChange, mode = 'kana', className = '', ...rest }, ref) {
  const composing = useRef(false)
  const convert = (v: string) => {
    if (mode === 'off') return v
    // Only convert the latin parts; keep kanji/kana typed by an IME as-is.
    return mode === 'katakana' ? toKatakana(v, { IMEMode: true }) : toKana(v, { IMEMode: true })
  }
  return (
    <input
      ref={ref}
      value={value}
      lang="ja"
      autoCapitalize="off"
      autoCorrect="off"
      autoComplete="off"
      spellCheck={false}
      onCompositionStart={() => (composing.current = true)}
      onCompositionEnd={(e) => {
        composing.current = false
        onValueChange(convert((e.target as HTMLInputElement).value))
      }}
      onChange={(e) => {
        const native = e.nativeEvent as InputEvent
        if (composing.current || native.isComposing) onValueChange(e.target.value)
        else onValueChange(convert(e.target.value))
      }}
      className={className}
      {...rest}
    />
  )
})
