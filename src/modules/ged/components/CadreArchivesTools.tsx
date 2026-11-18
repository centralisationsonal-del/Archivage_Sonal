import { useCallback, useEffect, useMemo, useState } from 'react'
import { groupedArchiveOptions } from '@/modules/ged/components/ArchivesGroupedRegister'
import {
  EntiteFilter,
  useEntiteFilter,
} from '@/modules/ged/components/EntiteFilter'
import { ACCEPTED_DOCUMENT_ACCEPT } from '@/lib/documentFiles'
import { ringBellThreeTimes } from '@/lib/bellAlert'
import { format } from '@/lib/format'
import {
  archiveMinAgeDate,
  formatDocumentAge,
  PURGE_MIN_AGE_YEARS,
} from '@/modules/ged/lib/archivePrivileges'
import { circulationService } from '@/services/circulationService'
import type { Archive, Direction, GedAgent, Profile } from '@/types/ged'
import { ROLE_LABELS } from '@/types/ged'
import {
  TransferProofModal,
  type TransferProofPayload,
} from '@/modules/ged/components/TransferProofModal'
import {
  Archive as ArchiveIcon,
  Loader2,
  Search,
  Send,
  Trash2,
} from 'lucide-react'

type Mode = 'archiver' | 'envoyer' | 'nettoyer'

type Props = {
  profile: Profile
  mode: Mode
  /** agent = cadre/directeur ; secretariat = archives de la direction */
  scope?: 'agent' | 'secretariat'
  /** Appelé juste après une mutation réussie pour rafraîchir le tableau de bord */
  onDone?: () => void | Promise<void>
}

