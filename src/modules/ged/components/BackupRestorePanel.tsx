import { useCallback, useEffect, useState } from 'react'
import {
  backupService,
  type GedBackupPayload,
  type RestoreResult,
} from '@/services/backupService'
import type { Profile } from '@/types/ged'
import {
  Database,
  Download,
  FolderOpen,
  RefreshCw,
  RotateCcw,
  Upload,
} from 'lucide-react'

const LOCAL_BACKUP_HINT =
  'C:\\Vibe coding\\Mes projets\\Archivage_Sonal\\backup'

type Props = {
  profile: Profile
}

export function BackupRestorePanel({ profile }: Props) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [lastPayload, setLastPayload] = useState<GedBackupPayload | null>(null)
  const [localFiles, setLocalFiles] = useState<
    { fileName: string; size: number; mtime: string }[]
  >([])
  const [localAvailable, setLocalAvailable] = useState(false)
  const [restoreLog, setRestoreLog] = useState<RestoreResult[] | null>(null)

  const refreshLocal = useCallback(async () => {
    const files = await backupService.listLocalBackups()
    setLocalFiles(files)
    setLocalAvailable(files.length > 0 || (await probeLocalApi()))
  }, [])

  useEffect(() => {
    void refreshLocal()
  }, [refreshLocal])

  async function probeLocalApi(): Promise<boolean> {
    try {
      const res = await fetch('/api/ged-backup')
      return res.ok
    } catch {
      return false
    }
  }

  async function handleBackup(alsoLocal: boolean) {
    setBusy(true)
    setError(null)
    setSuccess(null)
    setRestoreLog(null)
    try {
      const payload = await backupService.buildBackup(profile)
      setLastPayload(payload)
      const downloaded = backupService.downloadBackup(payload)

      let localMsg = ''
      if (alsoLocal) {
        const saved = await backupService.saveToLocalFolder(payload)
        if (saved.ok) {
          localMsg = ` · enregistrée aussi dans ${saved.path}`
          await refreshLocal()
        } else {
          localMsg = ` · écriture locale : ${saved.reason}`
        }
      } else {
        localMsg = ` · placez le fichier dans ${LOCAL_BACKUP_HINT} si besoin`
      }

      const total = Object.values(payload.counts).reduce(
        (a, n) => a + (n ?? 0),
        0,
      )
      setSuccess(
        `Sauvegarde ${downloaded} créée (${total} enregistrements)${localMsg}.`,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de la sauvegarde')
    } finally {
      setBusy(false)
    }
  }

  async function handleRestoreFromPayload(payload: GedBackupPayload) {
    const ok = window.confirm(
      'Restaurer cette sauvegarde ? Les données seront fusionnées (upsert) sans vider la base. Continuer ?',
    )
    if (!ok) return

    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const results = await backupService.restoreBackup(payload)
      setRestoreLog(results)
      const failed = results.filter((r) => r.error)
      if (failed.length) {
        setError(
          `Restauration partielle : ${failed.length} table(s) en erreur.`,
        )
      } else {
        const n = results.reduce((a, r) => a + r.upserted, 0)
        setSuccess(`Restauration terminée — ${n} ligne(s) upsertées.`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec de la restauration')
    } finally {
      setBusy(false)
    }
  }

  async function onFilePicked(file: File | null) {
    if (!file) return
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const text = await file.text()
      const payload = backupService.parseBackupFile(text)
      setLastPayload(payload)
      await handleRestoreFromPayload(payload)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fichier invalide')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-sm font-medium text-slate-900">
              <Database className="h-4 w-4 text-teal-700" />
              Sauvegarde &amp; Restauration
            </h3>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Export complet des données GED (archives, circulations, aval,
              demandes, directions, profils, emplacements). Dossier projet
              recommandé :{' '}
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-800">
                {LOCAL_BACKUP_HINT}
              </code>
            </p>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void refreshLocal()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
            Actualiser la liste
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleBackup(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-50"
          >
            <FolderOpen className="h-4 w-4" />
            Sauvegarder (télécharger + dossier local)
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleBackup(false)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <Download className="h-4 w-4" />
            Télécharger seulement
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
            <Upload className="h-4 w-4" />
            Restaurer depuis un fichier…
            <input
              type="file"
              accept="application/json,.json"
              className="hidden"
              disabled={busy}
              onChange={(e) => void onFilePicked(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {!localAvailable && (
          <p className="mt-3 text-xs text-amber-800">
            Écriture directe dans le dossier <strong>backup</strong> : lancez
            l’app en local (<code>npm run dev</code>) ou le script{' '}
            <code>npm run backup:ged</code>. Sur Netlify, utilisez le
            téléchargement puis copiez le JSON dans le dossier.
          </p>
        )}
      </div>

      {(success || error) && (
        <div
          className={`rounded-xl px-4 py-3 text-sm ${
            success
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border border-red-200 bg-red-50 text-red-700'
          }`}
        >
          {success ?? error}
        </div>
      )}

      {lastPayload && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
            Dernière sauvegarde —{' '}
            {new Date(lastPayload.created_at).toLocaleString('fr-FR')}
          </div>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Table</th>
                <th className="px-4 py-2">Lignes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(lastPayload.counts).map(([table, n]) => (
                <tr key={table}>
                  <td className="px-4 py-2 font-mono text-xs text-slate-700">
                    {table}
                  </td>
                  <td className="px-4 py-2 text-slate-800">{n ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {localFiles.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
            Sauvegardes dans le dossier local
          </div>
          <ul className="divide-y divide-slate-100">
            {localFiles.map((f) => (
              <li
                key={f.fileName}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-medium text-slate-800">{f.fileName}</p>
                  <p className="text-xs text-slate-500">
                    {(f.size / 1024).toFixed(1)} Ko ·{' '}
                    {new Date(f.mtime).toLocaleString('fr-FR')}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      try {
                        setBusy(true)
                        const payload = await backupService.readLocalBackup(
                          f.fileName,
                        )
                        setLastPayload(payload)
                        await handleRestoreFromPayload(payload)
                      } catch (e) {
                        setError(
                          e instanceof Error ? e.message : 'Lecture impossible',
                        )
                      } finally {
                        setBusy(false)
                      }
                    })()
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restaurer
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {restoreLog && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
            Journal de restauration
          </div>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">Table</th>
                <th className="px-4 py-2">Upsert</th>
                <th className="px-4 py-2">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {restoreLog.map((r) => (
                <tr key={r.table}>
                  <td className="px-4 py-2 font-mono text-xs">{r.table}</td>
                  <td className="px-4 py-2">{r.upserted}</td>
                  <td className="px-4 py-2">
                    {r.error ? (
                      <span className="text-red-700">{r.error}</span>
                    ) : r.skipped ? (
                      <span className="text-slate-500">vide / ignorée</span>
                    ) : (
                      <span className="text-emerald-700">OK</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
