import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { SonalLogo } from '@/modules/ged/components/SonalLogo'
import { Loader2, LogIn, X } from 'lucide-react'

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

  function handleQuit() {
    setMatr('')
    setPassword('')
    setError(null)
    window.close()
    window.setTimeout(() => {
      window.location.replace('about:blank')
    }, 150)
  }

  return (
    <div className="login-sonal-page relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="login-sonal-orb login-sonal-orb--blue pointer-events-none absolute" aria-hidden />
      <div className="login-sonal-orb login-sonal-orb--red pointer-events-none absolute" aria-hidden />
      <div className="login-sonal-grid pointer-events-none absolute inset-0" aria-hidden />

      <div className="relative w-full max-w-md animate-[loginFadeUp_0.7s_ease-out_both]">
        <div className="login-sonal-card overflow-hidden rounded-2xl border border-[#0088ff]/40 shadow-[0_0_48px_rgba(0,136,255,0.22)]">
          {/* Bandeau marque */}
          <div className="relative border-b border-[#0088ff]/20 px-8 pb-6 pt-8 text-center">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_80%_at_50%_0%,rgba(0,136,255,0.18),transparent_70%)]" />
            <div className="relative mx-auto mb-3 inline-flex">
              <SonalLogo size="hero" className="rounded-2xl bg-transparent p-0 shadow-none ring-0" />
            </div>
            <p className="font-brand-sonal text-[#0088ff]">SONAL</p>
            <p className="mt-2 text-sm text-sky-200/75">
              Archivage numérique & circulation du courrier
            </p>
          </div>

          {/* Formulaire */}
          <form className="space-y-4 px-8 py-7" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <label htmlFor="matr" className="block text-sm font-medium text-sky-100/90">
                Matricule
              </label>
              <input
                id="matr"
                required
                autoComplete="username"
                value={matr}
                onChange={(e) => setMatr(e.target.value)}
                placeholder="Ex. 1364"
                className="w-full rounded-xl border border-[#0088ff]/30 bg-black/45 px-3.5 py-3 text-sm text-sky-50 outline-none transition-[border-color,box-shadow] placeholder:text-sky-200/35 focus:border-[#0088ff]/70 focus:ring-4 focus:ring-[#0088ff]/20"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="pass" className="block text-sm font-medium text-sky-100/90">
                Mot de passe
              </label>
              <input
                id="pass"
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-[#0088ff]/30 bg-black/45 px-3.5 py-3 text-sm text-sky-50 outline-none transition-[border-color,box-shadow] focus:border-[#0088ff]/70 focus:ring-4 focus:ring-[#0088ff]/20"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-400/40 bg-red-950/55 px-3.5 py-2.5 text-sm text-red-200">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-2.5 pt-1">
              <button
                type="submit"
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#0088ff] px-4 py-3 text-sm font-semibold text-white shadow-[0_8px_24px_rgba(0,136,255,0.35)] transition-colors hover:bg-[#0077ee] disabled:opacity-60"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                {loading ? 'Connexion…' : 'Se connecter'}
              </button>
              <button
                type="button"
                onClick={handleQuit}
                disabled={loading}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-sky-200/15 bg-transparent px-4 py-2.5 text-sm font-medium text-sky-200/70 transition-colors hover:border-sky-200/30 hover:bg-white/5 hover:text-sky-100 disabled:opacity-60"
              >
                <X className="h-4 w-4" />
                Quitter
              </button>
            </div>
          </form>

          <p className="border-t border-[#0088ff]/15 px-8 py-4 text-center text-xs leading-relaxed text-sky-200/45">
            Accès selon le rôle GED · Documentation & Archives
          </p>
        </div>

        <p className="mt-5 text-center text-[11px] tracking-[0.16em] text-sky-200/40 uppercase">
          SONAL S.A. · Pour le Social
        </p>
      </div>
    </div>
  )
}
