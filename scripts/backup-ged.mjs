/**
 * Sauvegarde complète GED → dossier backup/
 * Usage: node scripts/backup-ged.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const backupDir = path.join(root, 'backup')

const TABLES = [
  'tb_directions',
  'tb_services',
  'tb_profiles',
  'tb_emplacements_secretariat',
  'tb_archives',
  'tb_circulations',
  'tb_circulation_events',
  'tb_annotations',
  'tb_aval_etapes',
  'tb_demandes_docs',
  'tb_archives_cli',
  'tb_correspondants',
]

function readToken() {
  if (process.env.SUPABASE_ACCESS_TOKEN) return process.env.SUPABASE_ACCESS_TOKEN
  const mcpPath = path.join(root, '.cursor', 'mcp.json')
  if (fs.existsSync(mcpPath)) {
    const mcp = JSON.parse(fs.readFileSync(mcpPath, 'utf8'))
    const auth = mcp?.mcpServers?.supabase?.headers?.Authorization
    if (typeof auth === 'string' && auth.startsWith('Bearer ')) {
      return auth.slice(7)
    }
  }
  throw new Error('Jeton Supabase introuvable (SUPABASE_ACCESS_TOKEN ou .cursor/mcp.json)')
}

async function sql(query) {
  const token = readToken()
  const res = await fetch(
    'https://api.supabase.com/v1/projects/kfpkjllfaiqkvsjoaiqv/database/query',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    },
  )
  const text = await res.text()
  if (!res.ok) throw new Error(`SQL ${res.status}: ${text}`)
  return JSON.parse(text)
}

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

async function dumpTable(table) {
  try {
    const rows = await sql(
      `SELECT COALESCE(json_agg(t), '[]'::json) AS data FROM public.${table} t`,
    )
    const data = rows?.[0]?.data
    return Array.isArray(data) ? data : []
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (/does not exist|relation/i.test(msg)) return null
    throw e
  }
}

console.log('Sauvegarde GED complète en cours…')
fs.mkdirSync(backupDir, { recursive: true })

const tables = {}
const counts = {}
const missing = []

for (const table of TABLES) {
  process.stdout.write(`  · ${table}… `)
  const rows = await dumpTable(table)
  if (rows === null) {
    console.log('absente (ignorée)')
    missing.push(table)
    continue
  }
  tables[table] = rows
  counts[table] = rows.length
  console.log(`${rows.length} ligne(s)`)
}

const createdAt = new Date().toISOString()
const fileName = `ged-backup-${stamp()}.json`
const filePath = path.join(backupDir, fileName)

const payload = {
  version: 1,
  kind: 'ged_backup',
  created_at: createdAt,
  created_by: { id: 'script', full_name: 'backup-ged.mjs', email: '' },
  tables,
  counts,
  notes: [
    `Sauvegarde complète du ${createdAt.slice(0, 10)}`,
    'Tables GED : documentation, archives, flux, aval, demandes, référentiels.',
    'Fichiers Storage (PDF) non inclus — chemins présents dans tb_archives.',
    ...(missing.length
      ? [`Tables absentes : ${missing.join(', ')}`]
      : []),
  ],
}

fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8')

const total = Object.values(counts).reduce((a, b) => a + b, 0)
console.log('\nSauvegarde réussie.')
console.log(`Fichier : ${filePath}`)
console.log(`Total   : ${total} enregistrement(s)`)
console.log('Détail  :', counts)
