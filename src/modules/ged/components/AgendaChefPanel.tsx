import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  EntiteFilter,
  useEntiteFilter,
} from '@/modules/ged/components/EntiteFilter'
import { FormBrandBar } from '@/modules/ged/components/DashboardShared'
import { exportAgendaChefReportPdf } from '@/modules/ged/lib/exportAgendaChefReportPdf'
import { format } from '@/lib/format'
import { agendaChefService } from '@/services/agendaChefService'
import { circulationService } from '@/services/circulationService'
import {
  AGENDA_AVIS_OPTIONS,
  AGENDA_CIVILITE_OPTIONS,
  AGENDA_TYPE_LABELS,
  SECRETARIAT_CODE_LABELS,
  type AgendaChef,
  type AgendaChefInput,
  type AgendaTypeEvenement,
  type Profile,
  type SecretariatCode,
} from '@/types/ged'
import {
  CalendarDays,
  Copy,
  FileDown,
  Loader2,
  Mail,
  MessageCircle,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
} from 'lucide-react'

type Props = { profile: Profile }

/** Libellé champ : Majuscule + blanc + Majuscule… (pas de TOUT EN MAJUSCULES) */
const labelClass = 'mb-1 block text-xs font-medium text-slate-500'

const emptyForm = (profile: Profile, entite: string): AgendaChefInput => ({
  Entite: entite || 'Kinshasa',
  Date_Oper: new Date().toISOString().slice(0, 10),
  Operateur: profile.full_name,
  Nom_Chef: '',
  Civilite: 'Monsieur',
  Pers_Sollicitee: '',
  Telephone: '',
  Sexe: 'M',
  Organis_Service: '',
  Objet_RDV: '',
  Avis_Chef: 'En Attente',
  Date_RDV: new Date().toISOString().slice(0, 10),
  Heure_RDV: '09:00',
  Lieu_RDV: '',
  Couleur_Objet: '#0f4c75',
  Lien_Visio: '',
  Commentaire: '',
  chef_whatsapp: '',
  chef_email: '',
  type_evenement: 'rendez_vous',
})

function ComboOrInput({
  label,
  value,
  options,
  onChange,
  required,
  placeholder,
  fieldClass,
}: {
  label: string
  value: string
  options: string[]
  onChange: (v: string) => void
  required?: boolean
  placeholder?: string
  fieldClass: string
}) {
  const listId = `combo-${label.replace(/\s+/g, '-')}`
  return (
    <label className="block text-sm">
      <span className={labelClass}>
        {label}
        {required ? ' *' : ''}
      </span>
      <input
        list={listId}
        required={required}
        className={fieldClass}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </label>
  )
}

