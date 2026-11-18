import { useCallback, useEffect, useRef, useState } from 'react'
import { ringBellThreeTimes } from '@/lib/bellAlert'
import { FieldHint } from '@/modules/ged/components/FieldHint'
import { FormBrandBar } from '@/modules/ged/components/DashboardShared'
import { format } from '@/lib/format'
import { circulationService } from '@/services/circulationService'
import {
  DEMANDE_DOC_STATUS_LABELS,
  ROLE_LABELS,
  type DemandeDoc,
  type Profile,
} from '@/types/ged'
import { Bell, FileUp, Loader2, Send } from 'lucide-react'

interface Props {
  profile: Profile
}

/**
 * Demande documentaire adressée à un profil, avec suivi privé des réponses.
 */
export function DemandeDocRequesterPanel({ profile }: Props) {
  const [items, setItems] = useState<DemandeDoc[]>([])
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [recipientId, setRecipientId] = useState('')
  const [message, setMessage] = useState('')
  const [reference, setReference] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const knownUpdated = useRef<Map<string, string>>(new Map())
  const primed = useRef(false)

  const load = useCallback(async () => {
    try {
      const data = await circulationService.listMyDemandesDocs()
      if (primed.current) {
        for (const d of data) {
          const prev = knownUpdated.current.get(d.id)
          if (prev && prev !== d.updated_at) {
            void ringBellThreeTimes()
            break
          }
          if (!prev && d.status !== 'envoyee') {
            void ringBellThreeTimes()
            break
          }
        }
      }
      const map = new Map<string, string>()
      for (const d of data) map.set(d.id, d.updated_at)
      knownUpdated.current = map
      primed.current = true
      setItems(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = window.setInterval(() => void load(), 20000)
    return () => window.clearInterval(t)
  }, [load])

  useEffect(() => {
    let active = true
    void circulationService
      .listProfiles()
      .then((data) => {
        if (!active) return
        setProfiles(data)
        const recipients = data.filter((p) => p.id !== profile.id)
        const preferred =
          recipients.find((p) => p.role === 'documentation_archives') ??
          recipients[0]
        setRecipientId((current) => current || preferred?.id || '')
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Impossible de charger les profils',
          )
        }
      })
    return () => {
      active = false
    }
  }, [profile.id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!message.trim() || !recipientId) return
    setSending(true)
    setError(null)
    setSuccess(null)
    try {
      await circulationService.createDemandeDoc({
        recipientId,
        message,
        reference: reference || undefined,
      })
      setMessage('')
      setReference('')
      setSuccess(
        `Demande envoyée à ${profiles.find((p) => p.id === recipientId)?.full_name ?? 'votre destinataire'} (message privé).`,
      )
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’envoi')
    } finally {
      setSending(false)
    }
  }

  async function openReply(d: DemandeDoc) {
    if (!d.reply_file_path) return
    const url = await circulationService.getFileUrl(d.reply_file_path)
    if (url) window.open(url, '_blank', 'noopener,noreferrer')
  }

  return (
    <div className="space-y-5">
      <FormBrandBar title="Demande documentaire" />
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="text-sm font-medium text-slate-900">
          Demander un document à un profil
          <FieldHint text="La demande est privée : seul le destinataire choisi peut la consulter et répondre avec un document." />
        </h3>
        <p className="mt-1 text-xs text-slate-500">
          Choisissez le profil concerné. Il pourra joindre le document et vous
          le renvoyer directement.
        </p>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="mt-4 space-y-3"
        >
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Destinataire
            </span>
            <select
              required
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-teal-600/30 focus:ring-2"
            >
              <option value="" disabled>
                Choisir un profil
              </option>
              {profiles
                .filter((p) => p.id !== profile.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} · {ROLE_LABELS[p.role]}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Message (privé)
            </span>
            <textarea
              required
              rows={4}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none ring-teal-600/30 focus:ring-2"
              placeholder="Ex. Merci de me transmettre la note de service n°… / dossier classé à…"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Référence souhaitée (optionnel)
            </span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none ring-teal-600/30 focus:ring-2"
              placeholder="Ex. SONAL/DA/2026/045"
            />
          </label>
          <button
            type="submit"
            disabled={sending || !recipientId || profiles.length < 2}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Envoyer la demande
          </button>
        </form>

        {(error || success) && (
          <p
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              error
                ? 'bg-red-50 text-red-700'
                : 'bg-emerald-50 text-emerald-800'
            }`}
          >
            {error ?? success}
          </p>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
          <Bell className="h-4 w-4 text-teal-700" />
          Mes demandes ({items.length})
          <span className="text-xs font-normal text-slate-500">
            — alerte sonore (3 coups) à chaque mise à jour Archives
          </span>
        </div>
        {loading ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            Chargement…
          </p>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            Aucune demande pour le moment.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {items.map((d) => (
              <li key={d.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                    {DEMANDE_DOC_STATUS_LABELS[d.status]}
                  </span>
                  <span className="text-xs text-slate-500">
                    {format.datetime(d.created_at)}
                  </span>
                  {d.reference_souhaitee && (
                    <span className="text-xs text-teal-800">
                      Réf. {d.reference_souhaitee}
                    </span>
                  )}
                  <span className="text-xs text-slate-500">
                    À {profiles.find((p) => p.id === d.recipient_id)?.full_name ?? 'un profil'}
                  </span>
                </div>
                <p className="mt-1 text-sm text-slate-800">{d.message}</p>
                {d.signal_note && (
                  <p className="mt-1 text-xs text-amber-800">
                    Signal Archives : {d.signal_note}
                  </p>
                )}
                {d.status === 'livree' && d.reply_file_path && (
                  <button
                    type="button"
                    onClick={() => void openReply(d)}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-xs font-medium text-teal-900 hover:bg-teal-100"
                  >
                    <FileUp className="h-3.5 w-3.5" />
                    Ouvrir le document reçu
                    {d.reply_file_name ? ` (${d.reply_file_name})` : ''}
                  </button>
                )}
                {d.reply_note && (
                  <p className="mt-1 text-xs text-slate-600">
                    Note Archives : {d.reply_note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="sr-only">{profile.full_name}</p>
    </div>
  )
}
