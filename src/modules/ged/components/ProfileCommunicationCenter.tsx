import { useCallback, useEffect, useMemo, useState } from 'react'
import { ACCEPTED_DOCUMENT_ACCEPT } from '@/lib/documentFiles'
import { format } from '@/lib/format'
import { ArchivesDemandesInbox } from '@/modules/ged/components/ArchivesDemandesInbox'
import { DemandeDocRequesterPanel } from '@/modules/ged/components/DemandeDocRequesterPanel'
import { circulationService } from '@/services/circulationService'
import {
  ROLE_LABELS,
  type Archive,
  type GedMessage,
  type Profile,
} from '@/types/ged'
import {
  FileUp,
  Loader2,
  MessageSquareText,
  RefreshCw,
  Send,
  Users,
} from 'lucide-react'

interface Props {
  profile: Profile
  onClose: () => void
}

export function ProfileCommunicationCenter({ profile, onClose }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [archives, setArchives] = useState<Archive[]>([])
  const [messages, setMessages] = useState<GedMessage[]>([])
  const [recipientId, setRecipientId] = useState(
    profile.role === 'dir_administrative' ? 'ALL' : '',
  )
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [archiveId, setArchiveId] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const isSuperuser = profile.role === 'dir_administrative'
  const canSendArchives = profile.role === 'documentation_archives'

  const load = useCallback(async () => {
    setError(null)
    try {
      const [profileRows, messageRows, archiveRows] = await Promise.all([
        circulationService.listProfiles(),
        circulationService.listGedMessages(),
        canSendArchives
          ? circulationService.listMyArchives(profile, 200)
          : Promise.resolve([] as Archive[]),
      ])
      setProfiles(profileRows)
      setMessages(messageRows)
      setArchives(archiveRows.filter((item) => item.file_path))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la messagerie')
    } finally {
      setLoading(false)
    }
  }, [canSendArchives, profile])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => void load(), 20000)
    return () => window.clearInterval(timer)
  }, [load])

  const profileById = useMemo(
    () => new Map(profiles.map((item) => [item.id, item])),
    [profiles],
  )

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault()
    setSending(true)
    setError(null)
    setSuccess(null)
    try {
      await circulationService.sendGedMessage({
        recipientId: recipientId === 'ALL' ? null : recipientId,
        subject,
        message,
        file,
        archiveId: archiveId ? Number(archiveId) : undefined,
      })
      setSubject('')
      setMessage('')
      setFile(null)
      setArchiveId('')
      setSuccess(
        recipientId === 'ALL'
          ? 'Message diffusé à tous les profils.'
          : 'Message envoyé au profil sélectionné.',
      )
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’envoi du message')
    } finally {
      setSending(false)
    }
  }

  async function openAttachment(item: GedMessage) {
    if (!item.attachment_path) return
    try {
      const url = await circulationService.getFileUrl(item.attachment_path)
      if (!url) throw new Error('Impossible de créer le lien sécurisé du document.')
      window.open(url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible d’ouvrir le document')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#e3b600]">
            SONAL · Communication privée
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-[#1a364d]">
            Messages et demandes de documents
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Les échanges individuels sont visibles uniquement par leurs participants.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-[#d7e0e8] bg-white px-3 py-2 text-sm text-[#1a364d] hover:bg-[#eef6fb]"
        >
          Retour au tableau de bord
        </button>
      </div>

      <section className="rounded-xl border border-[#d7e0e8] bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-4 flex items-center gap-2">
          <span className="rounded-lg bg-[#fffbeb] p-2 text-[#9a7600]">
            <MessageSquareText className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-semibold text-[#1a364d]">Messagerie</h2>
            <p className="text-xs text-slate-500">
              {isSuperuser
                ? 'Le Superuser peut écrire à un profil ou diffuser à tous.'
                : 'Choisissez un profil pour lui envoyer un message privé.'}
            </p>
          </div>
        </div>

        <form onSubmit={(e) => void sendMessage(e)} className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Destinataire
            </span>
            <select
              required
              value={recipientId}
              onChange={(e) => setRecipientId(e.target.value)}
              className="w-full rounded-lg border border-[#d7e0e8] bg-white px-3 py-2.5 text-sm text-[#1a2b3a] outline-none focus:ring-2 focus:ring-[#2f78a8]/30"
            >
              <option value="" disabled>
                Choisir un profil
              </option>
              {isSuperuser && (
                <option value="ALL">Tous les profils — diffusion générale</option>
              )}
              {profiles
                .filter((item) => item.id !== profile.id)
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.full_name} · {ROLE_LABELS[item.role]}
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Objet (facultatif)
            </span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-lg border border-[#d7e0e8] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#2f78a8]/30"
              maxLength={160}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Message
            </span>
            <textarea
              required
              rows={3}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full rounded-lg border border-[#d7e0e8] px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-[#2f78a8]/30"
            />
          </label>
          {canSendArchives && (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                  Joindre un fichier
                </span>
                <input
                  type="file"
                  accept={ACCEPTED_DOCUMENT_ACCEPT}
                  disabled={Boolean(archiveId)}
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded-lg border border-[#d7e0e8] bg-white px-3 py-2 text-sm disabled:opacity-50"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                  Ou choisir une archive existante
                </span>
                <select
                  value={archiveId}
                  disabled={Boolean(file)}
                  onChange={(e) => setArchiveId(e.target.value)}
                  className="w-full rounded-lg border border-[#d7e0e8] bg-white px-3 py-2.5 text-sm disabled:opacity-50"
                >
                  <option value="">Aucune archive</option>
                  {archives.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.concerne} · {item.reference || `Archive ${item.id}`}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <button
            type="submit"
            disabled={sending || !recipientId || (recipientId === 'ALL' && !isSuperuser)}
            className="inline-flex items-center gap-2 rounded-md bg-[#255f8a] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#1f4c6f] disabled:opacity-60"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Envoyer le message
          </button>
        </form>

        {(error || success) && (
          <p
            role={error ? 'alert' : 'status'}
            className={`mt-3 rounded-lg px-3 py-2 text-sm ${
              error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'
            }`}
          >
            {error ?? success}
          </p>
        )}

        <div className="mt-5 overflow-hidden rounded-lg border border-[#d7e0e8]">
          <div className="flex items-center justify-between gap-2 border-b border-[#d7e0e8] bg-[#eef6fb] px-3 py-2.5">
            <p className="inline-flex items-center gap-2 text-sm font-semibold text-[#1a364d]">
              <Users className="h-4 w-4" />
              Boîte de réception et messages envoyés
            </p>
            <button
              type="button"
              onClick={() => void load()}
              aria-label="Actualiser les messages"
              className="rounded p-1 text-[#255f8a] hover:bg-white"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
          {loading ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              Chargement des messages…
            </p>
          ) : messages.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">
              Aucun message pour le moment.
            </p>
          ) : (
            <ul className="divide-y divide-[#e7edf1]">
              {messages.map((item) => {
                const sender = profileById.get(item.sender_id)
                const recipient = item.recipient_id
                  ? profileById.get(item.recipient_id)
                  : null
                return (
                  <li key={item.id} className="space-y-2 px-4 py-3">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>
                        De <strong className="text-[#1a364d]">{sender?.full_name ?? 'Profil'}</strong>
                      </span>
                      <span>
                        À <strong className="text-[#1a364d]">{recipient?.full_name ?? 'Tous les profils'}</strong>
                      </span>
                      <span>{format.datetime(item.created_at)}</span>
                    </div>
                    {item.subject && (
                      <p className="text-sm font-semibold text-[#1a364d]">{item.subject}</p>
                    )}
                    <p className="whitespace-pre-wrap text-sm text-slate-700">{item.message}</p>
                    <div className="flex flex-wrap gap-2">
                      {item.attachment_path && (
                        <button
                          type="button"
                          onClick={() => void openAttachment(item)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-[#d7e0e8] px-2.5 py-1.5 text-xs font-medium text-[#255f8a] hover:bg-[#eef6fb]"
                        >
                          <FileUp className="h-3.5 w-3.5" />
                          Ouvrir {item.attachment_name ?? 'le document'}
                        </button>
                      )}
                      {sender && sender.id !== profile.id && (
                        <button
                          type="button"
                          onClick={() => setRecipientId(sender.id)}
                          className="rounded-md border border-[#d7e0e8] px-2.5 py-1.5 text-xs font-medium text-[#1a364d] hover:bg-[#eef6fb]"
                        >
                          Répondre à {sender.full_name}
                        </button>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <section className="min-w-0 rounded-xl border border-[#d7e0e8] bg-white p-4 shadow-sm sm:p-5">
          <DemandeDocRequesterPanel profile={profile} />
        </section>
        <section className="min-w-0 rounded-xl border border-[#d7e0e8] bg-white p-4 shadow-sm sm:p-5">
          <ArchivesDemandesInbox profile={profile} />
        </section>
      </div>
    </div>
  )
}
