import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ACCEPTED_DOCUMENT_ACCEPT } from '@/lib/documentFiles'
import { ringBellThreeTimes } from '@/lib/bellAlert'
import { FieldHint } from '@/modules/ged/components/FieldHint'
import { FormBrandBar } from '@/modules/ged/components/DashboardShared'
import { format } from '@/lib/format'
import { circulationService } from '@/services/circulationService'
import {
  DEMANDE_DOC_STATUS_LABELS,
  type DemandeDoc,
  type DemandeDocStatus,
  type Profile,
} from '@/types/ged'
import {
  Bell,
  CheckCircle2,
  FileUp,
  Loader2,
  SearchX,
  Timer,
} from 'lucide-react'

interface Props {
  profile: Profile
}

const SIGNAL_OPTIONS: {
  status: Extract<
    DemandeDocStatus,
    'message_recu' | 'document_inexistant' | 'en_cours'
  >
  label: string
  icon: typeof CheckCircle2
}[] = [
  { status: 'message_recu', label: 'Message reçu', icon: CheckCircle2 },
  {
    status: 'document_inexistant',
    label: 'Document inexistant',
    icon: SearchX,
  },
  { status: 'en_cours', label: 'En cours d’exécution', icon: Timer },
]

/**
 * Boîte du profil : demandes reçues, signaux et livraison de document.
 */
