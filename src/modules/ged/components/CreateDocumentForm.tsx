import { useCallback, useEffect, useMemo, useState } from 'react'
import { ACCEPTED_DOCUMENT_ACCEPT } from '@/lib/documentFiles'
import { avalChainFor, findAuthority } from '@/modules/ged/avalAuthorities'
import { FieldHint } from '@/modules/ged/components/FieldHint'
import { FormBrandBar } from '@/modules/ged/components/DashboardShared'
import {
  EntiteFilter,
  useEntiteFilter,
} from '@/modules/ged/components/EntiteFilter'
import {
  TransferProofModal,
  type TransferProofPayload,
} from '@/modules/ged/components/TransferProofModal'
import { SaveProgressBar } from '@/modules/ged/components/SaveProgressBar'
import { useDocumentWorkflow } from '@/modules/ged/useDocumentWorkflow'
import { circulationService } from '@/services/circulationService'
import {
  isDocumentFinancier,
  PARCOURS_LABELS,
  TYPE_DOCUMENT_LABELS,
  type Direction,
  type GedAgent,
  type ParcoursType,
  type Profile,
  type Service,
  type TypeDocument,
} from '@/types/ged'
import { FileUp, Loader2, Megaphone, Send } from 'lucide-react'

interface Props {
  profile: Profile
  onCreated?: () => void
}

