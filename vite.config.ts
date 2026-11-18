import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage } from 'node:http'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

function gedBackupLocalPlugin(projectRoot: string): Plugin {
  const backupDir = path.join(projectRoot, 'backup')
  const maxBody = 80 * 1024 * 1024

  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = []
      let size = 0
      req.on('data', (c: Buffer) => {
        size += c.length
        if (size > maxBody) {
          reject(new Error('Payload trop volumineux'))
          req.destroy()
          return
        }
        chunks.push(c)
      })
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
      req.on('error', reject)
    })
  }

  return {
    name: 'ged-backup-local',
    configureServer(server) {
      server.middlewares.use('/api/ged-backup', (req, res, next) => {
        void (async () => {
          try {
            fs.mkdirSync(backupDir, { recursive: true })
            const url = new URL(req.url || '/', 'http://localhost')

            if (req.method === 'GET') {
              const file = url.searchParams.get('file')
              if (file) {
                const safe = path.basename(file)
                if (!safe.endsWith('.json')) {
                  res.statusCode = 400
                  res.end('Fichier invalide')
                  return
                }
                const full = path.join(backupDir, safe)
                if (!fs.existsSync(full)) {
                  res.statusCode = 404
                  res.end('Introuvable')
                  return
                }
                res.setHeader('Content-Type', 'application/json; charset=utf-8')
                res.end(fs.readFileSync(full, 'utf8'))
                return
              }

              const files = fs
                .readdirSync(backupDir)
                .filter((f) => f.endsWith('.json'))
                .map((fileName) => {
                  const st = fs.statSync(path.join(backupDir, fileName))
                  return {
                    fileName,
                    size: st.size,
                    mtime: st.mtime.toISOString(),
                  }
                })
                .sort((a, b) => b.mtime.localeCompare(a.mtime))

              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify({ path: backupDir, files }))
              return
            }

            if (req.method === 'POST') {
              const raw = await readBody(req)
              const body = JSON.parse(raw) as {
                fileName?: string
                payload?: unknown
              }
              const fileName = path.basename(
                body.fileName || `ged-backup-${Date.now()}.json`,
              )
              if (!fileName.endsWith('.json')) {
                res.statusCode = 400
                res.end('Nom de fichier invalide')
                return
              }
              const full = path.join(backupDir, fileName)
              fs.writeFileSync(
                full,
                JSON.stringify(body.payload, null, 2),
                'utf8',
              )
              res.setHeader('Content-Type', 'application/json; charset=utf-8')
              res.end(JSON.stringify({ path: full, fileName }))
              return
            }

            res.statusCode = 405
            res.end('Méthode non autorisée')
          } catch (e) {
            res.statusCode = 500
            res.end(e instanceof Error ? e.message : 'Erreur serveur')
          }
        })().catch(next)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), gedBackupLocalPlugin(rootDir)],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, './src'),
    },
  },
})
