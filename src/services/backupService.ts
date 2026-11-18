import { supabase } from '@/lib/supabase'

/** Tables GED : documentation, archives et flux documentaire */
export const GED_BACKUP_TABLES = [
  'tb_directions',
  'tb_services',
  'tb_profiles',
  'tb_emplacements_secretariat',
  'tb_archives',
  'tb_circulations',
  'tb_circulation_events',
  'tb_annotations',
  'tb_aval_etapes',
  'tb_demandes_docs',
  'tb_archives_cli',
  'tb_correspondants',
] as const

export type GedBackupTable = (typeof GED_BACKUP_TABLES)[number]

export type GedBackupPayload = {
  version: 1
  kind: 'ged_backup'
  created_at: string
  created_by?: { id: string; full_name: string; email: string } | null
  tables: Partial<Record<GedBackupTable, unknown[]>>
  counts: Partial<Record<GedBackupTable, number>>
  notes: string[]
}

export type RestoreResult = {
  table: string
  upserted: number
  skipped: boolean
  error?: string
}

const PAGE = 1000

async function fetchAllRows(table: string): Promise<unknown[]> {
  const rows: unknown[] = []
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .range(from, from + PAGE - 1)
    if (error) {
      // Table absente / non exposée : ignorer
      if (/does not exist|relation|permission|schema cache/i.test(error.message)) {
        return rows
      }
      throw new Error(`${table} : ${error.message}`)
    }
    if (!data?.length) break
    rows.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}

function stampFileName(date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `ged-backup-${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}.json`
}

export const backupService = {
  async buildBackup(profile?: {
    id: string
    full_name: string
    email: string
  }): Promise<GedBackupPayload> {
    const tables: GedBackupPayload['tables'] = {}
    const counts: GedBackupPayload['counts'] = {}
    const notes: string[] = [
      'Sauvegarde des données GED (archives, circulations, aval, demandes, référentiels).',
      'Les fichiers binaires du bucket Storage « archives » ne sont pas inclus : seuls les chemins (file_path / chemin) sont dans tb_archives.',
    ]

    for (const table of GED_BACKUP_TABLES) {
      const rows = await fetchAllRows(table)
      tables[table] = rows
      counts[table] = rows.length
    }

    return {
      version: 1,
      kind: 'ged_backup',
      created_at: new Date().toISOString(),
      created_by: profile
        ? {
            id: profile.id,
            full_name: profile.full_name,
            email: profile.email,
          }
        : null,
      tables,
      counts,
      notes,
    }
  },

  downloadBackup(payload: GedBackupPayload, fileName?: string): string {
    const name = fileName ?? stampFileName(new Date(payload.created_at))
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
    return name
  },

  parseBackupFile(text: string): GedBackupPayload {
    const raw = JSON.parse(text) as GedBackupPayload
    if (!raw || raw.kind !== 'ged_backup' || raw.version !== 1) {
      throw new Error('Fichier de sauvegarde GED invalide (kind / version).')
    }
    if (!raw.tables || typeof raw.tables !== 'object') {
      throw new Error('Fichier de sauvegarde sans tables.')
    }
    return raw
  },

  /**
   * Restauration par upsert (fusion). Ordre respectant les FK.
   * Ne vide pas la base : les lignes absentes du fichier restent en place.
   */
  async restoreBackup(payload: GedBackupPayload): Promise<RestoreResult[]> {
    const order: GedBackupTable[] = [
      'tb_directions',
      'tb_services',
      'tb_profiles',
      'tb_emplacements_secretariat',
      'tb_archives',
      'tb_circulations',
      'tb_circulation_events',
      'tb_annotations',
      'tb_aval_etapes',
      'tb_demandes_docs',
      'tb_archives_cli',
      'tb_correspondants',
    ]

    const results: RestoreResult[] = []

    for (const table of order) {
      const rows = payload.tables[table]
      if (!rows?.length) {
        results.push({ table, upserted: 0, skipped: true })
        continue
      }

      let upserted = 0
      try {
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200)
          const { error } = await supabase.from(table).upsert(chunk as never[])
          if (error) throw error
          upserted += chunk.length
        }
        results.push({ table, upserted, skipped: false })
      } catch (e) {
        results.push({
          table,
          upserted,
          skipped: false,
          error: e instanceof Error ? e.message : String(e),
        })
      }
    }

    return results
  },

  /** Écriture locale via middleware Vite (npm run dev uniquement) */
  async saveToLocalFolder(
    payload: GedBackupPayload,
  ): Promise<{ ok: true; path: string; fileName: string } | { ok: false; reason: string }> {
    const fileName = stampFileName(new Date(payload.created_at))
    try {
      const res = await fetch('/api/ged-backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileName, payload }),
      })
      if (!res.ok) {
        const text = await res.text()
        return {
          ok: false,
          reason:
            res.status === 404
              ? 'Écriture locale indisponible (utilisez le téléchargement, ou lancez npm run dev).'
              : text || `HTTP ${res.status}`,
        }
      }
      const data = (await res.json()) as { path: string; fileName: string }
      return { ok: true, path: data.path, fileName: data.fileName }
    } catch {
      return {
        ok: false,
        reason:
          'Écriture locale indisponible hors environnement de développement.',
      }
    }
  },

  async listLocalBackups(): Promise<
    { fileName: string; size: number; mtime: string }[]
  > {
    try {
      const res = await fetch('/api/ged-backup')
      if (!res.ok) return []
      const data = (await res.json()) as {
        files?: { fileName: string; size: number; mtime: string }[]
      }
      return data.files ?? []
    } catch {
      return []
    }
  },

  async readLocalBackup(fileName: string): Promise<GedBackupPayload> {
    const res = await fetch(
      `/api/ged-backup?file=${encodeURIComponent(fileName)}`,
    )
    if (!res.ok) {
      throw new Error('Impossible de lire la sauvegarde locale.')
    }
    const text = await res.text()
    return this.parseBackupFile(text)
  },
}