export function CadreArchivesTools({
  profile,
  mode,
  scope = 'agent',
  onDone,
}: Props) {
  const loadEntites = useCallback(() => circulationService.listEntites(), [])
  const { entites, entite, setEntite } = useEntiteFilter(loadEntites)
  const today = new Date().toISOString().slice(0, 10)

  const [archives, setArchives] = useState<Archive[]>([])
  const [directions, setDirections] = useState<Direction[]>([])
  const [agents, setAgents] = useState<GedAgent[]>([])
  const [recipients, setRecipients] = useState<Profile[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [concerne, setConcerne] = useState('')
  const [reference, setReference] = useState('')
  const [emplacement, setEmplacement] = useState('')
  const [file, setFile] = useState<File | null>(null)

  const [archiveId, setArchiveId] = useState('')
  const [sendMode, setSendMode] = useState<'agent' | 'secretariat'>('agent')
  const [receiverMatr, setReceiverMatr] = useState('')
  const [receiverProfileId, setReceiverProfileId] = useState('')
  const [receiverDirectionId, setReceiverDirectionId] = useState('')
  const [note, setNote] = useState('')

  const [purgeYears, setPurgeYears] = useState(PURGE_MIN_AGE_YEARS)
  const [purgeRows, setPurgeRows] = useState<Archive[]>([])
  const [purgeSelected, setPurgeSelected] = useState<Set<number>>(new Set())
  const [proofOpen, setProofOpen] = useState(false)
  const [proof, setProof] = useState<TransferProofPayload | null>(null)

  const field =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-teal-600/30 focus:ring-2'

  const load = useCallback(async () => {
    const [a, d, ag, rec] = await Promise.all([
      circulationService.listMyArchives(profile, 300, {
        entite: entite || undefined,
      }),
      circulationService.listDirections(),
      circulationService.listAgents({ entite: entite || undefined }),
      circulationService.listForwardRecipients(),
    ])
    if (scope === 'secretariat') {
      setArchives(
        a.filter(
          (x) =>
            (x.owner_scope === 'secretariat' &&
              x.owner_direction_id === profile.direction_id) ||
            x.agent_archive_id === profile.id,
        ),
      )
    } else {
      setArchives(a.filter((x) => x.agent_archive_id === profile.id))
    }
    setDirections(d)
    setAgents(ag)
    setRecipients(rec.filter((r) => r.id !== profile.id))
  }, [profile, entite, scope])

  useEffect(() => {
    void load().catch((e) =>
      setError(e instanceof Error ? e.message : 'Erreur de chargement'),
    )
  }, [load])

  const archiveGroups = useMemo(
    () => groupedArchiveOptions(archives),
    [archives],
  )

  async function handleArchive(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !concerne.trim()) return
    if (!entite) {
      setError('Sélectionnez l’entité / instance.')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const archived = await circulationService.registerArchive({
        concerne: concerne.trim(),
        reference: reference || undefined,
        emplacement: emplacement || undefined,
        ownerScope: 'agent',
        dateCreation: today,
        entite,
        file,
      })
      setSuccess(
        `Document archivé (n° ${archived.id}) — ${entite} — âge ${formatDocumentAge(today)}.`,
      )
      setConcerne('')
      setReference('')
      setEmplacement('')
      setFile(null)
      await Promise.resolve(onDone?.())
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec archivage')
    } finally {
      setSaving(false)
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!archiveId) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await circulationService.sendArchiveToRecipient({
        archiveId: Number(archiveId),
        mode: sendMode,
        receiverMatr: sendMode === 'agent' ? receiverMatr || undefined : undefined,
        receiverProfileId:
          sendMode === 'agent' ? receiverProfileId || undefined : undefined,
        receiverDirectionId:
          sendMode === 'secretariat' ? receiverDirectionId : undefined,
        note: note || undefined,
      })
      const arch = archives.find((a) => a.id === Number(archiveId))
      let toLabel = 'Destinataire'
      if (sendMode === 'secretariat') {
        toLabel = `Secrétariat ${
          directions.find((d) => d.id === receiverDirectionId)?.libelle ?? ''
        }`.trim()
      } else {
        toLabel =
          recipients.find((r) => r.id === receiverProfileId)?.full_name ||
          agents.find((a) => a.matr === receiverMatr)?.full_name ||
          'Cadre / Directeur'
      }
      setProof({
        kind: sendMode === 'secretariat' ? 'agent_to_sec' : 'agent_to_agent',
        title: 'Expédition depuis la boîte documentaire',
        concerne: arch?.concerne,
        reference: arch?.reference,
        fromLabel: profile.full_name,
        toLabels: [toLabel],
        note: note || undefined,
      })
      setProofOpen(true)
      void ringBellThreeTimes()
      setSuccess(
        'Document expédié — notification sonore émise. Le destinataire le verra dans sa boîte.',
      )
      setArchiveId('')
      setReceiverMatr('')
      setReceiverProfileId('')
      setReceiverDirectionId('')
      setNote('')
      await Promise.resolve(onDone?.())
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec envoi')
    } finally {
      setSaving(false)
    }
  }

  async function listPurge() {
    const years = Math.max(
      PURGE_MIN_AGE_YEARS,
      Number(purgeYears) || PURGE_MIN_AGE_YEARS,
    )
    if (years !== purgeYears) setPurgeYears(years)
    setSaving(true)
    setError(null)
    try {
      const cutoff = archiveMinAgeDate(years)
      const rows = archives.filter((a) => {
        const d = (a.date_creation || a.date_doc || '').slice(0, 10)
        return d && d <= cutoff
      })
      setPurgeRows(rows)
      setPurgeSelected(new Set())
    } finally {
      setSaving(false)
    }
  }

  async function confirmPurge() {
    const years = Math.max(
      PURGE_MIN_AGE_YEARS,
      Number(purgeYears) || PURGE_MIN_AGE_YEARS,
    )
    const ids = [...purgeSelected]
    if (ids.length === 0) return
    const ok = window.confirm(
      scope === 'secretariat'
        ? `Supprimer définitivement ${ids.length} document(s) du secrétariat (âge ≥ ${years} an(s)) ?`
        : `Supprimer définitivement ${ids.length} document(s) de votre boîte (âge ≥ ${years} an(s)) ?`,
    )
    if (!ok) return
    setSaving(true)
    setError(null)
    try {
      const res =
        scope === 'secretariat'
          ? await circulationService.purgeSecretariatArchives(ids)
          : await circulationService.purgeOwnArchives(ids)
      setSuccess(`${res.deleted} document(s) supprimé(s) de votre boîte.`)
      setPurgeSelected(new Set())
      await Promise.resolve(onDone?.())
      await load()
      await listPurge()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec purge')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <EntiteFilter
          value={entite}
          options={entites}
          onChange={setEntite}
          required={mode === 'archiver'}
          label="Entité / instance"
          className="max-w-md"
        />
      </div>

      {(error || success) && (
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

      {mode === 'archiver' && (
        <form
          onSubmit={(e) => void handleArchive(e)}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
        >
          <h3 className="inline-flex items-center gap-2 font-medium text-slate-900">
            <ArchiveIcon className="h-4 w-4 text-teal-800" />
            Archiver un document
          </h3>
          <p className="text-sm text-slate-500">
            Création : <strong>{format.date(today)}</strong> · Âge :{' '}
            <strong>{formatDocumentAge(today)}</strong>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Objet / concerne
              </span>
              <input
                required
                className={field}
                value={concerne}
                onChange={(e) => setConcerne(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Référence
              </span>
              <input
                className={field}
                value={reference}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Emplacement
              </span>
              <input
                className={field}
                value={emplacement}
                onChange={(e) => setEmplacement(e.target.value)}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Fichier
              </span>
              <input
                required
                type="file"
                accept={ACCEPTED_DOCUMENT_ACCEPT}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-sm"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving || !file || !entite}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArchiveIcon className="h-4 w-4" />
            )}
            Archiver
          </button>
        </form>
      )}

      {mode === 'envoyer' && (
        <form
          onSubmit={(e) => void handleSend(e)}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
        >
          <h3 className="inline-flex items-center gap-2 font-medium text-slate-900">
            <Send className="h-4 w-4 text-teal-800" />
            Envoyer un document archivé
          </h3>
          <p className="text-sm text-slate-500">
            Destinataire : cadre, directeur, chef de service ou secrétariat.
            Une notification sonore confirme l’expédition.
          </p>
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Document
            </span>
            <select
              required
              className={field}
              value={archiveId}
              onChange={(e) => setArchiveId(e.target.value)}
            >
              <option value="">Choisir…</option>
              {archiveGroups.map((g) => (
                <optgroup key={g.label} label={`Année ${g.label}`}>
                  {g.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-3 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={sendMode === 'agent'}
                onChange={() => setSendMode('agent')}
              />
              Cadre / directeur / chef
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={sendMode === 'secretariat'}
                onChange={() => setSendMode('secretariat')}
              />
              Secrétariat (direction)
            </label>
          </div>
          {sendMode === 'agent' ? (
            <>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                  Profil applicatif
                </span>
                <select
                  className={field}
                  value={receiverProfileId}
                  onChange={(e) => {
                    setReceiverProfileId(e.target.value)
                    const p = recipients.find((r) => r.id === e.target.value)
                    if (p?.matr) setReceiverMatr(p.matr)
                  }}
                >
                  <option value="">Choisir…</option>
                  {recipients
                    .filter((r) => r.role !== 'secretariat')
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.full_name} — {ROLE_LABELS[r.role]}
                        {r.direction?.libelle
                          ? ` (${r.direction.libelle})`
                          : ''}
                      </option>
                    ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                  Ou agent RH (matricule)
                </span>
                <select
                  className={field}
                  value={receiverMatr}
                  onChange={(e) => setReceiverMatr(e.target.value)}
                >
                  <option value="">Choisir…</option>
                  {agents.map((a) => (
                    <option key={a.matr} value={a.matr}>
                      {a.full_name} — {a.fonction ?? a.matr}
                      {a.entite ? ` · ${a.entite}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Direction (secrétariat)
              </span>
              <select
                required
                className={field}
                value={receiverDirectionId}
                onChange={(e) => setReceiverDirectionId(e.target.value)}
              >
                <option value="">Choisir…</option>
                {directions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.libelle}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
              Note
            </span>
            <textarea
              className={field}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>
          <button
            type="submit"
            disabled={
              saving ||
              !archiveId ||
              (sendMode === 'agent'
                ? !receiverMatr && !receiverProfileId
                : !receiverDirectionId)
            }
            className="inline-flex items-center gap-2 rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            Expédier
          </button>
        </form>
      )}

      {mode === 'nettoyer' && (
        <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
          <h3 className="font-medium text-slate-900">
            Nettoyer la boîte — purge par âge
          </h3>
          <p className="text-sm text-slate-500">
            {scope === 'secretariat'
              ? 'Documents archivés du secrétariat de votre direction'
              : 'Uniquement vos documents archivés'}{' '}
            ayant atteint l’âge minimum de {PURGE_MIN_AGE_YEARS} ans (entité :{' '}
            {entite || 'toutes'}). Listez, cochez, puis supprimez physiquement.
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Âge minimum (années)
              </span>
              <input
                type="number"
                min={PURGE_MIN_AGE_YEARS}
                max={50}
                value={purgeYears}
                onChange={(e) =>
                  setPurgeYears(
                    Math.max(
                      PURGE_MIN_AGE_YEARS,
                      Number(e.target.value) || PURGE_MIN_AGE_YEARS,
                    ),
                  )
                }
                className={`${field} w-28`}
              />
            </label>
            <button
              type="button"
              onClick={() => void listPurge()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"
            >
              <Search className="h-4 w-4" />
              Lister
            </button>
            <button
              type="button"
              onClick={() => void confirmPurge()}
              disabled={saving || purgeSelected.size === 0}
              className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-800 disabled:opacity-60"
            >
              <Trash2 className="h-4 w-4" />
              Supprimer ({purgeSelected.size})
            </button>
          </div>
          {purgeRows.length === 0 && (
            <p className="text-sm text-slate-500">
              Cliquez sur « Lister » pour afficher les documents éligibles.
            </p>
          )}
          {purgeRows.length > 0 && (
            <div className="overflow-x-auto rounded-lg border border-slate-100">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2" />
                    <th className="px-3 py-2">Réf.</th>
                    <th className="px-3 py-2">Objet</th>
                    <th className="px-3 py-2">Entité</th>
                    <th className="px-3 py-2">Création</th>
                    <th className="px-3 py-2">Âge</th>
                  </tr>
                </thead>
                <tbody>
                  {purgeRows.map((a) => {
                    const creation = a.date_creation || a.date_doc
                    const checked = purgeSelected.has(a.id)
                    return (
                      <tr key={a.id} className="border-t border-slate-100">
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              setPurgeSelected((prev) => {
                                const next = new Set(prev)
                                if (e.target.checked) next.add(a.id)
                                else next.delete(a.id)
                                return next
                              })
                            }}
                          />
                        </td>
                        <td className="px-3 py-2">{a.reference || '—'}</td>
                        <td className="px-3 py-2">{a.concerne}</td>
                        <td className="px-3 py-2">{a.entite || '—'}</td>
                        <td className="px-3 py-2">{format.date(creation)}</td>
                        <td className="px-3 py-2">
                          {formatDocumentAge(creation)}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <TransferProofModal
        open={proofOpen}
        payload={proof}
        onClose={() => setProofOpen(false)}
      />
    </div>
  )
}
