import type { GedAgent, TypeDocument } from '@/types/ged'

export type AvalRoleKey =
  | 'emetteur'
  | 'chef_budget'
  | 'dir_administratif'
  | 'dir_financier'
  | 'adg'

export interface AvalStepDef {
  role_key: AvalRoleKey
  role_label: string
  /** Signature automatique à la création (émetteur) */
  autoSign?: boolean
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

/** Détecte un agent par libellé de fonction (hors assistants / secrétaires) */
export function findAuthority(
  agents: GedAgent[],
  role: Exclude<AvalRoleKey, 'emetteur'>,
): GedAgent | null {
  const scored = agents
    .map((a) => {
      const f = norm(a.fonction ?? '')
      if (!f) return { a, score: -1 }
      // Exclure secrétaires / assistants
      if (
        f.includes('secretaire') ||
        f.includes('assistant') ||
        f.includes('assistante')
      ) {
        return { a, score: -1 }
      }
      let score = -1
      if (role === 'dir_financier') {
        if (/directeur\s*financier/.test(f)) score = 100
        else if (f.includes('financier') && f.includes('directeur')) score = 90
      } else if (role === 'chef_budget') {
        if (/chef.*budget|budget.*chef/.test(f)) score = 100
        else if (f.includes('budget')) score = 70
      } else if (role === 'dir_administratif') {
        if (/directeur\s*administratif/.test(f)) score = 100
      } else if (role === 'adg') {
        if (f === 'adg' || /^adg\b/.test(f)) score = 100
        else if (
          f.includes('administrateur delegue') ||
          f.includes('administrateur general')
        ) {
          score = 90
        }
      }
      return { a, score }
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)

  return scored[0]?.a ?? null
}

/** Chaîne d’étapes selon le type de document */
export function avalChainFor(type: TypeDocument): AvalStepDef[] {
  if (type === 'note_frais') {
    return [
      {
        role_key: 'dir_financier',
        role_label: 'Directeur Financier',
      },
      {
        role_key: 'adg',
        role_label: 'ADG (aval autoritaire)',
      },
    ]
  }
  if (type === 'mise_disposition') {
    return [
      {
        role_key: 'emetteur',
        role_label: 'Signature de l’émetteur',
        autoSign: true,
      },
      {
        role_key: 'chef_budget',
        role_label: 'Chef de Budget',
      },
      {
        role_key: 'dir_administratif',
        role_label: 'Directeur Administratif',
      },
      {
        role_key: 'dir_financier',
        role_label: 'Directeur Financier',
      },
      {
        role_key: 'adg',
        role_label: 'ADG (aval autoritaire)',
      },
    ]
  }
  return []
}
