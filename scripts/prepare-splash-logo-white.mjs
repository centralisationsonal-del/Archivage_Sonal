/**
 * Remplace le fond noir du logo Splash par du blanc ( flood-fill depuis les bords ).
 * Source : C:\Vibe coding\New_Logo_Sona_Splash.png
 */
import sharp from 'sharp'
import { writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')

const src =
  process.argv[2] ??
  'C:\\Vibe coding\\New_Logo_Sona_Splash.png'

const { data, info } = await sharp(src)
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true })

const { width: w, height: h, channels: ch } = info
const px = Buffer.from(data)
const visited = new Uint8Array(w * h)

function isBg(i) {
  const r = px[i]
  const g = px[i + 1]
  const b = px[i + 2]
  return r <= 45 && g <= 45 && b <= 45
}

const q = []
function seed(x, y) {
  if (x < 0 || y < 0 || x >= w || y >= h) return
  const idx = y * w + x
  if (visited[idx]) return
  if (!isBg(idx * ch)) return
  visited[idx] = 1
  q.push(idx)
}

for (let x = 0; x < w; x++) {
  seed(x, 0)
  seed(x, h - 1)
}
for (let y = 0; y < h; y++) {
  seed(0, y)
  seed(w - 1, y)
}

while (q.length) {
  const idx = q.pop()
  const o = idx * ch
  px[o] = 0
  px[o + 1] = 0
  px[o + 2] = 0
  px[o + 3] = 0
  const x = idx % w
  const y = (idx / w) | 0
  for (const [dx, dy] of [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]) {
    const nx = x + dx
    const ny = y + dy
    if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
    const n = ny * w + nx
    if (visited[n]) continue
    if (!isBg(n * ch)) continue
    visited[n] = 1
    q.push(n)
  }
}

const outBuf = await sharp(px, { raw: { width: w, height: h, channels: ch } })
  .png()
  .toBuffer()

const dests = [
  path.join(root, 'public', 'New_Logo_Sona_Splash.png'),
  path.join(root, 'public', 'assets', 'New_Logo_Sona_Splash.png'),
  path.join(root, 'src', 'assets', 'New_Logo_Sona_Splash.png'),
  path.join(root, 'public', 'favicon.png'),
  path.join(root, 'scripts', 'logo-guide-formation.png'),
]

for (const d of dests) {
  writeFileSync(d, outBuf)
  console.log('✓', d, outBuf.length, 'octets')
}

console.log('\nLogo Splash — fond noir remplacé par transparence.')
