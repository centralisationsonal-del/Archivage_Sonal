import { useAuth } from '@/contexts/AuthContext'
import { ROLE_LABELS } from '@/types/ged'
import { CadreDashboard } from '@/modules/ged/components/CadreDashboard'
import { DocumentationArchivesDashboard } from '@/modules/ged/components/DocumentationArchivesDashboard'
import { LoginPage } from '@/modules/ged/components/LoginPage'
import { SecretariatDashboard } from '@/modules/ged/components/SecretariatDashboard'
import { SuperuserDashboard } from '@/modules/ged/components/SuperuserDashboard'
import { Archive, LogOut } from 'lucide-react'

function RoleWorkspace() {
  const { profile } = useAuth()
  if (!profile) return null

  switch (profile.role) {
    case 'dir_administrative':
      return <SuperuserDashboard profile={profile} />
    case 'documentation_archives':
      return <DocumentationArchivesDashboard profile={profile} />
    case 'secretariat':
      return <SecretariatDashboard profile={profile} />
    case 'directeur':
      return <CadreDashboard profile={profile} variant="directeur" />
    case 'chef_service':
      return <CadreDashboard profile={profile} variant="chef_service" />
    case 'cadre':
    default:
      return <CadreDashboard profile={profile} variant="cadre" />
  }
}

function workspaceSubtitle(role: string) {
  switch (role) {
    case 'dir_administrative':
      return 'Pilotage GED · Superuser'
    case 'documentation_archives':
      return 'Documentation & Archives'
    case 'secretariat':
      return 'Parapheur · Secrétariat'
    case 'directeur':
      return 'Dashboard · Directeur'
    case 'chef_service':
      return 'Dashboard · Chef de service'
    default:
      return 'Dashboard · Cadre'
  }
}

export default function App() {
  const { profile, loading, signOut } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-700 border-t-transparent" />
      </div>
    )
  }

  if (!profile) return <LoginPage />

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f0f7f6_0%,#f8fafc_40%,#f1f5f9_100%)]">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-teal-800 text-white">
              <Archive className="h-5 w-5" />
            </div>
            <div>
              <p className="font-display text-xl leading-none text-slate-900">SONAL</p>
              <p className="text-xs text-slate-500">
                {workspaceSubtitle(profile.role)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium text-slate-800">{profile.full_name}</p>
              <p className="text-xs text-slate-500">{ROLE_LABELS[profile.role]}</p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
        <RoleWorkspace />
      </main>
    </div>
  )
}
