import { supabase } from '@/lib/supabase'
import type { ParcoursType, Profile } from '@/types/ged'

interface ResolveCcParams {
  parcoursType: ParcoursType
  sender: Profile
  receiverDirectionId: string
  receiverServiceId?: string
  receiverId?: string
  receiverMatr?: string
}

async function findProfiles(filters: {
  directionId?: string
  serviceId?: string
  roles: Profile['role'][]
}): Promise<string[]> {
  let query = supabase.from('tb_profiles').select('id').in('role', filters.roles)

  if (filters.directionId) query = query.eq('direction_id', filters.directionId)
  if (filters.serviceId) query = query.eq('service_id', filters.serviceId)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map((p) => p.id as string)
}

async function findAgentMatrs(filters: {
  directionId?: string
  serviceId?: string
  fonctionPattern: string
}): Promise<string[]> {
  const { data, error } = await supabase.rpc('ged_list_agents', {
    p_direction: filters.directionId ?? null,
    p_service: filters.serviceId ?? null,
  })
  if (error) throw error

  const re = new RegExp(filters.fonctionPattern, 'i')
  return ((data ?? []) as { matr: string; fonction: string | null }[])
    .filter((a) => a.fonction && re.test(a.fonction))
    .map((a) => a.matr)
}

/**
 * Règles CC automatiques selon le parcours (projet.md §3)
 * P2 : Chef de service en CC
 * P3 : Directeur de la direction émettrice en CC
 * P4 : Chefs des 2 services + Directeur en CC
 * BROADCAST : tous les secrétariats
 */
export async function resolveCcUsers(params: ResolveCcParams): Promise<string[]> {
  const { parcoursType, sender, receiverDirectionId, receiverServiceId } = params
  const cc = new Set<string>()

  switch (parcoursType) {
    case 'P1':
      break
    case 'P2': {
      if (sender.service_id) {
        const chefs = await findProfiles({
          directionId: sender.direction_id ?? undefined,
          serviceId: sender.service_id,
          roles: ['chef_service'],
        })
        chefs.forEach((id) => cc.add(id))
      }
      break
    }
    case 'P3': {
      if (sender.direction_id) {
        const dirs = await findProfiles({
          directionId: sender.direction_id,
          roles: ['directeur'],
        })
        dirs.forEach((id) => cc.add(id))
      }
      break
    }
    case 'P4': {
      if (sender.direction_id) {
        const directeur = await findProfiles({
          directionId: sender.direction_id,
          roles: ['directeur'],
        })
        directeur.forEach((id) => cc.add(id))

        if (sender.service_id) {
          const chefEmet = await findProfiles({
            directionId: sender.direction_id,
            serviceId: sender.service_id,
            roles: ['chef_service'],
          })
          chefEmet.forEach((id) => cc.add(id))
        }

        if (receiverServiceId) {
          const chefRecept = await findProfiles({
            directionId: sender.direction_id,
            serviceId: receiverServiceId,
            roles: ['chef_service'],
          })
          chefRecept.forEach((id) => cc.add(id))
        }
      }
      break
    }
    case 'BROADCAST': {
      const secretariats = await findProfiles({ roles: ['secretariat'] })
      secretariats.forEach((id) => cc.add(id))
      void receiverDirectionId
      break
    }
  }

  cc.delete(sender.id)
  return [...cc]
}

/** CC par matricules RH (TbPersonnels) — fallback quand peu de profils app existent */
export async function resolveCcMatrs(params: ResolveCcParams): Promise<string[]> {
  const { parcoursType, sender, receiverServiceId } = params
  const cc = new Set<string>()

  switch (parcoursType) {
    case 'P2': {
      const chefs = await findAgentMatrs({
        directionId: sender.direction_id ?? undefined,
        serviceId: sender.service_id ?? undefined,
        fonctionPattern: 'chef',
      })
      chefs.forEach((m) => cc.add(m))
      break
    }
    case 'P3': {
      const dirs = await findAgentMatrs({
        directionId: sender.direction_id ?? undefined,
        fonctionPattern: 'directeur|directrice',
      })
      dirs.forEach((m) => cc.add(m))
      break
    }
    case 'P4': {
      const dirs = await findAgentMatrs({
        directionId: sender.direction_id ?? undefined,
        fonctionPattern: 'directeur|directrice',
      })
      dirs.forEach((m) => cc.add(m))

      const chefEmet = await findAgentMatrs({
        directionId: sender.direction_id ?? undefined,
        serviceId: sender.service_id ?? undefined,
        fonctionPattern: 'chef',
      })
      chefEmet.forEach((m) => cc.add(m))

      if (receiverServiceId) {
        const chefRecept = await findAgentMatrs({
          directionId: sender.direction_id ?? undefined,
          serviceId: receiverServiceId,
          fonctionPattern: 'chef',
        })
        chefRecept.forEach((m) => cc.add(m))
      }
      break
    }
    case 'BROADCAST': {
      const secs = await findAgentMatrs({
        fonctionPattern: 'secr[eé]taire',
      })
      secs.forEach((m) => cc.add(m))
      break
    }
    default:
      break
  }

  if (sender.matr) cc.delete(sender.matr)
  if (params.receiverMatr) cc.delete(params.receiverMatr)
  return [...cc]
}

export function detectParcoursType(params: {
  senderDirectionId: string | null
  receiverDirectionId: string
  senderServiceId: string | null
  receiverServiceId?: string
  isBroadcast?: boolean
}): ParcoursType {
  if (params.isBroadcast) return 'BROADCAST'

  const sameDirection = params.senderDirectionId === params.receiverDirectionId

  if (!sameDirection) {
    return params.receiverServiceId ? 'P3' : 'P1'
  }

  if (
    params.senderServiceId &&
    params.receiverServiceId &&
    params.senderServiceId !== params.receiverServiceId
  ) {
    return 'P4'
  }

  return 'P2'
}