export function AgendaChefPanel({ profile }: Props) {
  const loadEntites = useCallback(() => circulationService.listEntites(), [])
  const { entites, entite, setEntite } = useEntiteFilter(loadEntites)

  const [rows, setRows] = useState<AgendaChef[]>([])
  const [form, setForm] = useState<AgendaChefInput>(() =>
    emptyForm(profile, 'Kinshasa'),
  )
  const [combos, setCombos] = useState<Record<string, string[]>>({})
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)

  const field =
    'w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none ring-teal-600/30 focus:ring-2'

  const deskLabel = profile.secretariat_code
    ? (SECRETARIAT_CODE_LABELS[profile.secretariat_code as SecretariatCode] ??
      profile.secretariat_code)
    : 'Secrétariat'

  const profileRef = useRef(profile)
  profileRef.current = profile
  const filtersRef = useRef({ dateFrom, dateTo, entite })
  filtersRef.current = { dateFrom, dateTo, entite }
  const loadGenRef = useRef(0)
  const hasLoadedRef = useRef(false)
  const profileKey = `${profile.id}|${profile.secretariat_code ?? ''}`

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    const gen = ++loadGenRef.current
    // Spinner uniquement au tout premier chargement — jamais de flash ensuite
    const showSpinner = !hasLoadedRef.current && !opts?.soft
    if (showSpinner) setLoading(true)
    setError(null)
    try {
      const active = profileRef.current
      const f = filtersRef.current
      const [data, chefs, pers, orgs, objets, lieux, tels, wa, mails, visios] =
        await Promise.all([
          agendaChefService.list(active, {
            dateFrom: f.dateFrom || undefined,
            dateTo: f.dateTo || undefined,
            entite: f.entite || undefined,
          }),
          agendaChefService.listComboValues(active, 'Nom_Chef'),
          agendaChefService.listComboValues(active, 'Pers_Sollicitee'),
          agendaChefService.listComboValues(active, 'Organis_Service'),
          agendaChefService.listComboValues(active, 'Objet_RDV'),
          agendaChefService.listComboValues(active, 'Lieu_RDV'),
          agendaChefService.listComboValues(active, 'Telephone'),
          agendaChefService.listComboValues(active, 'chef_whatsapp'),
          agendaChefService.listComboValues(active, 'chef_email'),
          agendaChefService.listComboValues(active, 'Lien_Visio'),
        ])
      if (gen !== loadGenRef.current) return
      setRows(data)
      setCombos({
        Nom_Chef: chefs,
        Pers_Sollicitee: pers,
        Organis_Service: orgs,
        Objet_RDV: objets,
        Lieu_RDV: lieux,
        Telephone: tels,
        chef_whatsapp: wa,
        chef_email: mails,
        Lien_Visio: visios,
      })
      hasLoadedRef.current = true
    } catch (e) {
      if (gen !== loadGenRef.current) return
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      if (gen === loadGenRef.current) setLoading(false)
    }
  }, [profileKey])

  // Chargement initial (et changement de bureau / profil uniquement)
  useEffect(() => {
    hasLoadedRef.current = false
    void load()
  }, [load])

  // Mise à jour silencieuse du formulaire — sans recharger la grille
  useEffect(() => {
    setForm((f) => {
      const nextEntite = entite || f.Entite
      const nextOperateur = profile.full_name
      if (f.Entite === nextEntite && f.Operateur === nextOperateur) return f
      return { ...f, Entite: nextEntite, Operateur: nextOperateur }
    })
  }, [entite, profile.full_name])

  const todayLabel = useMemo(
    () =>
      new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(new Date()),
    [],
  )

  function resetForm() {
    setForm(emptyForm(profile, entite || 'Kinshasa'))
    setSelectedId(null)
  }

  function selectRow(row: AgendaChef) {
    setSelectedId(row.IdAgenda)
    setForm({
      IdAgenda: row.IdAgenda,
      Entite: row.Entite ?? entite,
      Date_Oper: row.Date_Oper ?? '',
      Operateur: row.Operateur ?? profile.full_name,
      Nom_Chef: row.Nom_Chef ?? '',
      Civilite: row.Civilite ?? 'Monsieur',
      Pers_Sollicitee: row.Pers_Sollicitee ?? '',
      Telephone: row.Telephone ?? '',
      Sexe: row.Sexe ?? 'M',
      Organis_Service: row.Organis_Service ?? '',
      Objet_RDV: row.Objet_RDV ?? '',
      Avis_Chef: row.Avis_Chef ?? 'En Attente',
      Date_RDV: row.Date_RDV ?? '',
      Heure_RDV: row.Heure_RDV ? String(row.Heure_RDV).slice(0, 5) : '',
      Lieu_RDV: row.Lieu_RDV ?? '',
      Couleur_Objet: row.Couleur_Objet ?? '#0f4c75',
      Lien_Visio: row.Lien_Visio ?? '',
      Commentaire: row.Commentaire ?? '',
      chef_whatsapp: row.chef_whatsapp ?? '',
      chef_email: row.chef_email ?? '',
      type_evenement: (row.type_evenement as AgendaTypeEvenement) || 'rendez_vous',
    })
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)
    try {
      const saved = await agendaChefService.save(profile, {
        ...form,
        Entite: entite || form.Entite,
      })
      setSuccess(
        form.IdAgenda
          ? `Point d’agenda n° ${saved.IdAgenda} mis à jour.`
          : `Point d’agenda n° ${saved.IdAgenda} enregistré.`,
      )
      resetForm()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec enregistrement')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!selectedId) return
    if (!window.confirm(`Supprimer le point d’agenda n° ${selectedId} ?`)) return
    setSaving(true)
    setError(null)
    try {
      await agendaChefService.remove(selectedId)
      setSuccess('Point d’agenda supprimé.')
      resetForm()
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Échec suppression')
    } finally {
      setSaving(false)
    }
  }

  function sendRow(row: AgendaChef, channel: 'whatsapp' | 'email' | 'copy') {
    setError(null)
    setSuccess(null)
    try {
      const { subject, body } = agendaChefService.composeMessage(row)
      if (channel === 'whatsapp') {
        agendaChefService.openWhatsApp(row.chef_whatsapp || '', body)
        setSuccess('Ouverture WhatsApp…')
      } else if (channel === 'email') {
        agendaChefService.openEmail(row.chef_email || '', subject, body)
        setSuccess('Ouverture de l’e-mail…')
      } else {
        void agendaChefService.copyToClipboard(`${subject}\n\n${body}`).then(() =>
          setSuccess('Message copié dans le presse-papiers.'),
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible')
    }
  }

  async function handleExportPdf(openPrint: boolean) {
    const periodHint =
      dateFrom || dateTo
        ? `\nPériode : ${dateFrom || '…'} → ${dateTo || '…'}`
        : '\nPériode : toute la grille affichée'
    const ok = window.confirm(
      openPrint
        ? `Confirmer l’impression de l’état synthèse Agenda du Chef ?\n${rows.length} rendez-vous seront inclus.${periodHint}\n\nUn fichier PDF sera aussi proposé au téléchargement.`
        : `Confirmer le téléchargement de l’état synthèse Agenda du Chef ?\n${rows.length} rendez-vous, groupés par mois.${periodHint}\n\nSans confirmation, aucun fichier n’est téléchargé.`,
    )
    if (!ok) {
      setSuccess(null)
      setError(null)
      return
    }

    setExportingPdf(true)
    setError(null)
    setSuccess(null)
    try {
      await exportAgendaChefReportPdf({
        rows,
        profile,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
        openPrint,
      })
      setSuccess(
        openPrint
          ? 'État PDF ouvert pour impression — fichier aussi téléchargé.'
          : 'État PDF téléchargé (synthèse par mois).',
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Impossible de générer l’état PDF',
      )
    } finally {
      setExportingPdf(false)
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <FormBrandBar title="L’agenda électronique du Chef" />
        <p className="mt-2 text-sm text-slate-600">
          Outil de pilotage des audiences, réunions et rendez-vous —{' '}
          <strong>{deskLabel}</strong>.
        </p>
        <p className="mt-1 text-sm font-medium capitalize text-rose-700">
          {todayLabel}
        </p>
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

      <form
        onSubmit={(e) => void handleSave(e)}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Id Agenda
            </span>
            <input
              className={`${field} bg-slate-50`}
              value={form.IdAgenda ?? ''}
              readOnly
              placeholder="Auto"
            />
          </label>
          <EntiteFilter
            value={entite}
            options={entites}
            onChange={setEntite}
            required
          />
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Date Opér.
            </span>
            <input
              type="date"
              className={field}
              value={form.Date_Oper ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, Date_Oper: e.target.value }))
              }
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Opérateur
            </span>
            <input
              className={`${field} bg-slate-50`}
              value={form.Operateur ?? profile.full_name}
              readOnly
            />
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ComboOrInput
            label="Nom Du Chef"
            value={form.Nom_Chef ?? ''}
            options={combos.Nom_Chef ?? []}
            onChange={(v) => setForm((f) => ({ ...f, Nom_Chef: v }))}
            required
            fieldClass={field}
          />
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Type
            </span>
            <select
              className={field}
              value={form.type_evenement ?? 'rendez_vous'}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  type_evenement: e.target.value as AgendaTypeEvenement,
                }))
              }
            >
              {(Object.keys(AGENDA_TYPE_LABELS) as AgendaTypeEvenement[]).map(
                (k) => (
                  <option key={k} value={k}>
                    {AGENDA_TYPE_LABELS[k]}
                  </option>
                ),
              )}
            </select>
          </label>
          <ComboOrInput
            label="Whatsapp Chef"
            value={form.chef_whatsapp ?? ''}
            options={combos.chef_whatsapp ?? []}
            onChange={(v) => setForm((f) => ({ ...f, chef_whatsapp: v }))}
            placeholder="2438…"
            fieldClass={field}
          />
          <ComboOrInput
            label="E-mail Chef"
            value={form.chef_email ?? ''}
            options={combos.chef_email ?? []}
            onChange={(v) => setForm((f) => ({ ...f, chef_email: v }))}
            placeholder="chef@sonal.cd"
            fieldClass={field}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Civilité
            </span>
            <select
              className={field}
              value={form.Civilite ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, Civilite: e.target.value }))
              }
            >
              {AGENDA_CIVILITE_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <ComboOrInput
            label="Pers. Solliciteuse"
            value={form.Pers_Sollicitee ?? ''}
            options={combos.Pers_Sollicitee ?? []}
            onChange={(v) => setForm((f) => ({ ...f, Pers_Sollicitee: v }))}
            required
            fieldClass={field}
          />
          <ComboOrInput
            label="Téléphone"
            value={form.Telephone ?? ''}
            options={combos.Telephone ?? []}
            onChange={(v) => setForm((f) => ({ ...f, Telephone: v }))}
            fieldClass={field}
          />
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Sexe
            </span>
            <select
              className={field}
              value={form.Sexe ?? 'M'}
              onChange={(e) => setForm((f) => ({ ...f, Sexe: e.target.value }))}
            >
              <option value="M">M</option>
              <option value="F">F</option>
            </select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ComboOrInput
            label="Organis. / Service"
            value={form.Organis_Service ?? ''}
            options={combos.Organis_Service ?? []}
            onChange={(v) => setForm((f) => ({ ...f, Organis_Service: v }))}
            fieldClass={field}
          />
          <ComboOrInput
            label="Objet Rdv"
            value={form.Objet_RDV ?? ''}
            options={combos.Objet_RDV ?? []}
            onChange={(v) => setForm((f) => ({ ...f, Objet_RDV: v }))}
            required
            fieldClass={field}
          />
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Avis Du Chef
            </span>
            <select
              className={field}
              value={form.Avis_Chef ?? 'En Attente'}
              onChange={(e) =>
                setForm((f) => ({ ...f, Avis_Chef: e.target.value }))
              }
            >
              {AGENDA_AVIS_OPTIONS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </label>
          <ComboOrInput
            label="Lieu Rdv"
            value={form.Lieu_RDV ?? ''}
            options={combos.Lieu_RDV ?? []}
            onChange={(v) => setForm((f) => ({ ...f, Lieu_RDV: v }))}
            fieldClass={field}
          />
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Date Rdv *
            </span>
            <input
              type="date"
              required
              className={field}
              value={form.Date_RDV ?? ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, Date_RDV: e.target.value }))
              }
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Heure Rdv
            </span>
            <input
              type="time"
              className={field}
              value={form.Heure_RDV ? String(form.Heure_RDV).slice(0, 5) : ''}
              onChange={(e) =>
                setForm((f) => ({ ...f, Heure_RDV: e.target.value }))
              }
            />
          </label>
          <ComboOrInput
            label="Lien Visioconf."
            value={form.Lien_Visio ?? ''}
            options={combos.Lien_Visio ?? []}
            onChange={(v) => setForm((f) => ({ ...f, Lien_Visio: v }))}
            placeholder="https://…"
            fieldClass={field}
          />
        </div>

        <label className="block text-sm">
          <span className="mb-1 block text-xs font-medium text-slate-500">
            Commentaire
          </span>
          <textarea
            rows={3}
            className={field}
            value={form.Commentaire ?? ''}
            onChange={(e) =>
              setForm((f) => ({ ...f, Commentaire: e.target.value }))
            }
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Enregistrer
          </button>
          <button
            type="button"
            onClick={resetForm}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <Plus className="h-4 w-4" />
            Nouveau
          </button>
          {selectedId != null && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleDelete()}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-800 hover:bg-red-100"
            >
              <Trash2 className="h-4 w-4" />
              Supprimer
            </button>
          )}
        </div>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Du
            </span>
            <input
              type="date"
              className={field}
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">
              Au
            </span>
            <input
              type="date"
              className={field}
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg bg-[#0f4c75] px-4 py-2.5 text-sm font-medium text-white"
          >
            <Search className="h-4 w-4" />
            Afficher
          </button>
          <button
            type="button"
            disabled={exportingPdf || loading}
            onClick={() => void handleExportPdf(false)}
            className="inline-flex items-center gap-2 rounded-lg border border-[#0f4c75]/30 bg-white px-4 py-2.5 text-sm font-medium text-[#0f4c75] hover:bg-[#0f4c75]/5 disabled:opacity-60"
            title="Télécharger le rapport synthèse PDF (rupture par mois)"
          >
            {exportingPdf ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileDown className="h-4 w-4" />
            )}
            État PDF
          </button>
          <button
            type="button"
            disabled={exportingPdf || loading}
            onClick={() => void handleExportPdf(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-900 disabled:opacity-60"
            title="Ouvrir l’état PDF et lancer l’impression"
          >
            {exportingPdf ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Printer className="h-4 w-4" />
            )}
            Imprimer
          </button>
          <p className="ml-auto text-sm text-slate-600">
            Compteur : <strong>{rows.length}</strong>
          </p>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          L’état PDF regroupe les rendez-vous en rupture par mois de l’année
          (filtre Du / Au appliqué). Téléchargement ou impression uniquement
          après votre confirmation.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-800">
          <CalendarDays className="h-4 w-4 text-teal-700" />
          Grille des opérations (date &amp; heure décroissantes)
        </div>
        {loading && rows.length === 0 ? (
          <div className="flex min-h-[12rem] items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-teal-700" />
          </div>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-slate-500">
            Aucun rendez-vous dans votre agenda personnel.
          </p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-medium text-slate-500">
              <tr>
                <th className="px-3 py-2">Id</th>
                <th className="px-3 py-2">Date Rdv</th>
                <th className="px-3 py-2">Heure</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Solliciteur</th>
                <th className="px-3 py-2">Objet</th>
                <th className="px-3 py-2">Avis</th>
                <th className="px-3 py-2">Chef</th>
                <th className="px-3 py-2">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((r) => (
                <tr
                  key={r.IdAgenda}
                  className={`cursor-pointer hover:bg-slate-50/80 ${
                    selectedId === r.IdAgenda ? 'bg-teal-50/50' : ''
                  }`}
                  onClick={() => selectRow(r)}
                >
                  <td className="px-3 py-2 font-medium text-teal-800">
                    {r.IdAgenda}
                  </td>
                  <td className="px-3 py-2">{format.date(r.Date_RDV)}</td>
                  <td className="px-3 py-2">
                    {r.Heure_RDV ? String(r.Heure_RDV).slice(0, 5) : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {AGENDA_TYPE_LABELS[
                      (r.type_evenement as AgendaTypeEvenement) || 'rendez_vous'
                    ] ?? r.type_evenement}
                  </td>
                  <td className="px-3 py-2">
                    {[r.Civilite, r.Pers_Sollicitee].filter(Boolean).join(' ')}
                  </td>
                  <td className="max-w-[14rem] truncate px-3 py-2">
                    {r.Objet_RDV}
                  </td>
                  <td className="px-3 py-2">{r.Avis_Chef ?? '—'}</td>
                  <td className="px-3 py-2">{r.Nom_Chef ?? '—'}</td>
                  <td className="px-3 py-2">
                    <div
                      className="flex flex-wrap gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        title="WhatsApp Chef"
                        onClick={() => sendRow(r, 'whatsapp')}
                        className="rounded border border-emerald-200 bg-emerald-50 p-1.5 text-emerald-800"
                      >
                        <MessageCircle className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="E-mail Chef"
                        onClick={() => sendRow(r, 'email')}
                        className="rounded border border-sky-200 bg-sky-50 p-1.5 text-sky-800"
                      >
                        <Mail className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        title="Copier le message"
                        onClick={() => sendRow(r, 'copy')}
                        className="rounded border border-slate-200 bg-white p-1.5 text-slate-700"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
