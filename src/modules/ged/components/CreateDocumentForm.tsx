import { useEffect, useState } from 'react'
import { useDocumentWorkflow } from '@/modules/ged/useDocumentWorkflow'
import { circulationService } from '@/services/circulationService'
import {
  PARCOURS_LABELS,
  type Direction,
  type GedAgent,
  type ParcoursType,
  type Profile,
  type Service,
} from '@/types/ged'
import { FileUp, Loader2, Megaphone, Send } from 'lucide-react'

interface Props {
  profile: Profile
  onCreated?: () => void
}

export function CreateDocumentForm({ profile, onCreated }: Props) {
  const { createAndRoute, broadcast, inferParcours, loading, error } =
    useDocumentWorkflow(profile)

  const [directions, setDirections] = useState<Direction[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [agents, setAgents] = useState<GedAgent[]>([])
  const [concerne, setConcerne] = useState('')
  const [reference, setReference] = useState('')
  const [receiverDirectionId, setReceiverDirectionId] = useState('')
  const [receiverServiceId, setReceiverServiceId] = useState('')
  const [receiverMatr, setReceiverMatr] = useState('')
  const [parcoursType, setParcoursType] = useState<ParcoursType>('P2')
  const [isBroadcast, setIsBroadcast] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [note, setNote] = useState('')
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    void circulationService.listDirections().then(setDirections)
  }, [])

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
      })
      .then(setAgents)
  }, [receiverDirectionId, receiverServiceId])

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!file || !concerne) return
    setSuccess(false)

    if (isBroadcast) {
      await broadcast({ concerne, reference, file, note })
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
      })
    }

    setSuccess(true)
    setConcerne('')
    setReference('')
    setReceiverMatr('')
    setFile(null)
    setNote('')
    onCreated?.()
  }

  const canBroadcast = profile.role === 'dir_administrative'

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Objet / Concerne</span>
          <input
            required
            value={concerne}
            onChange={(e) => setConcerne(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-slate-900 outline-none ring-teal-600/30 focus:ring-2"
            placeholder="Objet du courrier"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Référence</span>
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none ring-teal-600/30 focus:ring-2"
            placeholder="Ex. SONAL/DF/2026/012"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Parcours</span>
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
              Diffusion générale à tous les secrétariats (Direction Administrative)
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
            Document PDF
          </span>
          <div className="flex items-center gap-3 rounded-lg border border-dashed border-slate-300 bg-slate-50/80 px-4 py-4">
            <FileUp className="h-5 w-5 text-teal-700" />
            <input
              required
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-teal-700 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white"
            />
          </div>
        </label>

        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-medium text-slate-700">Note</span>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 outline-none ring-teal-600/30 focus:ring-2"
            placeholder="Instruction ou commentaire…"
          />
        </label>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      {success && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Document transmis avec succès.
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg bg-teal-800 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-teal-700 disabled:opacity-60"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : isBroadcast ? <Megaphone className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        {isBroadcast ? 'Diffuser' : 'Transmettre'}
      </button>
    </form>
  )
}
