import { supabase } from '@/lib/supabase'
import {
  AGENDA_TYPE_LABELS,
  type AgendaChef,
  type AgendaChefInput,
  type AgendaTypeEvenement,
  type Profile,
} from '@/types/ged'

function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

function normTime(t: string | null | undefined): string | null {
  if (!t?.trim()) return null
  const s = t.trim()
  // HH:MM or HH:MM:SS
  if (/^\d{2}:\d{2}$/.test(s)) return `${s}:00`
  if (/^\d{2}:\d{2}:\d{2}/.test(s)) return s.slice(0, 8)
  return s
}

export const agendaChefService = {
  async list(
    profile: Profile,
    filters?: { dateFrom?: string; dateTo?: string; entite?: string },
  ): Promise<AgendaChef[]> {
    let q = supabase.from('TbAgenda_Chef').select('*')

    // Isolement profil : Superuser voit tout ; sinon uniquement son agenda
    if (profile.role !== 'dir_administrative') {
      q = q.eq('created_by', profile.id)
    }

    if (filters?.entite?.trim()) {
      q = q.ilike('Entite', filters.entite.trim())
    }
    if (filters?.dateFrom) q = q.gte('Date_RDV', filters.dateFrom)
    if (filters?.dateTo) q = q.lte('Date_RDV', filters.dateTo)

    // Classement date + heure décroissants
    q = q
      .order('Date_RDV', { ascending: false, nullsFirst: false })
      .order('Heure_RDV', { ascending: false, nullsFirst: false })
      .limit(500)

    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as AgendaChef[]
  },

  async listComboValues(
    profile: Profile,
    column:
      | 'Nom_Chef'
      | 'Pers_Sollicitee'
      | 'Organis_Service'
      | 'Objet_RDV'
      | 'Lieu_RDV'
      | 'Operateur'
      | 'Telephone'
      | 'chef_whatsapp'
      | 'chef_email'
      | 'Lien_Visio',
  ): Promise<string[]> {
    let q = supabase.from('TbAgenda_Chef').select(column)
    if (profile.role !== 'dir_administrative') {
      q = q.eq('created_by', profile.id)
    }
    const { data, error } = await q.limit(500)
    if (error) throw error
    const set = new Set<string>()
    for (const row of data ?? []) {
      const v = String((row as Record<string, unknown>)[column] ?? '').trim()
      if (v) set.add(v)
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'))
  },

  async save(profile: Profile, input: AgendaChefInput): Promise<AgendaChef> {
    if (!profile.secretariat_code && profile.role === 'secretariat') {
      throw new Error('Bureau Sec_* manquant sur le profil — contactez le Superuser.')
    }
    if (!input.Nom_Chef?.trim()) throw new Error('Indiquez le nom du Chef.')
    if (!input.Pers_Sollicitee?.trim()) {
      throw new Error('Indiquez la personne solliciteuse.')
    }
    if (!input.Date_RDV) throw new Error('Indiquez la date du rendez-vous.')
    if (!input.Objet_RDV?.trim()) throw new Error('Indiquez l’objet du rendez-vous.')

    const payload = {
      Entite: input.Entite?.trim() || null,
      Date_Oper: input.Date_Oper || todayIso(),
      Operateur: input.Operateur?.trim() || profile.full_name,
      Nom_Chef: input.Nom_Chef.trim(),
      Civilite: input.Civilite?.trim() || null,
      Pers_Sollicitee: input.Pers_Sollicitee.trim(),
      Telephone: input.Telephone?.trim() || null,
      Sexe: input.Sexe?.trim() || null,
      Organis_Service: input.Organis_Service?.trim() || null,
      Objet_RDV: input.Objet_RDV.trim(),
      Avis_Chef: input.Avis_Chef?.trim() || 'En Attente',
      Date_RDV: input.Date_RDV,
      Heure_RDV: normTime(input.Heure_RDV),
      Lieu_RDV: input.Lieu_RDV?.trim() || null,
      Couleur_Objet: input.Couleur_Objet?.trim() || null,
      Lien_Visio: input.Lien_Visio?.trim() || null,
      Commentaire: input.Commentaire?.trim() || null,
      chef_whatsapp: input.chef_whatsapp?.trim() || null,
      chef_email: input.chef_email?.trim() || null,
      type_evenement: input.type_evenement || 'rendez_vous',
      secretariat_code: profile.secretariat_code ?? null,
      created_by: profile.id,
      updated_at: new Date().toISOString(),
    }

    if (input.IdAgenda) {
      // Ne jamais réattribuer le propriétaire (isolement profil)
      const { created_by: _owner, ...updatePayload } = payload
      void _owner
      const { data, error } = await supabase
        .from('TbAgenda_Chef')
        .update(updatePayload)
        .eq('IdAgenda', input.IdAgenda)
        .eq('created_by', profile.id)
        .select('*')
        .single()
      if (error) throw error
      return data as AgendaChef
    }

    const { data, error } = await supabase
      .from('TbAgenda_Chef')
      .insert({ ...payload, created_by: profile.id })
      .select('*')
      .single()
    if (error) throw error
    return data as AgendaChef
  },

  async remove(id: number): Promise<void> {
    const { error } = await supabase
      .from('TbAgenda_Chef')
      .delete()
      .eq('IdAgenda', id)
    if (error) throw error
  },

  /** Message composé pour WhatsApp / e-mail */
  composeMessage(row: AgendaChef): { subject: string; body: string } {
    const date = row.Date_RDV
      ? new Intl.DateTimeFormat('fr-FR', {
          weekday: 'long',
          day: '2-digit',
          month: 'long',
          year: 'numeric',
        }).format(new Date(`${row.Date_RDV}T12:00:00`))
      : '—'
    const heure = row.Heure_RDV ? String(row.Heure_RDV).slice(0, 5) : '—'
    const typeKey = (row.type_evenement || 'rendez_vous') as AgendaTypeEvenement
    const typeLabel = AGENDA_TYPE_LABELS[typeKey] ?? row.type_evenement ?? 'RDV'
    const subject = `Agenda — ${typeLabel} : ${row.Objet_RDV ?? ''}`
    const body = [
      `Bonjour ${row.Nom_Chef ?? 'Monsieur / Madame'},`,
      '',
      'Voici le point d’agenda préparé par le secrétariat :',
      '',
      `• Type : ${typeLabel}`,
      `• Objet : ${row.Objet_RDV ?? '—'}`,
      `• Date : ${date}`,
      `• Heure : ${heure}`,
      `• Lieu : ${row.Lieu_RDV ?? '—'}`,
      `• Solliciteur : ${row.Civilite ?? ''} ${row.Pers_Sollicitee ?? '—'}`.trim(),
      `• Organisation / service : ${row.Organis_Service ?? '—'}`,
      `• Téléphone : ${row.Telephone ?? '—'}`,
      `• Avis : ${row.Avis_Chef ?? 'En Attente'}`,
      row.Lien_Visio ? `• Visio : ${row.Lien_Visio}` : null,
      row.Commentaire ? `• Commentaire : ${row.Commentaire}` : null,
      '',
      `Entité : ${row.Entite ?? '—'} · Opérateur : ${row.Operateur ?? '—'}`,
      '',
      'Cordialement,',
      'Secrétariat',
    ]
      .filter(Boolean)
      .join('\n')
    return { subject, body }
  },

  openWhatsApp(phone: string, body: string) {
    const digits = phone.replace(/\D/g, '')
    if (!digits) throw new Error('Numéro WhatsApp du Chef manquant.')
    const url = `https://wa.me/${digits}?text=${encodeURIComponent(body)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  },

  openEmail(email: string, subject: string, body: string) {
    if (!email.trim()) throw new Error('Adresse e-mail du Chef manquante.')
    const url = `mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.open(url, '_blank', 'noopener,noreferrer')
  },

  copyToClipboard(text: string) {
    return navigator.clipboard.writeText(text)
  },
}
