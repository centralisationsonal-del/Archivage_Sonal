import { useCallback, useEffect, useState } from 'react'
import {
  DashboardHeader,
  DashboardKpi,
} from '@/modules/ged/components/DashboardShared'
import { DocumentPdfReader } from '@/modules/ged/components/DocumentPdfReader'
import { DocumentReport } from '@/modules/ged/components/DocumentReport'
import { circulationService } from '@/services/circulationService'
import { format } from '@/lib/format'
import type { Archive, Direction, Profile } from '@/types/ged'
import {
  Archive as ArchiveIcon,
  BookOpen,
  FileUp,
  Loader2,
  RefreshCw,
  Send,
} from 'lucide-react'

interface Props {
  profile: Profile
}

type Tab = 'vue' | 'archiver' | 'envoyer' | 'registre' | 'lecture' | 'rapport'

export function DocumentationArchivesDashboard({ profile }: Props) {
  const [tab, setTab] = useState<Tab>('vue')
  const [archives, setArchives] = useState<Archive[]>([])
  const [directions, setDirections] = useState<Direction[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // Archiver form
  const [concerne, setConcerne] = useState('')
  const [reference, setReference] = useState('')
  const [numFolio, setNumFolio] = useState('')
  const [emetteur, setEmetteur] = useState('')
  const [recepteur, setRecepteur] = useState('')
  const [emplacement, setEmplacement] = useState('')
  const [file, setFile] = useState<File | null>(null)

  // Envoyer form
  const [archiveId, setArchiveId] = useState('')
  const [receiverDirectionId, setReceiverDirectionId] = useState('')
  const [note, setNote] = useState('')
  const [attachFile, setAttachFile] = useState<File | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [a, d] = await Promise.all([
        circulationService.listAllArchives(),
        circulationService.listDirections(),
      ])
      setArchives(a)
      setDirections(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handleArchive(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !concerne) return
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
        file,
      })
      setSuccess(`Document archivé (n° ${archived.id}).`)
      setConcerne('')
      setReference('')
      setNumFolio('')
      setEmetteur('')
      setRecepteur('')
      setEmplacement('')
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

  const tabs: { id: Tab; label: string }[] = [
    { id: 'vue', label: 'Tableau de bord' },
    { id: 'archiver', label: 'Archiver' },
    { id: 'envoyer', label: 'Envoyer' },
    { id: 'registre', label: 'Registre' },
    { id: 'lecture', label: 'Lecture PDF' },
    { id: 'rapport', label: 'Rapport' },
  ]

  const field =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-[#0f4c75]/30 focus:ring-2'

  return (
    <div className="space-y-6">
      <DashboardHeader
        eyebrow="Service Documentation & Archives"
        title="Gestion documentaire"
        subtitle="Enregistrer, archiver et transmettre les documents aux directions"
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
            <li>Enregistrer et archiver les documents (avec pièce jointe PDF).</li>
            <li>
              Les transmettre aux secrétariats des directions selon les demandes.
            </li>
            <li>Tenir le registre et permettre la lecture des PDF.</li>
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
              onClick={() => setTab('envoyer')}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              Envoyer à une direction
            </button>
          </div>
        </div>
      )}

      {tab === 'archiver' && (
        <form
          onSubmit={(e) => void handleArchive(e)}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
        >
          <h3 className="font-medium text-slate-900">Enregistrer / archiver</h3>
          <div className="grid gap-3 sm:grid-cols-2">
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
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-xs font-medium uppercase text-slate-500">
                Pièce jointe PDF
              </span>
              <input
                required
                type="file"
                accept="application/pdf"
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
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArchiveIcon className="h-4 w-4" />}
            Archiver le document
          </button>
        </form>
      )}

      {tab === 'envoyer' && (
        <form
          onSubmit={(e) => void handleDispatch(e)}
          className="space-y-4 rounded-xl border border-slate-200 bg-white p-6"
        >
          <h3 className="font-medium text-slate-900">
            Envoyer vers une direction
          </h3>
          <p className="text-sm text-slate-500">
            Le courrier arrive chez le secrétariat de la direction choisie, avec
            la pièce jointe du document archivé (ou une nouvelle PJ).
          </p>
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
                {archives.map((a) => (
                  <option key={a.id} value={a.id}>
                    #{a.id} — {a.concerne}
                    {a.num_folio ? ` (folio ${a.num_folio})` : ''}
                  </option>
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
                Note / motif de la demande
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
                accept="application/pdf"
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

      {tab === 'registre' && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#0f4c75] text-xs uppercase tracking-wide text-white">
              <tr>
                <th className="px-3 py-2.5">N°</th>
                <th className="px-3 py-2.5">Date</th>
                <th className="px-3 py-2.5">Folio</th>
                <th className="px-3 py-2.5">Concerne</th>
                <th className="px-3 py-2.5">Référence</th>
                <th className="px-3 py-2.5">Émetteur</th>
                <th className="px-3 py-2.5">PDF</th>
              </tr>
            </thead>
            <tbody>
              {archives.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                    Aucun document archivé
                  </td>
                </tr>
              ) : (
                archives.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100 odd:bg-slate-50/50">
                    <td className="px-3 py-2.5 text-slate-500">{a.id}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-slate-600">
                      {format.date(a.date_doc)}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-[#0f4c75]">
                      {a.num_folio ?? '—'}
                    </td>
                    <td className="px-3 py-2.5 text-slate-900">{a.concerne}</td>
                    <td className="px-3 py-2.5 text-slate-600">{a.reference ?? '—'}</td>
                    <td className="px-3 py-2.5 text-slate-700">{a.emetteur ?? '—'}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500">
                      {a.nom_doc_phys ?? (a.file_path ? 'PDF' : '—')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'lecture' && <DocumentPdfReader profile={profile} />}

      {tab === 'rapport' && <DocumentReport profile={profile} />}
    </div>
  )
}
