import { useEffect, useState } from 'react'
import { circulationService } from '@/services/circulationService'
import { format } from '@/lib/format'
import type { Circulation, Profile } from '@/types/ged'
import { ExternalLink, FileText, Loader2 } from 'lucide-react'

interface Props {
  profile: Profile
  /** Pré-sélection éventuelle */
  initialId?: string | null
}

export function DocumentPdfReader({ profile, initialId }: Props) {
  const [items, setItems] = useState<Circulation[]>([])
  const [selected, setSelected] = useState<Circulation | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [docLoading, setDocLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      setError(null)
      try {
        const rows = await circulationService.listReadableDocuments(profile)
        const withFile = rows.filter((c) => c.archive?.file_path)
        setItems(withFile)
        const pre =
          (initialId && withFile.find((c) => c.id === initialId)) ||
          withFile[0] ||
          null
        setSelected(pre)
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Erreur de chargement')
      } finally {
        setLoading(false)
      }
    })()
  }, [profile, initialId])

  useEffect(() => {
    if (!selected?.archive?.file_path) {
      setUrl(null)
      return
    }
    let cancelled = false
    void (async () => {
      setDocLoading(true)
      setError(null)
      try {
        const signed = await circulationService.getFileUrl(
          selected.archive!.file_path!,
        )
        if (!cancelled) {
          if (!signed) throw new Error('Impossible d’ouvrir le PDF')
          setUrl(signed)
        }
      } catch (e) {
        if (!cancelled) {
          setUrl(null)
          setError(e instanceof Error ? e.message : 'Échec lecture PDF')
        }
      } finally {
        if (!cancelled) setDocLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [selected])

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-16 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement des documents…
      </div>
    )
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 px-4 py-3">
          <h3 className="text-sm font-medium text-slate-900">Documents PDF</h3>
          <p className="text-xs text-slate-500">{items.length} fichier(s) accessible(s)</p>
        </div>
        <ul className="max-h-[32rem] divide-y divide-slate-100 overflow-y-auto">
          {items.length === 0 && (
            <li className="px-4 py-10 text-center text-sm text-slate-500">
              Aucun PDF disponible dans votre périmètre.
            </li>
          )}
          {items.map((item) => {
            const active = selected?.id === item.id
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setSelected(item)}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${
                    active ? 'bg-sky-50' : 'hover:bg-slate-50'
                  }`}
                >
                  <FileText
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      active ? 'text-[#0f4c75]' : 'text-slate-400'
                    }`}
                  />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-slate-900">
                      {item.archive?.nom_doc_phys || item.archive?.concerne}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">
                      {item.archive?.concerne} · {format.date(item.created_at)}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        {!selected ? (
          <p className="py-16 text-center text-sm text-slate-500">
            Sélectionnez un document pour le lire.
          </p>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-slate-900">
                  {selected.archive?.concerne}
                </p>
                <p className="text-xs text-slate-500">
                  {selected.archive?.nom_doc_phys ?? 'Document PDF'}
                  {selected.archive?.reference
                    ? ` · Réf. ${selected.archive.reference}`
                    : ''}
                  {selected.archive?.num_folio
                    ? ` · Folio ${selected.archive.num_folio}`
                    : ''}
                </p>
              </div>
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Ouvrir
                </a>
              )}
            </div>

            {error && (
              <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}

            {docLoading ? (
              <div className="flex h-[28rem] items-center justify-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Ouverture du PDF…
              </div>
            ) : url ? (
              <iframe
                title="Lecture PDF"
                src={url}
                className="h-[28rem] w-full rounded-lg border border-slate-200 bg-slate-50"
              />
            ) : (
              <p className="py-16 text-center text-sm text-slate-500">
                Aperçu indisponible.
              </p>
            )}
          </>
        )}
      </div>
    </div>
  )
}

/** Mini-lecteur pour un fichier déjà connu (panneau latéral) */
export function PdfPreviewPanel({
  filePath,
  title,
}: {
  filePath?: string | null
  title?: string
}) {
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!filePath) {
      setUrl(null)
      return
    }
    let cancelled = false
    void (async () => {
      setLoading(true)
      const signed = await circulationService.getFileUrl(filePath)
      if (!cancelled) setUrl(signed)
      if (!cancelled) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [filePath])

  if (!filePath) {
    return <p className="text-sm text-slate-500">Aucun fichier attaché.</p>
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
      </p>
    )
  }

  if (!url) {
    return <p className="text-sm text-slate-500">Impossible de charger le PDF.</p>
  }

  return (
    <div className="space-y-2">
      {title && <p className="text-xs font-medium text-slate-500">{title}</p>}
      <iframe
        title="Aperçu PDF"
        src={url}
        className="h-56 w-full rounded-md border border-slate-200 bg-white"
      />
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1 text-xs text-[#0f4c75] hover:underline"
      >
        <ExternalLink className="h-3 w-3" /> Ouvrir dans un onglet
      </a>
    </div>
  )
}
