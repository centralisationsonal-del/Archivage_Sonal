import { useCallback, useEffect, useRef, useState } from 'react'
import { circulationService } from '@/services/circulationService'
import {
  SECRETARIAT_CODE_LABELS,
  type MessagerieSec,
  type Profile,
  type SecretariatCode,
} from '@/types/ged'
import { Loader2, Mail, Send } from 'lucide-react'

type Props = {
  profile: Profile
}

function deskLabel(code: string | null | undefined) {
  if (!code) return '—'
  return (
    SECRETARIAT_CODE_LABELS[code as SecretariatCode] ?? code
  )
}

export function SecretariatMessageriePanel({ profile }: Props) {
  const [peers, setPeers] = useState<Profile[]>([])
  const [messages, setMessages] = useState<MessagerieSec[]>([])
  const [toId, setToId] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [circulationId, setCirculationId] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const field =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-teal-600/30 focus:ring-2'

  const profileRef = useRef(profile)
  profileRef.current = profile
  const profileKey = `${profile.id}|${profile.secretariat_code ?? ''}`

  const hasLoadedRef = useRef(false)

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    if (!hasLoadedRef.current && !opts?.soft) setLoading(true)
    setError(null)
    try {
      const active = profileRef.current
      const [p, m] = await Promise.all([
        circulationService.listSecretariatPeers(active),
        circulationService.listMessagerieSec(active),
      ])
      setPeers(p)
      setMessages(m)
      hasLoadedRef.current = true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [profileKey])

  useEffect(() => {
    hasLoadedRef.current = false
    void load()
  }, [load])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!toId || !body.trim()) return
    setSending(true)
    setError(null)
    setSuccess(null)
    try {
      const peer = peers.find((p) => p.id === toId)
      await circulationService.sendMessagerieSec({
        toProfileId: toId,
        toDesk: peer?.secretariat_code,
        subject,
        message: body,
        circulationId: circulationId.trim() || null,
      })
      setSuccess('Message envoyé au bureau destinataire.')
      setSubject('')
      setBody('')
      setCirculationId('')
      setToId('')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec d’envoi')
    } finally {
      setSending(false)
    }
  }

  async function accept(id: string) {
    setSending(true)
    setError(null)
    try {
      await circulationService.acceptMessagerieSec(id)
      setSuccess('Demande acceptée — courrier transféré à votre bureau si lié.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec')
    } finally {
      setSending(false)
    }
  }

  async function refuse(id: string) {
    setSending(true)
    setError(null)
    try {
      await circulationService.refuseMessagerieSec(id, 'Refusé')
      setSuccess('Demande refusée.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec')
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-teal-700" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h3 className="flex items-center gap-2 text-sm font-medium text-slate-900">
          <Mail className="h-4 w-4 text-teal-700" />
          Messagerie inter-secrétariats
        </h3>
        <p className="mt-1 text-sm text-slate-600">
          Votre bureau{' '}
          <strong>{deskLabel(profile.secretariat_code)}</strong> est isolé :
          demandez un courrier à un autre profil Sec_* ou expédiez un message.
        </p>

        {(error || success) && (
          <div
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              success
                ? 'bg-emerald-50 text-emerald-800'
                : 'bg-red-50 text-red-700'
            }`}
          >
            {success ?? error}
          </div>
        )}

        <form onSubmit={(e) => void handleSend(e)} className="mt-4 space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Destinataire (autre Sec_*)
            </span>
            <select
              required
              className={field}
              value={toId}
              onChange={(e) => setToId(e.target.value)}
            >
              <option value="">Choisir…</option>
              {peers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                  {p.secretariat_code
                    ? ` — ${deskLabel(p.secretariat_code)}`
                    : ''}
                  {p.matr ? ` (${p.matr})` : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Objet
            </span>
            <input
              className={field}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Demande de courrier / transmission…"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Id circulation (optionnel, pour transfert de bureau)
            </span>
            <input
              className={field}
              value={circulationId}
              onChange={(e) => setCirculationId(e.target.value)}
              placeholder="UUID du courrier à transférer"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Message *
            </span>
            <textarea
              required
              rows={3}
              className={field}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={sending}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-60"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Envoyer
          </button>
        </form>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
          Boîte de messages
        </div>
        {messages.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">
            Aucun message pour l’instant.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {messages.map((m) => {
              const incoming = m.to_profile_id === profile.id
              return (
                <li key={m.id} className="space-y-2 px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-medium text-slate-800">
                      {incoming ? '← Reçu de ' : '→ Envoyé à '}
                      {incoming
                        ? m.from_profile?.full_name
                        : m.to_profile?.full_name}
                      <span className="ml-2 text-xs font-normal text-slate-500">
                        {m.status}
                      </span>
                    </p>
                    <span className="text-xs text-slate-500">
                      {new Date(m.created_at).toLocaleString('fr-FR')}
                    </span>
                  </div>
                  {m.subject && (
                    <p className="text-slate-700">{m.subject}</p>
                  )}
                  <p className="text-slate-600">{m.message}</p>
                  {incoming && m.status === 'envoyee' && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => void accept(m.id)}
                        className="rounded-lg bg-teal-800 px-3 py-1.5 text-xs font-medium text-white"
                      >
                        Accepter / transférer
                      </button>
                      <button
                        type="button"
                        disabled={sending}
                        onClick={() => void refuse(m.id)}
                        className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700"
                      >
                        Refuser
                      </button>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
