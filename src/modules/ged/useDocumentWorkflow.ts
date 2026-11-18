import { useCallback, useState } from 'react'
import {
  circulationService,
  type CreateProgressFn,
} from '@/services/circulationService'
import { detectParcoursType } from '@/modules/ged/workflowRules'
import type {
  CreateDocumentInput,
  OrientDocumentInput,
  ParcoursType,
  Profile,
} from '@/types/ged'

export function useDocumentWorkflow(profile: Profile | null) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')

  const inferParcours = useCallback(
    (params: {
      receiverDirectionId: string
      receiverServiceId?: string
      isBroadcast?: boolean
    }): ParcoursType => {
      return detectParcoursType({
        senderDirectionId: profile?.direction_id ?? null,
        receiverDirectionId: params.receiverDirectionId,
        senderServiceId: profile?.service_id ?? null,
        receiverServiceId: params.receiverServiceId,
        isBroadcast: params.isBroadcast,
      })
    },
    [profile],
  )

  const createAndRoute = useCallback(async (input: CreateDocumentInput) => {
    setLoading(true)
    setError(null)
    setProgress(5)
    setProgressLabel('Préparation…')
    const onProgress: CreateProgressFn = (pct, _step, label) => {
      setProgress(pct)
      setProgressLabel(label)
    }
    try {
      const parcoursType =
        input.parcoursType ||
        inferParcours({
          receiverDirectionId: input.receiverDirectionId,
          receiverServiceId: input.receiverServiceId,
          isBroadcast: input.parcoursType === 'BROADCAST',
        })

      return await circulationService.createDocument(
        {
          ...input,
          parcoursType,
        },
        onProgress,
      )
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erreur de circulation'
      setError(message)
      setProgress(0)
      setProgressLabel('')
      throw e
    } finally {
      setLoading(false)
    }
  }, [inferParcours])

  const orient = useCallback(async (input: OrientDocumentInput) => {
    setLoading(true)
    setError(null)
    try {
      return await circulationService.orientDocument(input)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Erreur d’orientation'
      setError(message)
      throw e
    } finally {
      setLoading(false)
    }
  }, [])

  const broadcast = useCallback(
    async (payload: {
      concerne: string
      reference?: string
      file: File
      note?: string
      entite?: string
    }) => {
      if (profile?.role !== 'dir_administrative') {
        throw new Error('Seul le rôle Superuser peut diffuser')
      }
      setLoading(true)
      setError(null)
      try {
        return await circulationService.broadcastToAllSecretariats(payload)
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Erreur de diffusion'
        setError(message)
        throw e
      } finally {
        setLoading(false)
      }
    },
    [profile],
  )

  return {
    loading,
    error,
    progress,
    progressLabel,
    inferParcours,
    createAndRoute,
    orient,
    broadcast,
  }
}
