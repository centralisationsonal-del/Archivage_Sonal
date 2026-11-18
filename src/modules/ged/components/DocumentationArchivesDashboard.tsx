import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArchivesGroupedRegister, groupedArchiveOptions } from '@/modules/ged/components/ArchivesGroupedRegister'
import { ArchivesDemandesInbox } from '@/modules/ged/components/ArchivesDemandesInbox'
import { ArchivesPdfReader } from '@/modules/ged/components/ArchivesPdfReader'
import { ArchivesPurgePanel } from '@/modules/ged/components/ArchivesPurgePanel'
import { ArchivesSearchPanel } from '@/modules/ged/components/ArchivesSearchPanel'
import {
  DashboardHeader,
  DashboardKpi,
} from '@/modules/ged/components/DashboardShared'
import { DocumentReport } from '@/modules/ged/components/DocumentReport'
import {
  EntiteFilter,
  useEntiteFilter,
} from '@/modules/ged/components/EntiteFilter'
import {
  TransferProofModal,
  type TransferProofPayload,
} from '@/modules/ged/components/TransferProofModal'
import { ACCEPTED_DOCUMENT_ACCEPT } from '@/lib/documentFiles'
import { format } from '@/lib/format'
import {
  canManageDocsFull,
  canPurgeByAge,
  canSendArchives,
  canUseInvisibleFlag,
  formatDocumentAge,
} from '@/modules/ged/lib/archivePrivileges'
import { circulationService } from '@/services/circulationService'
import type { Archive, Direction, Profile } from '@/types/ged'
import {
  Archive as ArchiveIcon,
  BookOpen,
  FileUp,
  Loader2,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react'

interface Props {
  profile: Profile
}

type Tab =
  | 'vue'
  | 'archiver'
  | 'envoyer'
  | 'rechercher'
  | 'purge'
  | 'demandes'
  | 'registre'
  | 'lecture'
  | 'rapport'

export function DocumentationArchivesDashboard({ profile }: Props) {
  const canSend = canSendArchives(profile)
  const canInvisible = canUseInvisibleFlag(profile)
  const canPurge = canPurgeByAge(profile)
  const docsFull = canManageDocsFull(profile)
  const today = new Date().toISOString().slice(0, 10)

  const loadEntites = useCallback(() => circulationService.listEntites(), [])
  const { entites, entite, setEntite } = useEntiteFilter(loadEntites)

  const [tab, setTab] = useState<Tab>('vue')
  const [archives, setArchives] = useState<Archive[]>([])
  const [directions, setDirections] = useState<Direction[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const [concerne, setConcerne] = useState('')
  const [reference, setReference] = useState('')
  const [numFolio, setNumFolio] = useState('')
  const [emetteur, setEmetteur] = useState('')
  const [recepteur, setRecepteur] = useState('')
  const [emplacement, setEmplacement] = useState('')
  const [invisibleTous, setInvisibleTous] = useState(false)
  const [file, setFile] = useState<File | null>(null)

  const [archiveId, setArchiveId] = useState('')
  const [receiverDirectionId, setReceiverDirectionId] = useState('')
  const [note, setNote] = useState('')
  const [attachFile, setAttachFile] = useState<File | null>(null)
  const [proofOpen, setProofOpen] = useState(false)
  const [proof, setProof] = useState<TransferProofPayload | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, d] = await Promise.all([
        circulationService.listMyArchives(profile, 200, {
          entite: entite || undefined,
        }),
        circulationService.listDirections(),
      ])
      setArchives(a)
      setDirections(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [profile, entite])

  useEffect(() => {
    void load()
  }, [load])

  async function handleArchive(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !concerne) return
    if (!entite) {
      setError('Sélectionnez l’entité / instance de provenance.')
      return
    }
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const archived = await circulationService.registerArchive({
        concerne,
        reference: reference || undefined,
        numFolio: numFolio || undefined,
        emetteur: emetteur || undefined,
        recepteur: recepteur || undefined,
        emplacement: emplacement || undefined,
        invisibleTous: canInvisible ? invisibleTous : false,
        ownerScope: 'documentation',
        dateCreation: today,
        entite,
        file,
      })
      setSuccess(
        `Document archivé (n° ${archived.id}) — ${entite} — création ${format.date(today)} — âge : ${formatDocumentAge(today)}.`,
      )
      setConcerne('')
      setReference('')
      setNumFolio('')
      setEmetteur('')
      setRecepteur('')
      setEmplacement('')
      setInvisibleTous(false)
      setFile(null)
      await load()
      setTab('registre')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’archivage')
    } finally {
      setSaving(false)
    }
  }

  async function handleDispatch(e: React.FormEvent) {
    e.preventDefault()
    if (!canSend) {
      setError('Privilège insuffisant pour envoyer des archives.')
      return
    }
    if (!archiveId || !receiverDirectionId) return
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      await circulationService.dispatchArchiveToDirection({
        archiveId: Number(archiveId),
        receiverDirectionId,
        note: note || undefined,
        file: attachFile || undefined,
      })
      const dir = directions.find((d) => d.id === receiverDirectionId)
      const arch = archives.find((a) => a.id === Number(archiveId))
      setProof({
        kind: 'docs_to_sec',
        title: 'Envoi vers secrétariat de direction',
        concerne: arch?.concerne,
        reference: arch?.reference,
        fromLabel: 'Documentation & Archives',
        toLabels: [`Secrétariat ${dir?.libelle ?? ''}`.trim()],
        note: note || undefined,
      })
      setProofOpen(true)
      setSuccess(
        `Document envoyé au secrétariat de la direction ${dir?.libelle ?? ''}.`,
      )
      setArchiveId('')
      setReceiverDirectionId('')
      setNote('')
      setAttachFile(null)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec de l’envoi')
    } finally {
      setSaving(false)
    }
  }

  const withFile = archives.filter((a) => a.file_path).length
  const withFolio = archives.filter((a) => a.num_folio).length
  const archiveGroups = useMemo(
    () => groupedArchiveOptions(archives),
    [archives],
  )

  const tabs: { id: Tab; label: string }[] = [
    { id: 'vue', label: 'Tableau de bord' },
    { id: 'archiver', label: 'Archiver' },
    ...(canSend ? [{ id: 'envoyer' as const, label: 'Envoyer' }] : []),
    { id: 'rechercher', label: 'Rechercher' },
    ...(canPurge ? [{ id: 'purge' as const, label: 'Purge âge' }] : []),
    { id: 'demandes', label: 'Demandes reçues' },
    { id: 'registre', label: 'Registre classé' },
    { id: 'lecture', label: 'Lecture' },
    { id: 'rapport', label: 'Rapport' },
  ]

  const field =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f4c75]/30 focus:ring-2'

  return (
    <div className="space-y-6">
      <DashboardHeader
        eyebrow="Service Documentation & Archives"
        title="Gestion documentaire"
        subtitle={
          docsFull
            ? 'Privilège élevé — Invisible, envoi et purge disponibles'
            : 'Classement et consultation — envoi réservé au privilège > 9'
        }
        action={
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Actualiser
          </button>
        }
      />

      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
        <EntiteFilter
          value={entite}
          options={entites}
          onChange={setEntite}
          required
          label="Entité / instance (filtre listes & archivage)"
          className="max-w-md"
        />
        {!entite && (
          <p className="mt-2 text-xs text-amber-700">
            Sélectionnez une entité pour lister, archiver et éditer uniquement
            les documents de cette instance.
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

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <DashboardKpi
          icon={ArchiveIcon}
          label="Archives"
          value={archives.length}
          hint="Documents enregistrés"
          tone="sky"
        />
        <DashboardKpi
          icon={FileUp}
          label="Avec PDF"
          value={withFile}
          hint="Pièces jointes disponibles"
        />
        <DashboardKpi
          icon={BookOpen}
          label="Folios"
          value={withFolio}
          hint="Numérotés au registre"
        />
        <DashboardKpi
          icon={Send}
          label="Directions"
          value={directions.length}
          hint="Destinations possibles"
          tone="slate"
        />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-px">
        {tabs.map((t) => {
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id)
                setSuccess(null)
                setError(null)
              }}
              className={`border-b-2 px-3 py-2.5 text-sm font-medium transition ${
                active
                  ? 'border-[#0f4c75] text-[#0f4c75]'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'vue' && (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-600">
          <p className="font-medium text-slate-900">Mission du service</p>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>
              Archiver les documents avec date de création, folio et emplacement.
            </li>
            <li>
              Retrouver un dossier par objet, référence, emplacement, dates,
              expéditeur ou destinataire.
            </li>
            {docsFull ? (
              <li>
                Documents « Invisible de tous » et purge par âge (privilège &gt;
                9).
              </li>
            ) : (
              <li>
                Envoi vers d’autres comptes réservé au privilège supérieur à 9.
              </li>
            )}
          </ul>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setTab('archiver')}
              className="rounded-lg bg-[#0f4c75] px-4 py-2 text-sm font-medium text-white hover:bg-[#0c3d5e]"
            >
              Archiver un document
            </button>
            <button
              type="button"
              onClick={() => setTab('rechercher')}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              <Search className="h-4 w-4" />
              Rechercher
            </button>
            {canSend && (
              <button
                type="button"
                onClick={() => setTab('envoyer')}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                Envoyer à une direction
              </button>
            )}
          </div>
        </div>
      )}

      {tab === 'archiver' && (
        <form
          onSubmit={(e) => void handleArchive(e)}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h3 className="font-medium text-slate-900">Enregistrer / archiver</h3>
            <p className="rounded-lg bg-sky-50 px-3 py-1.5 text-xs text-[#0f4c75]">
              Date de création : <strong>{format.date(today)}</strong>
              {' · '}
              Âge : <strong>{formatDocumentAge(today)}</strong>
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <EntiteFilter
              value={entite}
              options={entites}
              onChange={setEntite}
              required
              className="sm:col-span-2"
            />
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Objet / Concerne
              </span>
              <input
                required
                value={concerne}
                onChange={(e) => setConcerne(e.target.value)}
                className={field}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Référence
              </span>
              <input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className={field}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Folio
              </span>
              <input
                value={numFolio}
                onChange={(e) => setNumFolio(e.target.value)}
                className={field}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Émetteur
              </span>
              <input
                value={emetteur}
                onChange={(e) => setEmetteur(e.target.value)}
                placeholder={profile.full_name}
                className={field}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Destinataire / récepteur
              </span>
              <input
                value={recepteur}
                onChange={(e) => setRecepteur(e.target.value)}
                className={field}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Emplacement physique
              </span>
              <input
                value={emplacement}
                onChange={(e) => setEmplacement(e.target.value)}
                className={field}
                placeholder="Ex. Rayon A / Boîte 12"
              />
            </label>
            {canInvisible && (
              <label className="flex items-start gap-2 sm:col-span-2 rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={invisibleTous}
                  onChange={(e) => setInvisibleTous(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-sm text-amber-950">
                  <strong>Invisible de tous</strong> — si coché, le document
                  n’est exploité / vu / lu que par Documentation (privilège &gt;
                  9) et le Superuser.
                </span>
              </label>
            )}
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Pièce jointe (toutes extensions)
              </span>
              <input
                required
                type="file"
                accept={ACCEPTED_DOCUMENT_ACCEPT}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-[#0f4c75] file:px-3 file:py-1.5 file:text-sm file:text-white"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving || !file}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f4c75] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0c3d5e] disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArchiveIcon className="h-4 w-4" />
            )}
            Archiver le document
          </button>
        </form>
      )}

      {tab === 'envoyer' && canSend && (
        <form
          onSubmit={(e) => void handleDispatch(e)}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
        >
          <h3 className="font-medium text-slate-900">
            Envoyer vers une direction
          </h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Document archivé
              </span>
              <select
                required
                value={archiveId}
                onChange={(e) => setArchiveId(e.target.value)}
                className={field}
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
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Direction destinataire
              </span>
              <select
                required
                value={receiverDirectionId}
                onChange={(e) => setReceiverDirectionId(e.target.value)}
                className={field}
              >
                <option value="">Choisir…</option>
                {directions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.libelle}
                  </option>
                ))}
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Note / motif
              </span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={2}
                className={field}
              />
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Nouvelle pièce jointe (optionnel)
              </span>
              <input
                type="file"
                accept={ACCEPTED_DOCUMENT_ACCEPT}
                onChange={(e) => setAttachFile(e.target.files?.[0] ?? null)}
                className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-[#0f4c75] file:px-3 file:py-1.5 file:text-sm file:text-white"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={saving || !archiveId || !receiverDirectionId}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f4c75] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0c3d5e] disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Transmettre à la direction
          </button>
        </form>
      )}

      {tab === 'rechercher' && (
        <ArchivesSearchPanel
          profile={profile}
          scope="docs"
          lockedEntite={entite || undefined}
        />
      )}

      {tab === 'purge' && canPurge && (
        <ArchivesPurgePanel onPurged={() => void load()} />
      )}

      {tab === 'demandes' && <ArchivesDemandesInbox profile={profile} />}

      {tab === 'registre' && (
        <ArchivesGroupedRegister
          archives={archives}
          onSelectForSend={
            canSend
              ? (id) => {
                  setArchiveId(String(id))
                  setTab('envoyer')
                  setSuccess(null)
                  setError(null)
                }
              : undefined
          }
        />
      )}

      {tab === 'lecture' && (
        <ArchivesPdfReader profile={profile} entite={entite || undefined} />
      )}

      {tab === 'rapport' && <DocumentReport profile={profile} />}

      <TransferProofModal
        open={proofOpen}
        payload={proof}
        onClose={() => setProofOpen(false)}
      />
    </div>
  )
}
