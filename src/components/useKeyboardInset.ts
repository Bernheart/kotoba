import { useEffect } from 'react'

/**
 * iOS Safari doesn't resize the layout viewport when the keyboard opens, so fixed bottom bars end up
 * behind it. This publishes the covered height as `--kb-inset` (from the visualViewport API).
 */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      root.style.setProperty('--kb-inset', `${Math.round(inset)}px`)
      root.classList.toggle('kb-open', inset > 80)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      root.style.setProperty('--kb-inset', '0px')
      root.classList.remove('kb-open')
    }
  }, [])
}
