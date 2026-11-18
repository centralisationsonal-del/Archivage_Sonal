import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { ROLE_LABELS } from '@/types/ged'
import { CadreDashboard } from '@/modules/ged/components/CadreDashboard'
import { ControleDashboard } from '@/modules/ged/components/ControleDashboard'
import { DocumentationArchivesDashboard } from '@/modules/ged/components/DocumentationArchivesDashboard'
import { LoginPage } from '@/modules/ged/components/LoginPage'
import { SecretariatDashboard } from '@/modules/ged/components/SecretariatDashboard'
import { ProfileActivityChart } from '@/modules/ged/components/ProfileActivityChart'
import { ProfileCommunicationCenter } from '@/modules/ged/components/ProfileCommunicationCenter'
import { SonalLogo } from '@/modules/ged/components/SonalLogo'
import { UserPhotoAvatar } from '@/modules/ged/components/UserPhotoAvatar'
import { SuperuserDashboard } from '@/modules/ged/components/SuperuserDashboard'
import { LayoutDashboard, LogOut, MessageSquareText } from 'lucide-react'

function RoleWorkspace() {
  const { profile } = useAuth()
  if (!profile) return null

  switch (profile.role) {
    case 'dir_administrative':
      return <SuperuserDashboard profile={profile} />
    case 'documentation_archives':
      return <DocumentationArchivesDashboard profile={profile} />
    case 'controle':
      return <ControleDashboard profile={profile} />
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
    case 'controle':
      return 'Contrôle & Audit · Traçabilité'
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
  const [communicationOpen, setCommunicationOpen] = useState(false)

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-700 border-t-transparent" />
      </div>
    )
  }

  if (!profile) return <LoginPage />

  return (
    <div className="ged-app-shell flex min-h-screen bg-[#faf8ef]">
      <aside className="hidden w-64 shrink-0 flex-col bg-[#132536] text-slate-100 lg:flex">
        <div className="flex items-center gap-3 border-b-2 border-[#e3b600] px-4 py-5">
          <SonalLogo size="sm" className="shrink-0 rounded-lg bg-white/95 p-0.5" />
          <div className="min-w-0">
            <p className="font-brand text-lg leading-none text-white">SONAL</p>
            <p className="mt-1 text-[11px] leading-tight text-[#f5ca24]">
              Archivage numérique & circulation du courrier
            </p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-2 py-4">
          <button
            type="button"
            onClick={() => setCommunicationOpen(false)}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm ${
              communicationOpen
                ? 'text-slate-300 hover:bg-[#1a3348] hover:text-white'
                : 'bg-[#24506e] text-white shadow-[inset_3px_0_0_0_#f5ca24]'
            }`}
          >
            <LayoutDashboard className="h-4 w-4" />
            Tableau de bord
          </button>
          <button
            type="button"
            onClick={() => setCommunicationOpen(true)}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left text-sm ${
              communicationOpen
                ? 'bg-[#24506e] text-white shadow-[inset_3px_0_0_0_#f5ca24]'
                : 'text-slate-300 hover:bg-[#1a3348] hover:text-white'
            }`}
          >
            <MessageSquareText className="h-4 w-4" />
            Messages & demandes
          </button>
        </nav>

        <div className="border-t border-white/10 p-4">
          <p className="truncate text-sm font-medium text-white">{profile.full_name}</p>
          <p className="truncate text-xs text-slate-400">{ROLE_LABELS[profile.role]}</p>
          <button
            type="button"
            onClick={() => void signOut()}
            className="mt-3 inline-flex w-full items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-300 hover:bg-[#1a3348] hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-b-2 border-[#e3b600] bg-[#fffbeb] px-3 py-2.5 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="lg:hidden">
              <div className="flex items-center gap-2">
                <SonalLogo size="sm" className="shrink-0 rounded-lg bg-white p-0.5" />
                <div className="min-w-0">
                  <p className="font-brand text-sm leading-none text-[#1a364d]">SONAL</p>
                  <p className="max-w-[13rem] truncate text-[10px] leading-tight text-[#b58d00]">
                    Archivage numérique & circulation du courrier
                  </p>
                </div>
              </div>
            </div>
            <div className="hidden min-w-0 lg:block">
              <p className="truncate text-xs font-semibold text-[#b58d00]">
                Archivage numérique & circulation du courrier
              </p>
              <h1 className="truncate font-display text-base font-semibold leading-tight text-[#1a364d]">
                {communicationOpen ? 'Messages et demandes' : workspaceSubtitle(profile.role)}
              </h1>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <button
              type="button"
              onClick={() => setCommunicationOpen((open) => !open)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold sm:px-3 sm:text-sm ${
                communicationOpen
                  ? 'border-[#255f8a] bg-[#255f8a] text-white'
                  : 'border-[#d7e0e8] bg-white text-[#1a364d] hover:bg-[#eef6fb]'
              }`}
            >
              <MessageSquareText className="h-4 w-4" />
              <span className="hidden sm:inline">Messages</span>
            </button>
            <UserPhotoAvatar
              matr={profile.matr}
              fullName={profile.full_name}
              size="sm"
            />
            <div className="hidden min-w-0 max-w-[14rem] text-right sm:block lg:max-w-xs">
              <p className="truncate text-sm font-medium text-slate-800">
                {profile.full_name}
              </p>
              <p className="truncate text-xs text-slate-500">
                {ROLE_LABELS[profile.role]}
                {profile.matr ? ` · ${profile.matr}` : ''}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex items-center gap-1.5 rounded-md border border-[#d7e0e8] bg-white px-2.5 py-1.5 text-sm text-[#1a364d] hover:bg-[#eef6fb] lg:hidden"
            >
              <LogOut className="h-4 w-4 shrink-0" />
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5 sm:py-5">
          {communicationOpen ? (
            <ProfileCommunicationCenter
              profile={profile}
              onClose={() => setCommunicationOpen(false)}
            />
          ) : (
            <div className="mx-auto w-full max-w-[1600px]">
              <ProfileActivityChart profile={profile} />
              <RoleWorkspace />
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
