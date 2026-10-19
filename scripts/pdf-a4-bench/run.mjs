// Banco de pruebas del PDF A4: genera cada fixture (con cada diseño) y guarda PDF + manifiesto de hashes.
//   node scripts/pdf-a4-bench/run.mjs <carpeta_salida> [slug_diseño ...]
//   node scripts/pdf-a4-bench/run.mjs --diff <carpetaA> <carpetaB>
import { build } from 'esbuild'
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { dirname, resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../..')

if (process.argv[2] === '--diff') {
  const [a, b] = [process.argv[3], process.argv[4]].map((d) =>
    JSON.parse(readFileSync(join(d, 'manifest.json'), 'utf8')),
  )
  let bad = 0
  for (const k of Object.keys(a)) {
    if (a[k] !== b[k]) {
      bad++
      console.log('DIFERENTE', k)
    }
  }
  for (const k of Object.keys(b)) if (!(k in a)) console.log('SOLO EN B', k)
  console.log(bad ? `${bad} diferencias` : `IDÉNTICOS (${Object.keys(a).length} PDFs)`)
  process.exit(bad ? 1 : 0)
}

const out = resolve(process.argv[2] ?? join(root, '.bench-out'))
const designs = process.argv.slice(3)
mkdirSync(out, { recursive: true })

const bundle = join(out, '_bench.mjs')
await build({
  entryPoints: [join(here, process.env.BENCH_ENTRY ?? 'entry.ts')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'esm',
  alias: { '@': join(root, 'src') },
  define: { 'import.meta.env': '{"MODE":"test","DEV":false,"PROD":false,"BASE_URL":"/"}' },
  loader: { '.mp3': 'dataurl', '.png': 'dataurl', '.svg': 'dataurl', '.jpg': 'dataurl', '.webp': 'dataurl', '.wav': 'dataurl' },
  plugins: [
    {
      // Imports de Vite con sufijo ?url / ?raw / ?worker (solo los usa la app real): string vacío.
      name: 'vite-url-stub',
      setup(b) {
        b.onResolve({ filter: /\?(url|raw|worker)$/ }, (a) => ({ path: a.path, namespace: 'stub' }))
        b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'export default ""', loader: 'js' }))
      },
    },
  ],
  logLevel: 'error',
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
})
const { generate } = await import(pathToFileURL(bundle).href + '?t=' + Date.now())
const manifest = {}
for (const [name, bytes] of await generate(designs.length ? designs : [null])) {
  writeFileSync(join(out, name + '.pdf'), bytes)
  // Se normalizan la fecha de creación y el ID del archivo, que cambian en cada ejecución.
  const txt = Buffer.from(bytes)
    .toString('latin1')
    .replace(/\/CreationDate \(D:[^)]*\)/g, '')
    .replace(/\/ID \[[^\]]*\]/g, '')
  manifest[name] = createHash('sha256').update(txt).digest('hex')
}
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1))
console.log(`${Object.keys(manifest).length} PDFs en ${out}`)