export function CreateDocumentForm({ profile, onCreated }: Props) {
  const {
    createAndRoute,
    broadcast,
    inferParcours,
    loading,
    error,
    progress,
    progressLabel,
  } = useDocumentWorkflow(profile)

  const [directions, setDirections] = useState<Direction[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [agents, setAgents] = useState<GedAgent[]>([])
  const [allAgents, setAllAgents] = useState<GedAgent[]>([])
  const [concerne, setConcerne] = useState('')
  const [reference, setReference] = useState('')
  const [typeDocument, setTypeDocument] = useState<TypeDocument>('courrier')
  const [montant, setMontant] = useState('')
  const [devise, setDevise] = useState('CDF')
  const [receiverDirectionId, setReceiverDirectionId] = useState('')
  const [receiverServiceId, setReceiverServiceId] = useState('')
  const [receiverMatr, setReceiverMatr] = useState('')
  const [parcoursType, setParcoursType] = useState<ParcoursType>('P2')
  const [isBroadcast, setIsBroadcast] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [success, setSuccess] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const [proofOpen, setProofOpen] = useState(false)
  const [proof, setProof] = useState<TransferProofPayload | null>(null)

  const loadEntites = useCallback(() => circulationService.listEntites(), [])
  const { entites, entite, setEntite } = useEntiteFilter(loadEntites)

  const financier = isDocumentFinancier(typeDocument)
  const chain = useMemo(() => avalChainFor(typeDocument), [typeDocument])

  const resolvedChain = useMemo(() => {
    return chain.map((step) => {
      if (step.role_key === 'emetteur') {
        return { ...step, agentName: profile.full_name, matr: profile.matr }
      }
      const a = findAuthority(
        allAgents,
        step.role_key as 'chef_budget' | 'dir_administratif' | 'dir_financier' | 'adg',
      )
      return {
        ...step,
        agentName: a?.full_name ?? (step.role_key === 'adg' ? 'ADG / Superuser' : 'À identifier'),
        matr: a?.matr ?? null,
      }
    })
  }, [chain, allAgents, profile.full_name, profile.matr])

  useEffect(() => {
    void circulationService.listDirections().then(setDirections)
    void circulationService.listAgents({ entite: entite || undefined }).then(setAllAgents)
  }, [entite])

  useEffect(() => {
    if (!receiverDirectionId) {
      setServices([])
      setAgents([])
      return
    }
    void circulationService.listServices(receiverDirectionId).then(setServices)
    void circulationService
      .listAgents({
        directionId: receiverDirectionId,
        serviceId: receiverServiceId || undefined,
        entite: entite || undefined,
      })
      .then(setAgents)
  }, [receiverDirectionId, receiverServiceId, entite])

  useEffect(() => {
    if (!receiverDirectionId || isBroadcast) return
    setParcoursType(
      inferParcours({
        receiverDirectionId,
        receiverServiceId: receiverServiceId || undefined,
        isBroadcast,
      }),
    )
  }, [receiverDirectionId, receiverServiceId, isBroadcast, inferParcours])

  useEffect(() => {
    if (!financier) return
    if (!devise) setDevise('CDF')
    const hints: Record<string, string> = {
      note_frais:
        'Aval protégé uniquement par le Directeur Financier puis l’ADG. Joindre les justificatifs.',
      mise_disposition:
        `Signé par l’émetteur ${profile.full_name}. Chaîne : Chef de Budget → Directeur Administratif → Directeur Financier → ADG.`,
    }
    setNote(hints[typeDocument] ?? '')
  }, [typeDocument, financier, profile.full_name]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !concerne) return
    setSuccess(false)
    setLocalError(null)

    if (!entite) {
      setLocalError('Sélectionnez l’entité / instance de provenance.')
      return
    }

    if (financier) {
      if (!montant || Number(montant) <= 0) {
        setLocalError('Le montant est obligatoire pour un document financier.')
        return
      }
    }

    try {
      const savedConcerne = concerne
      const savedRef = reference
      if (isBroadcast) {
        await broadcast({ concerne, reference, file, note, entite })
        setProof({
          kind: 'broadcast',
          title: 'Diffusion générale',
          concerne: savedConcerne,
          reference: savedRef,
          fromLabel: profile.full_name,
          toLabels: ['Tous les secrétariats'],
          note: note || undefined,
        })
      } else {
        if (!receiverDirectionId) return
        await createAndRoute({
          concerne,
          reference,
          receiverDirectionId,
          receiverServiceId: receiverServiceId || undefined,
          receiverMatr: receiverMatr || undefined,
          parcoursType,
          file,
          note,
          typeDocument,
          montant: financier ? Number(montant) : null,
          devise: financier ? devise : undefined,
          entite,
        })
        const dirLabel =
          directions.find((d) => d.id === receiverDirectionId)?.libelle ??
          'Direction'
        const agentLabel = agents.find((a) => a.matr === receiverMatr)?.full_name
        const toLabels = agentLabel
          ? [agentLabel, `via ${dirLabel}`]
          : [`Secrétariat ${dirLabel}`]
        setProof({
          kind: agentLabel
            ? profile.role === 'secretariat'
              ? 'sec_to_agent'
              : 'agent_to_agent'
            : profile.role === 'secretariat'
              ? 'sec_to_sec'
              : 'agent_to_sec',
          title: 'Mise en circulation',
          concerne: savedConcerne,
          reference: savedRef,
          fromLabel: profile.full_name,
          toLabels,
          note: note || undefined,
        })
      }
      setProofOpen(true)

      setSuccess(true)
      setConcerne('')
      setReference('')
      setReceiverMatr('')
      setMontant('')
      setTypeDocument('courrier')
      setFile(null)
      setNote('')
      onCreated?.()
    } catch {
      /* error dans le hook */
    }
  }

  const canBroadcast = profile.role === 'dir_administrative'
  const displayError = localError || error

  return (
    <>
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-5">
      <FormBrandBar title="Création / circulation de document" />
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Type de document
            <FieldHint text="Note de frais : aval DF + ADG. Mise à disposition : signature émetteur puis Chef Budget → Dir. Admin → DF → ADG." />
          </span>
          <select
            value={typeDocument}
            onChange={(e) => setTypeDocument(e.target.value as TypeDocument)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none ring-teal-600/30 focus:ring-2"
          >
            {(Object.keys(TYPE_DOCUMENT_LABELS) as TypeDocument[]).map((k) => (
              <option key={k} value={k}>
                {TYPE_DOCUMENT_LABELS[k]}
              </option>
            ))}
          </select>
        </label>

        {financier && (
          <div className="sm:col-span-2 rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <p className="text-sm font-medium text-amber-950">
              Circuit d’aval protégé
              <FieldHint text="Chaque étape n’est accessible qu’à l’autorité désignée. Un avis défavorable clôture le dossier." />
            </p>
            {typeDocument === 'mise_disposition' && (
              <p className="mt-2 text-sm text-amber-900">
                Signé à la création par :{' '}
                <strong>{profile.full_name}</strong>
              </p>
            )}
            <ol className="mt-3 space-y-1.5 text-xs text-amber-950">
              {resolvedChain.map((s, i) => (
                <li key={s.role_key} className="flex gap-2">
                  <span className="font-semibold tabular-nums">{i + 1}.</span>
                  <span>
                    {s.role_label}
                    {s.autoSign ? ' (signature automatique)' : ''}
                    {' — '}
                    <span className="font-medium">{s.agentName}</span>
                    {s.matr ? ` (${s.matr})` : ''}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        )}

        <EntiteFilter
          value={entite}
          options={entites}
          onChange={setEntite}
          required
          className="sm:col-span-2"
        />

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Objet / Concerne
            <FieldHint text="Objet clair du dossier financier ou du courrier." />
          </span>
          <input
            required
            value={concerne}
            onChange={(e) => setConcerne(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none ring-teal-600/30 focus:ring-2"
            placeholder="Objet du courrier"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Référence
            <FieldHint text="Référence interne SONAL." />
          </span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none ring-teal-600/30 focus:ring-2"
            placeholder="Ex. SONAL/DF/2026/012"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Parcours
            <FieldHint text="Proposé selon la direction / le service destinataire." />
          </span>
          <select
            value={parcoursType}
            onChange={(e) => setParcoursType(e.target.value as ParcoursType)}
            disabled={isBroadcast}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none ring-teal-600/30 focus:ring-2 disabled:opacity-60"
          >
            {(Object.keys(PARCOURS_LABELS) as ParcoursType[]).map((key) => (
              <option key={key} value={key}>
                {key} — {PARCOURS_LABELS[key]}
              </option>
            ))}
          </select>
        </label>

        {financier && (
          <>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Montant
                <FieldHint text="Montant engagé ou mis à disposition." />
              </span>
              <input
                required
                type="number"
                min="0"
                step="0.01"
                value={montant}
                onChange={(e) => setMontant(e.target.value)}
                className="w-full rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2.5 outline-none ring-amber-500/30 focus:ring-2"
                placeholder="0.00"
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Devise
                <FieldHint text="CDF, USD ou EUR." />
              </span>
              <select
                value={devise}
                onChange={(e) => setDevise(e.target.value)}
                className="w-full rounded-lg border border-amber-200 bg-amber-50/40 px-3 py-2.5 outline-none ring-amber-500/30 focus:ring-2"
              >
                <option value="CDF">CDF</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
            </label>
          </>
        )}

        {canBroadcast && (
          <label className="flex items-center gap-2 sm:col-span-2">
            <input
              type="checkbox"
              checked={isBroadcast}
              onChange={(e) => {
                setIsBroadcast(e.target.checked)
                if (e.target.checked) setParcoursType('BROADCAST')
              }}
              className="h-4 w-4 rounded border-slate-300 text-teal-700"
            />
            <span className="text-sm text-slate-700">
              Diffusion générale à tous les secrétariats (Superuser)
            </span>
          </label>
        )}

        {!isBroadcast && (
          <>
            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Direction destinataire
              </span>
              <select
                required
                value={receiverDirectionId}
                onChange={(e) => {
                  setReceiverDirectionId(e.target.value)
                  setReceiverServiceId('')
                  setReceiverMatr('')
                }}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none ring-teal-600/30 focus:ring-2"
              >
                <option value="">Sélectionner…</option>
                {directions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.code} — {d.libelle}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Service destinataire
              </span>
              <select
                value={receiverServiceId}
                onChange={(e) => setReceiverServiceId(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none ring-teal-600/30 focus:ring-2"
              >
                <option value="">Optionnel…</option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} — {s.libelle}
                  </option>
                ))}
              </select>
            </label>

            <label className="block sm:col-span-2">
              <span className="mb-1.5 block text-sm font-medium text-slate-700">
                Destinataire (agent RH)
                <FieldHint text="Destinataire du dossier (distinct des autorités d’aval)." />
              </span>
              <select
                value={receiverMatr}
                onChange={(e) => setReceiverMatr(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none ring-teal-600/30 focus:ring-2"
              >
                <option value="">Via secrétariat / à préciser…</option>
                {agents
                  .filter((a) => a.matr !== profile.matr)
                  .map((a) => (
                    <option key={a.matr} value={a.matr}>
                      {a.full_name} — {a.fonction ?? a.service_libelle ?? a.matr}
                    </option>
                  ))}
              </select>
            </label>
          </>
        )}

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Pièce jointe
            <FieldHint text="Justificatifs ou document signé." />
          </span>
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-4 py-4">
            <FileUp className="h-5 w-5 text-teal-700" />
            <input
              required
              type="file"
              accept={ACCEPTED_DOCUMENT_ACCEPT}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-teal-700 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
            />
          </div>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">
            Note / instruction
          </span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none ring-teal-600/30 focus:ring-2"
          />
        </label>
      </div>

      {(loading || progress > 0) && (
        <SaveProgressBar
          value={progress}
          label={progressLabel || 'Enregistrement en base…'}
          tone={progress >= 100 ? 'success' : 'save'}
        />
      )}

      {displayError && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {displayError}
        </p>
      )}
      {success && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          {financier
            ? 'Document financier enregistré — circuit d’aval démarré.'
            : 'Document transmis avec succès.'}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-teal-800 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-60"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isBroadcast ? (
          <Megaphone className="h-4 w-4" />
        ) : (
          <Send className="h-4 w-4" />
        )}
        {isBroadcast ? 'Diffuser' : 'Transmettre'}
      </button>
    </form>
    <TransferProofModal
      open={proofOpen}
      payload={proof}
      onClose={() => setProofOpen(false)}
    />
    </>
  )
}