export function ArchivesDemandesInbox({ profile }: Props) {
  const [items, setItems] = useState<DemandeDoc[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [signalNote, setSignalNote] = useState('')
  const [replyNote, setReplyNote] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const knownIds = useRef<Set<string>>(new Set())
  const primed = useRef(false)

  const load = useCallback(async () => {
    try {
      const data =
        await circulationService.listDemandesDocsForProfile(profile)
      if (primed.current) {
        const newcomers = data.filter((d) => !knownIds.current.has(d.id))
        if (newcomers.length > 0) {
          void ringBellThreeTimes()
        }
      }
      knownIds.current = new Set(data.map((d) => d.id))
      primed.current = true
      setItems(data)
      setSelectedId((prev) =>
        prev && data.some((d) => d.id === prev)
          ? prev
          : data[0]?.id ?? '',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [profile])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 15000)
    return () => window.clearInterval(t)
  }, [load])

  const selected = useMemo(
    () => items.find((d) => d.id === selectedId) ?? null,
    [items, selectedId],
  )

  const ouvertes = items.filter((d) => d.status === 'envoyee').length

  async function sendSignal(
    status: Extract<
      DemandeDocStatus,
      'message_recu' | 'document_inexistant' | 'en_cours'
    >,
  ) {
    if (!selected) return
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const updated = await circulationService.signalDemandeDoc({
        id: selected.id,
        status,
        note: signalNote || undefined,
      })
      setItems((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
      setSuccess(`Signal envoyé au demandeur : ${DEMANDE_DOC_STATUS_LABELS[status]}`)
      setSignalNote('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Échec du signal')
    } finally {
      setBusy(false)
    }
  }

  async function sendReply(e: React.FormEvent) {
    e.preventDefault()
    if (!selected || !file) return
    setBusy(true)
    setError(null)
    setSuccess(null)
    try {
      const updated = await circulationService.replyDemandeDoc({
        id: selected.id,
        file,
        note: replyNote || undefined,
      })
      setItems((prev) => prev.map((d) => (d.id === updated.id ? updated : d)))
      setSuccess('Document joint et renvoyé au demandeur.')
      setFile(null)
      setReplyNote('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’envoi')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        Chargement de vos demandes reçues…
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <FormBrandBar title="Demandes reçues" />
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-950">
        <p className="inline-flex items-center gap-2 font-medium">
          <Bell className="h-4 w-4" />
          Boîte privée de {profile.full_name}
          <FieldHint text="Seuls le demandeur, le destinataire et le Superuser peuvent consulter cette demande. Une nouvelle demande déclenche 3 coups de cloche." />
        </p>
        <p className="mt-1 text-xs">
          {ouvertes} demande(s) non signalée(s) · {items.length} au total
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-800">
            Combo des demandes
          </span>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f4c75]/30 focus:ring-2"
          >
            {items.length === 0 && (
              <option value="">Aucune demande</option>
            )}
            {items.map((d) => (
              <option key={d.id} value={d.id}>
                {format.datetime(d.created_at)} —{' '}
                {d.requester_name ?? d.requester_matr ?? 'Émetteur'} —{' '}
                {DEMANDE_DOC_STATUS_LABELS[d.status]}
                {d.reference_souhaitee ? ` · ${d.reference_souhaitee}` : ''}
              </option>
            ))}
          </select>
        </label>

        {!selected ? (
          <p className="mt-4 text-sm text-slate-500">
            Aucune demande à traiter.
          </p>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Émetteur
              </p>
              <p className="mt-1 font-medium text-slate-900">
                {selected.requester_name ?? '—'}
                {selected.requester_matr
                  ? ` (${selected.requester_matr})`
                  : ''}
              </p>
              <p className="mt-3 text-xs font-medium uppercase tracking-wide text-slate-500">
                Message
              </p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                {selected.message}
              </p>
              {selected.reference_souhaitee && (
                <p className="mt-2 text-xs text-teal-800">
                  Référence souhaitée : {selected.reference_souhaitee}
                </p>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Statut actuel :{' '}
                <strong>{DEMANDE_DOC_STATUS_LABELS[selected.status]}</strong>
              </p>
            </div>

            <div className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/50 p-4">
              <p className="text-sm font-medium text-sky-950">
                Signaux vers l’émetteur
                <FieldHint text="Informe le demandeur. Choisissez un signal à côté de la demande sélectionnée." />
              </p>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-sky-900">
                  Observation (optionnel)
                </span>
                <input
                  value={signalNote}
                  onChange={(e) => setSignalNote(e.target.value)}
                  className="w-full rounded-lg border border-sky-200 bg-white px-3 py-2 text-sm outline-none ring-sky-500/30 focus:ring-2"
                  placeholder="Précision pour le demandeur…"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {SIGNAL_OPTIONS.map((opt) => {
                  const Icon = opt.icon
                  return (
                    <button
                      key={opt.status}
                      type="button"
                      disabled={busy}
                      onClick={() => void sendSignal(opt.status)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-white px-3 py-2 text-xs font-medium text-sky-950 hover:bg-sky-100 disabled:opacity-60"
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {opt.label}
                    </button>
                  )
                })}
              </div>
            </div>

            <form
              onSubmit={(e) => void sendReply(e)}
              className="space-y-3 rounded-lg border border-emerald-200 bg-emerald-50/40 p-4"
            >
              <p className="text-sm font-medium text-emerald-950">
                Joindre le document et renvoyer au demandeur
              </p>
              <div className="flex items-center gap-3 rounded-lg border border-dashed border-emerald-300 bg-white px-3 py-3">
                <FileUp className="h-4 w-4 text-emerald-700" />
                <input
                  required
                  type="file"
                  accept={ACCEPTED_DOCUMENT_ACCEPT}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-emerald-700 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
                />
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-emerald-900">
                  Note de livraison (optionnel)
                </span>
                <textarea
                  rows={2}
                  value={replyNote}
                  onChange={(e) => setReplyNote(e.target.value)}
                  className="w-full rounded-lg border border-emerald-200 bg-white px-3 py-2 text-sm outline-none ring-emerald-500/30 focus:ring-2"
                />
              </label>
              <button
                type="submit"
                disabled={busy || !file}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <FileUp className="h-4 w-4" />
                )}
                Livrer le document
              </button>
            </form>
          </div>
        )}

        {(error || success) && (
          <p
            className={`mt-4 rounded-lg px-3 py-2 text-sm ${
              error
                ? 'bg-red-50 text-red-700'
                : 'bg-emerald-50 text-emerald-800'
            }`}
          >
            {error ?? success}
          </p>
        )}
      </div>
    </div>
  )
}
