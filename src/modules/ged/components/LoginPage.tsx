import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { Archive, Loader2, LogIn } from 'lucide-react'

export function LoginPage() {
  const { signIn } = useAuth()
  const [matr, setMatr] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signIn(matr, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur d’authentification')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_#0f766e22,_transparent_55%),linear-gradient(160deg,#0b1f2a_0%,#0f3d3a_45%,#134e4a_100%)]" />
      <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:url('data:image/svg+xml,%3Csvg width=%2760%27 height=%2760%27 viewBox=%270 0 60 60%27 xmlns=%27http://www.w3.org/2000/svg%27%3E%3Cg fill=%27none%27 fill-rule=%27evenodd%27%3E%3Cg fill=%27%23ffffff%27 fill-opacity=%271%27%3E%3Cpath d=%27M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z%27/%3E%3C/g%3E%3C/g%3E%3C/svg%3E')]" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-teal-100 ring-1 ring-white/20 backdrop-blur">
            <Archive className="h-7 w-7" />
          </div>
          <h1 className="font-display text-4xl tracking-tight text-white">SONAL</h1>
          <p className="mt-2 text-sm text-teal-100/80">
            Archivage numérique & circulation du courrier
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-white/95 p-6 shadow-2xl shadow-black/20 backdrop-blur"
        >
          <h2 className="mb-5 text-lg font-medium text-slate-900">Connexion</h2>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Matricule
              </span>
              <input
                required
                autoComplete="username"
                value={matr}
                onChange={(e) => setMatr(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none ring-teal-600/30 focus:ring-2"
                placeholder="Ex. 1364"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Mot de passe
              </span>
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 outline-none ring-teal-600/30 focus:ring-2"
              />
            </label>
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-800 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LogIn className="h-4 w-4" />
            )}
            Se connecter
          </button>
        </form>
      </div>
    </div>
  )
}
