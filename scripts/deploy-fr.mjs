/**
 * Build + déploiement Netlify — messages console en français.
 */
import { spawnSync } from 'child_process'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const site = process.env.NETLIFY_SITE_ID || 'archivage-sonal-342'

function run(label, command, args, env = {}) {
  console.log(`\n▶ ${label}`)
  const r = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, ...env },
  })
  if (r.status !== 0) {
    console.error(`\n✗ Échec : ${label}`)
    process.exit(r.status ?? 1)
  }
  console.log(`✓ ${label} — terminé`)
}

console.log('=== Archivage SONAL — compilation et mise en ligne ===')
console.log('Langue des messages : français\n')

run('Compilation (TypeScript + Vite)', 'npm', ['run', 'build'])

run(
  'Déploiement en production (Netlify)',
  'npx',
  ['--yes', 'netlify-cli@18.1.0', 'deploy', '--prod', '--dir=dist', `--site=${site}`],
)

console.log('\n=== Mise en ligne réussie ===')
console.log('Site : https://archivage-sonal-342.netlify.app')
