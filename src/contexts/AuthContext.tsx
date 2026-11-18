import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { matrToEmail, normalizeMatr, toAuthPassword } from '@/lib/authMatr'
import { supabase } from '@/lib/supabase'
import { circulationService } from '@/services/circulationService'
import type { AppRole, Profile } from '@/types/ged'

interface LoginPayload {
  matr: string
  nom_user: string
  full_name: string
  profil: string
  role: AppRole
  privilege?: number | null
  secretariat_code?: string | null
  direction_id: string | null
  service_id: string | null
  email: string
}

interface AuthContextValue {
  profile: Profile | null
  loading: boolean
  signIn: (matr: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Évite les re-renders / remounts quand le contenu profil est inchangé */
function sameProfile(a: Profile | null, b: Profile | null): boolean {
  if (a === b) return true
  if (!a || !b) return false
  return (
    a.id === b.id &&
    a.full_name === b.full_name &&
    a.email === b.email &&
    a.role === b.role &&
    a.direction_id === b.direction_id &&
    a.service_id === b.service_id &&
    a.matr === b.matr &&
    (a.secretariat_code ?? null) === (b.secretariat_code ?? null) &&
    (a.privilege ?? null) === (b.privilege ?? null) &&
    (a.direction?.libelle ?? null) === (b.direction?.libelle ?? null) &&
    (a.service?.libelle ?? null) === (b.service?.libelle ?? null)
  )
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshProfile = useCallback(async () => {
    const p = await circulationService.getCurrentProfile()
    setProfile((prev) => (sameProfile(prev, p) ? prev : p))
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        await refreshProfile()
      } finally {
        setLoading(false)
      }
    })()

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      // Évite les rafraîchissements inutiles (JWT, session initiale) qui font bouger l’UI.
      if (
        event === 'INITIAL_SESSION' ||
        event === 'TOKEN_REFRESHED'
      ) {
        return
      }
      void refreshProfile()
    })
    return () => sub.subscription.unsubscribe()
  }, [refreshProfile])

  const signIn = useCallback(
    async (matrInput: string, password: string) => {
      const matr = normalizeMatr(matrInput)

      const { data: verified, error: verifyError } = await supabase.rpc(
        'ged_verify_login',
        { p_matr: matr, p_password: password },
      )

      if (verifyError) {
        throw new Error(
          verifyError.message.includes('incorrect')
            ? 'Matricule ou mot de passe incorrect'
            : verifyError.message,
        )
      }

      const login = verified as LoginPayload
      const email = login.email || matrToEmail(matr)

      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password: toAuthPassword(password),
        })

      if (authError) {
        throw new Error('Matricule ou mot de passe incorrect')
      }

      const userId = authData.user?.id
      if (userId) {
        await supabase
          .from('tb_profiles')
          .update({
            matr,
            full_name: login.full_name,
            role: login.role,
            privilege:
              login.privilege != null ? Number(login.privilege) : undefined,
            secretariat_code: login.secretariat_code ?? null,
            direction_id: login.direction_id,
            service_id: login.service_id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', userId)
      }

      await refreshProfile()
    },
    [refreshProfile],
  )

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const value = useMemo(
    () => ({ profile, loading, signIn, signOut, refreshProfile }),
    [profile, loading, signIn, signOut, refreshProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth doit être utilisé dans AuthProvider')
  return ctx
}
