import { useLiveQuery } from 'dexie-react-hooks'
import { createContext, useContext, useMemo, type ReactNode } from 'react'
import { db } from './db'
import { useSettings } from './settings'
import { buildVocab, type Vocab } from './vocab'

const empty = buildVocab([])
const VocabCtx = createContext<Vocab>(empty)

export function VocabProvider({ children }: { children: ReactNode }) {
  const rows = useLiveQuery(() => db.userWords.toArray(), [])
  const extended = useSettings().wordList === 'extended'
  const vocab = useMemo(() => (rows ? buildVocab(rows, { extended }) : empty), [rows, extended])
  return <VocabCtx.Provider value={vocab}>{children}</VocabCtx.Provider>
}

export const useVocab = () => useContext(VocabCtx)
