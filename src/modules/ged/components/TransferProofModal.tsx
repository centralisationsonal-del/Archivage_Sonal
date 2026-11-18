import { format } from '@/lib/format'
import { CheckCircle2, FileText, X } from 'lucide-react'

/** Types d’acte de transmission visualisés */
export type TransferKind =
  | 'sec_to_sec'
  | 'sec_to_agent'
  | 'sec_to_archives'
  | 'agent_to_agent'
  | 'agent_to_sec'
  | 'docs_to_sec'
  | 'broadcast'
  | 'generic'

export type TransferProofPayload = {
  kind: TransferKind
  title: string
  concerne?: string | null
  reference?: string | null
  fromLabel: string
  toLabels: string[]
  note?: string | null
  actedAt?: string
}

type Props = {
  open: boolean
  payload: TransferProofPayload | null
  onClose: () => void
}

const KIND_LABELS: Record<TransferKind, string> = {
  sec_to_sec: 'Secrétariat → Secrétariat',
  sec_to_agent: 'Secrétariat → Cadre / Directeur',
  sec_to_archives: 'Secrétariat → Documentation & Archives',
  agent_to_agent: 'Cadre / Directeur → Cadre / Directeur',
  agent_to_sec: 'Cadre / Directeur → Secrétariat',
  docs_to_sec: 'Documentation → Secrétariat',
  broadcast: 'Diffusion multi-destinataires',
  generic: 'Transmission documentaire',
}

function nodeLabel(text: string, max = 22) {
  const t = text.trim() || '—'
  return t.length > max ? `${t.slice(0, max - 1)}…` : t
}

export function TransferProofModal({ open, payload, onClose }: Props) {
  if (!open || !payload) return null

  const toLabels =
    payload.toLabels.length > 0 ? payload.toLabels : ['Destinataire']
  const multi = toLabels.length > 1
  const actedAt = payload.actedAt || new Date().toISOString()

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="transfer-proof-title"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-[#0f4c75]/5 to-teal-50/80 px-5 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-[#0f4c75]">
              Preuve d’acte
            </p>
            <h2
              id="transfer-proof-title"
              className="mt-0.5 text-lg font-semibold text-slate-900"
            >
              {payload.title}
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {KIND_LABELS[payload.kind]} · {format.datetime(actedAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-white hover:text-slate-800"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="relative overflow-hidden rounded-xl border border-slate-100 bg-slate-50/80 px-3 py-4">
            <svg
              viewBox="0 0 420 140"
              className="mx-auto h-36 w-full max-w-md"
              aria-hidden
            >
              {/* From node */}
              <circle cx="70" cy="70" r="28" className="fill-[#0f4c75]" />
              <text
                x="70"
                y="74"
                textAnchor="middle"
                className="fill-white text-[10px] font-semibold"
              >
                De
              </text>
              <text
                x="70"
                y="118"
                textAnchor="middle"
                className="fill-slate-700 text-[11px]"
              >
                {nodeLabel(payload.fromLabel)}
              </text>

              {multi ? (
                <>
                  <path
                    d="M100 70 C180 70, 200 35, 320 35"
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="2.5"
                    strokeDasharray="6 5"
                    className="transfer-path"
                  />
                  <path
                    d="M100 70 C180 70, 200 105, 320 105"
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="2.5"
                    strokeDasharray="6 5"
                    className="transfer-path"
                  />
                  <circle r="9" className="fill-amber-500 transfer-packet">
                    <animateMotion
                      dur="1.8s"
                      repeatCount="indefinite"
                      path="M100 70 C180 70, 200 35, 320 35"
                    />
                  </circle>
                  <circle r="9" className="fill-teal-600 transfer-packet">
                    <animateMotion
                      dur="1.8s"
                      begin="0.35s"
                      repeatCount="indefinite"
                      path="M100 70 C180 70, 200 105, 320 105"
                    />
                  </circle>
                  <circle cx="340" cy="35" r="24" className="fill-teal-700" />
                  <circle cx="340" cy="105" r="24" className="fill-teal-700" />
                  <text
                    x="340"
                    y="39"
                    textAnchor="middle"
                    className="fill-white text-[9px] font-semibold"
                  >
                    Dest. 1
                  </text>
                  <text
                    x="340"
                    y="109"
                    textAnchor="middle"
                    className="fill-white text-[9px] font-semibold"
                  >
                    Dest. 2
                  </text>
                  <text
                    x="340"
                    y="68"
                    textAnchor="middle"
                    className="fill-slate-600 text-[10px]"
                  >
                    +{Math.max(0, toLabels.length - 2)} autre(s)
                  </text>
                </>
              ) : (
                <>
                  <path
                    id="transfer-line"
                    d="M100 70 C180 70, 240 70, 320 70"
                    fill="none"
                    stroke="#94a3b8"
                    strokeWidth="2.5"
                    strokeDasharray="6 5"
                    className="transfer-path"
                  />
                  <circle r="10" className="fill-amber-500 transfer-packet">
                    <animateMotion
                      dur="1.6s"
                      repeatCount="indefinite"
                      path="M100 70 C180 70, 240 70, 320 70"
                    />
                  </circle>
                  <circle cx="350" cy="70" r="28" className="fill-teal-700" />
                  <text
                    x="350"
                    y="74"
                    textAnchor="middle"
                    className="fill-white text-[10px] font-semibold"
                  >
                    Vers
                  </text>
                  <text
                    x="350"
                    y="118"
                    textAnchor="middle"
                    className="fill-slate-700 text-[11px]"
                  >
                    {nodeLabel(toLabels[0])}
                  </text>
                </>
              )}
            </svg>
            <p className="mt-1 text-center text-xs text-slate-500">
              Animation de circulation — acte enregistré dans l’historique
            </p>
          </div>

          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
            <p className="inline-flex items-center gap-2 text-sm font-medium text-emerald-900">
              <CheckCircle2 className="h-4 w-4" />
              Acte de transmission confirmé
            </p>
            <dl className="mt-3 space-y-1.5 text-sm text-slate-700">
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-xs uppercase text-slate-500">
                  Objet
                </dt>
                <dd className="font-medium">
                  {payload.concerne?.trim() || '—'}
                </dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-xs uppercase text-slate-500">
                  Référence
                </dt>
                <dd>{payload.reference?.trim() || '—'}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-xs uppercase text-slate-500">
                  De
                </dt>
                <dd>{payload.fromLabel}</dd>
              </div>
              <div className="flex gap-2">
                <dt className="w-24 shrink-0 text-xs uppercase text-slate-500">
                  Vers
                </dt>
                <dd>
                  <ul className="space-y-0.5">
                    {toLabels.map((t) => (
                      <li key={t} className="inline-flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-teal-700" />
                        {t}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
              {payload.note?.trim() && (
                <div className="flex gap-2">
                  <dt className="w-24 shrink-0 text-xs uppercase text-slate-500">
                    Note
                  </dt>
                  <dd className="text-slate-600">{payload.note}</dd>
                </div>
              )}
            </dl>
          </div>
        </div>

        <div className="border-t border-slate-100 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg bg-[#0f4c75] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#0c3d5e]"
          >
            J’ai pris connaissance
          </button>
        </div>
      </div>
    </div>
  )
}
