/**
 * Alerte sonore : 3 coups de cloche (Web Audio API, sans fichier externe).
 */
export async function ringBellThreeTimes(): Promise<void> {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext })
        .webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    if (ctx.state === 'suspended') await ctx.resume()

    const playBell = (at: number) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(880, at)
      osc.frequency.exponentialRampToValueAtTime(440, at + 0.35)
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.28, at + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.4)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(at)
      osc.stop(at + 0.42)
    }

    const t0 = ctx.currentTime + 0.05
    playBell(t0)
    playBell(t0 + 0.55)
    playBell(t0 + 1.1)

    await new Promise((r) => setTimeout(r, 1700))
    void ctx.close()
  } catch {
    /* silencieux si navigateur bloque l’audio */
  }
}
