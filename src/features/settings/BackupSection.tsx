import { useLiveQuery } from 'dexie-react-hooks'
import { useEffect, useRef, useState } from 'react'
import { IconDownload, IconUpload } from '../../components/icons'
import { Button, Segmented, useToast } from '../../components/ui'
import { backupFile, createBackup, eraseAll, parseBackup, restoreBackup, shareOrDownload } from '../../lib/backup'
import { db } from '../../lib/db'
import { relativeDay, useLang, useT } from '../../lib/i18n'
import { Group, Row } from './SettingsPage'

export function BackupSection({ persisted }: { persisted: boolean | null }) {
  const t = useT()
  const lang = useLang()
  const toast = useToast()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<'merge' | 'replace'>('merge')
  const last = useLiveQuery(() => db.meta.get('lastBackupAt'), [])
  const logCount = useLiveQuery(() => db.reviewLogs.count(), [])

  // Prepare the file ahead of time: iOS only opens the share sheet if share() runs right in the tap.
  useEffect(() => {
    void createBackup().then((b) => setFile(backupFile(b)))
  }, [logCount, last])

  return (
    <Group title={t.settings.data}>
      <Row label={t.settings.storage} hint={persisted ? t.settings.persisted : t.settings.notPersisted}>
        <span className={`text-[20px] ${persisted ? 'text-good' : 'text-warn'}`}>{persisted ? '●' : '○'}</span>
      </Row>
      <div className="space-y-3 border-b border-line/50 px-4 py-4">
        <p className="text-[13px] text-faint">
          {t.settings.lastBackup(last?.value ? relativeDay(last.value as number, lang) : t.settings.never)} · {t.settings.exportHint}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            disabled={!file}
            onClick={() => {
              if (file) void shareOrDownload(file).then((r) => r !== 'cancelled' && toast({ text: t.common.saved, tone: 'good' }))
            }}
          >
            <IconDownload size={18} /> {t.settings.export}
          </Button>
          <Button onClick={() => fileRef.current?.click()}>
            <IconUpload size={18} /> {t.settings.importBackup}
          </Button>
        </div>
        <Segmented
          value={mode}
          onChange={setMode}
          options={[
            { value: 'merge', label: t.settings.importMerge },
            { value: 'replace', label: t.settings.importReplace },
          ]}
        />
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            try {
              const b = parseBackup(await f.text())
              if (mode === 'replace' && !confirm(t.settings.resetConfirm)) return
              await restoreBackup(b, mode)
              toast({ text: t.settings.imported, tone: 'good' })
            } catch (err) {
              toast({ text: `${t.common.error}: ${(err as Error).message}`, tone: 'bad' })
            }
          }}
        />
      </div>
      <div className="px-4 py-3">
        <button
          className="text-[14px] text-accent"
          onClick={async () => {
            if (confirm(t.settings.resetConfirm)) {
              await eraseAll()
              location.reload()
            }
          }}
        >
          {t.settings.resetAll}
        </button>
      </div>
    </Group>
  )
}
