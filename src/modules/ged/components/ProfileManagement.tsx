import { useCallback, useEffect, useMemo, useState } from 'react'
import { circulationService } from '@/services/circulationService'
import {
  ROLE_LABELS,
  SECRETARIAT_CODE_LABELS,
  SECRETARIAT_CODES,
  type AppRole,
  type Direction,
  type GedAgent,
  type Profile,
  type SecretariatCode,
  type Service,
} from '@/types/ged'
import { supabase } from '@/lib/supabase'
import { FormBrandBar } from '@/modules/ged/components/DashboardShared'
import { Loader2, Plus, Save, Search, UserCog, UserPlus, X } from 'lucide-react'

const ALL_ROLES: AppRole[] = [
  'secretariat',
  'cadre',
  'chef_service',
  'directeur',
  'dir_administrative',
  'documentation_archives',
  'controle',
]

interface Props {
  currentUserId: string
}

type PanelMode = 'idle' | 'edit' | 'create'

const emptyCreateForm = {
  full_name: '',
  nom_user: '',
  password: '',
  role: 'cadre' as AppRole,
  direction_id: '',
  service_id: '',
  matr: '',
  privilege: '1',
  secretariat_code: '' as string,
}

export function ProfileManagement({ currentUserId }: Props) {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [directions, setDirections] = useState<Direction[]>([])
  const [services, setServices] = useState<Service[]>([])
  const [agents, setAgents] = useState<GedAgent[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [filterRole, setFilterRole] = useState<AppRole | 'ALL'>('ALL')
  const [filterDirection, setFilterDirection] = useState('ALL')
  const [mode, setMode] = useState<PanelMode>('idle')
  const [editing, setEditing] = useState<Profile | null>(null)
  const [form, setForm] = useState(emptyCreateForm)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [p, d, a] = await Promise.all([
        circulationService.listProfiles(),
        circulationService.listDirections(),
        circulationService.listAgents(),
      ])
      setProfiles(p)
      setDirections(d)
      setAgents(a)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur de chargement')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!form.direction_id) {
      setServices([])
      return
    }
    void circulationService.listServices(form.direction_id).then(setServices)
  }, [form.direction_id])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return profiles.filter((p) => {
      if (filterRole !== 'ALL' && p.role !== filterRole) return false
      if (filterDirection !== 'ALL' && p.direction_id !== filterDirection) return false
      if (!q) return true
      return (
        p.full_name.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        (p.matr ?? '').toLowerCase().includes(q) ||
        ROLE_LABELS[p.role].toLowerCase().includes(q)
      )
    })
  }, [profiles, search, filterRole, filterDirection])

  function openCreate() {
    setMode('create')
    setEditing(null)
    setSuccess(null)
    setError(null)
    setForm(emptyCreateForm)
  }

  function openEdit(p: Profile) {
    setMode('edit')
    setEditing(p)
    setSuccess(null)
    setError(null)
    setForm({
      full_name: p.full_name,
      nom_user: '',
      password: '',
      role: p.role,
      direction_id: p.direction_id ?? '',
      service_id: p.service_id ?? '',
      matr: p.matr ?? '',
      privilege: String(p.privilege ?? 1),
      secretariat_code: p.secretariat_code ?? '',
    })
  }

  function closePanel() {
    setMode('idle')
    setEditing(null)
    setForm(emptyCreateForm)
    setSuccess(null)
    setError(null)
  }

  function applyAgent(matr: string) {
    if (!matr) {
      setForm((prev) => ({ ...prev, matr: '' }))
      return
    }
    const agent = agents.find((a) => a.matr === matr)
    setForm((prev) => ({
      ...prev,
      matr,
      full_name: agent?.full_name || prev.full_name,
      nom_user: agent?.full_name?.split(' ')[0] || prev.nom_user,
      direction_id: agent?.direction_id || prev.direction_id,
      service_id: agent?.service_id || '',
    }))
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(null)

    try {
      if (mode === 'create') {
        if (!form.matr.trim() || !form.password || !form.full_name.trim()) {
          throw new Error('Matricule, nom et mot de passe sont requis')
        }
        let created = await circulationService.createAccount({
          matr: form.matr.trim(),
          password: form.password,
          full_name: form.full_name.trim(),
          nom_user: form.nom_user.trim() || form.full_name.trim(),
          role: form.role,
          direction_id: form.direction_id || null,
          service_id: form.service_id || null,
          privilege: Number(form.privilege) || 1,
        })
        if (form.role === 'secretariat' && form.secretariat_code) {
          const { data: patched, error: patchErr } = await supabase
            .from('tb_profiles')
            .update({ secretariat_code: form.secretariat_code })
            .eq('id', created.id)
            .select('*, direction:tb_directions(*), service:tb_services(*)')
            .single()
          if (patchErr) throw patchErr
          created = patched as Profile
          await supabase
            .from('TbLogin')
            .update({ Profil: form.secretariat_code })
            .eq('Matricule', form.matr.trim())
        }
        setProfiles((prev) =>
          [...prev, created].sort((a, b) => a.full_name.localeCompare(b.full_name)),
        )
        setSuccess(`Compte créé pour le matricule ${created.matr}.`)
        setMode('edit')
        setEditing(created)
        setForm((f) => ({
          ...f,
          password: '',
          privilege: String(created.privilege ?? form.privilege),
          secretariat_code: created.secretariat_code ?? f.secretariat_code,
        }))
      } else if (mode === 'edit' && editing) {
        if (!form.full_name.trim()) {
          throw new Error('Le nom complet est requis')
        }
        if (form.service_id && !form.direction_id) {
          throw new Error('Choisissez une direction avant le service')
        }

        let updated = await circulationService.updateProfile(editing.id, {
          full_name: form.full_name.trim(),
          role: form.role,
          direction_id: form.direction_id || null,
          service_id: form.direction_id ? form.service_id || null : null,
          matr: form.matr.trim() || null,
          privilege: Number(form.privilege) || 1,
        })
        const secCode =
          form.role === 'secretariat' ? form.secretariat_code || null : null
        const { data: patched, error: patchErr } = await supabase
          .from('tb_profiles')
          .update({ secretariat_code: secCode })
          .eq('id', updated.id)
          .select('*, direction:tb_directions(*), service:tb_services(*)')
          .single()
        if (patchErr) throw patchErr
        updated = patched as Profile
        if (form.matr.trim() && form.role === 'secretariat' && secCode) {
          await supabase
            .from('TbLogin')
            .update({ Profil: secCode })
            .eq('Matricule', form.matr.trim())
        }
        setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
        setEditing(updated)
        setForm({
          full_name: updated.full_name,
          nom_user: '',
          password: '',
          role: updated.role,
          direction_id: updated.direction_id ?? '',
          service_id: updated.service_id ?? '',
          matr: updated.matr ?? '',
          privilege: String(updated.privilege ?? 1),
          secretariat_code: updated.secretariat_code ?? '',
        })
        setSuccess('Profil mis à jour avec succès.')
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : 'Échec de l’opération'
      setError(
        raw.includes('Matricule') ||
          raw.includes('service') ||
          raw.includes('Accès') ||
          raw.includes('Profil')
          ? raw
          : `Impossible d’enregistrer : ${raw}`,
      )
    } finally {
      setSaving(false)
    }
  }

  const roleCounts = useMemo(() => {
    const counts = Object.fromEntries(ALL_ROLES.map((r) => [r, 0])) as Record<
      AppRole,
      number
    >
    for (const p of profiles) counts[p.role] = (counts[p.role] ?? 0) + 1
    return counts
  }, [profiles])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-teal-700" />
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <FormBrandBar title="Gestion des profils" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-medium text-slate-900">
            <UserCog className="h-5 w-5 text-teal-700" />
            Gestion des profils
          </h3>
          <p className="mt-1 text-sm text-slate-500">
            Créez des comptes (matricule) et affectez rôles GED, direction et
            service.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ALL_ROLES.map((r) => (
            <span
              key={r}
              className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600"
            >
              {ROLE_LABELS[r]} · {roleCounts[r]}
            </span>
          ))}
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-800 px-3 py-2 text-sm font-medium text-white hover:bg-teal-700"
          >
            <Plus className="h-4 w-4" />
            Nouveau
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher nom, matricule…"
            className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none ring-teal-600/30 focus:ring-2"
          />
        </div>
        <select
          value={filterRole}
          onChange={(e) => setFilterRole(e.target.value as AppRole | 'ALL')}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="ALL">Tous les rôles</option>
          {ALL_ROLES.map((r) => (
            <option key={r} value={r}>
              {ROLE_LABELS[r]}
            </option>
          ))}
        </select>
        <select
          value={filterDirection}
          onChange={(e) => setFilterDirection(e.target.value)}
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm"
        >
          <option value="ALL">Toutes les directions</option>
          {directions.map((d) => (
            <option key={d.id} value={d.id}>
              {d.libelle}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Agent</th>
                <th className="px-4 py-3">Matricule</th>
                <th className="px-4 py-3">Rôle</th>
                <th className="px-4 py-3">Direction</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-slate-500">
                    Aucun profil trouvé
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr
                    key={p.id}
                    className={`hover:bg-slate-50/80 ${
                      editing?.id === p.id ? 'bg-teal-50/50' : ''
                    }`}
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{p.full_name}</p>
                      <p className="text-xs text-slate-500">{p.email}</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-teal-800">
                      {p.matr ?? '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                        {ROLE_LABELS[p.role]}
                      </span>
                      <span className="mt-1 block text-[11px] text-slate-400">
                        Priv. {p.privilege ?? 1}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {p.direction?.libelle ?? '—'}
                      {p.service ? (
                        <span className="block text-xs text-slate-400">
                          {p.service.libelle}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(p)}
                        className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-white"
                      >
                        Modifier
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <aside className="rounded-xl border border-slate-200 bg-white p-5">
          {mode === 'idle' ? (
            <div className="space-y-4 py-6 text-center">
              <UserPlus className="mx-auto h-8 w-8 text-slate-300" />
              <p className="text-sm text-slate-500">
                Sélectionnez un profil à modifier, ou créez un nouveau compte.
              </p>
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 rounded-lg bg-teal-800 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700"
              >
                <Plus className="h-4 w-4" />
                Nouveau compte
              </button>
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="font-medium text-slate-900">
                    {mode === 'create' ? 'Nouveau compte' : 'Édition du profil'}
                  </h4>
                  <p className="text-xs text-slate-500">
                    {mode === 'create'
                      ? 'Matricule + mot de passe (TbLogin & Auth)'
                      : editing?.email}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closePanel}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Matricule RH
                </span>
                {mode === 'create' ? (
                  <select
                    required
                    value={form.matr}
                    onChange={(e) => applyAgent(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
                  >
                    <option value="">Choisir un agent…</option>
                    {agents
                      .filter((a) => !profiles.some((p) => p.matr === a.matr))
                      .map((a) => (
                        <option key={a.matr} value={a.matr}>
                          {a.matr} — {a.full_name}
                          {a.direction_libelle ? ` (${a.direction_libelle})` : ''}
                        </option>
                      ))}
                  </select>
                ) : (
                  <select
                    value={form.matr}
                    onChange={(e) => applyAgent(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
                  >
                    <option value="">Non lié</option>
                    {form.matr && !agents.some((a) => a.matr === form.matr) && (
                      <option value={form.matr}>
                        {form.matr} — (matricule actuel)
                      </option>
                    )}
                    {agents.map((a) => (
                      <option key={a.matr} value={a.matr}>
                        {a.matr} — {a.full_name}
                        {a.direction_libelle ? ` (${a.direction_libelle})` : ''}
                      </option>
                    ))}
                  </select>
                )}
              </label>

              {mode === 'create' && (
                <>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                      Mot de passe
                    </span>
                    <input
                      required
                      type="password"
                      value={form.password}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, password: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
                      placeholder="Mot de passe de connexion"
                    />
                    <span className="mt-1 block text-xs text-slate-500">
                      Si le matricule a déjà un login métier, il sera rattaché
                      au compte GED (mot de passe mis à jour).
                    </span>
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                      Nom utilisateur (login)
                    </span>
                    <input
                      value={form.nom_user}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, nom_user: e.target.value }))
                      }
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
                      placeholder="Ex. Foto"
                    />
                  </label>
                </>
              )}

              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Nom complet
                </span>
                <input
                  required
                  value={form.full_name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, full_name: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Rôle GED
                </span>
                <select
                  value={form.role}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      role: e.target.value as AppRole,
                      secretariat_code:
                        e.target.value === 'secretariat'
                          ? f.secretariat_code
                          : '',
                    }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
                >
                  {ALL_ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </label>

              {form.role === 'secretariat' && (
                <label className="block">
                  <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                    Bureau Sec_* (TbLogin.Profil)
                  </span>
                  <select
                    required
                    value={form.secretariat_code}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        secretariat_code: e.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
                  >
                    <option value="">Choisir le bureau…</option>
                    {SECRETARIAT_CODES.map((c) => (
                      <option key={c} value={c}>
                        {c} — {SECRETARIAT_CODE_LABELS[c as SecretariatCode]}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs text-slate-500">
                    Isolement strict : ce bureau ne voit que ses propres
                    courriers (sauf Superuser).
                  </span>
                </label>
              )}

              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Privilège
                </span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={form.privilege}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, privilege: e.target.value }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Contrôle &amp; Audit : privilège &gt; 10 pour éditer les
                  documents financiers (sans pouvoir d’aval).
                </span>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Direction
                </span>
                <select
                  value={form.direction_id}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      direction_id: e.target.value,
                      service_id: '',
                    }))
                  }
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2"
                >
                  <option value="">Non assignée</option>
                  {directions.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.libelle}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-500">
                  Service
                </span>
                <select
                  value={form.service_id}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, service_id: e.target.value }))
                  }
                  disabled={!form.direction_id}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none ring-teal-600/30 focus:ring-2 disabled:opacity-50"
                >
                  <option value="">Non assigné</option>
                  {services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.libelle}
                    </option>
                  ))}
                </select>
              </label>

              {mode === 'edit' && editing?.id === currentUserId && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Vous modifiez votre propre compte. Un changement de rôle prend
                  effet immédiatement.
                </p>
              )}

              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
                  {error}
                </p>
              )}
              {success && (
                <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                  {success}
                </p>
              )}

              <button
                type="submit"
                disabled={saving}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : mode === 'create' ? (
                  <UserPlus className="h-4 w-4" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                {mode === 'create' ? 'Créer le compte' : 'Enregistrer'}
              </button>
            </form>
          )}
        </aside>
      </div>
    </div>
  )
}
