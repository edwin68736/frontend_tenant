/**
 * Sincroniza versión desde tukifac-tenant.version.json hacia package.json, Tauri y Android.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const MANIFEST_PATH = join(ROOT, 'tukifac-tenant.version.json')

function readManifest() {
  const raw = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  const version = String(raw.version ?? '').trim()
  const slug = String(raw.slug ?? 'tukifac-tenant').trim() || 'tukifac-tenant'
  const versionCode = Number(raw.versionCode)
  if (!/^\d+\.\d+\.\d+/.test(version)) {
    throw new Error(`Versión inválida: "${version}"`)
  }
  if (!Number.isFinite(versionCode) || versionCode < 1) {
    throw new Error(`versionCode inválido: ${raw.versionCode}`)
  }
  return { ...raw, version, slug, versionCode }
}

function syncPackageJson(manifest) {
  const path = join(ROOT, 'package.json')
  const pkg = JSON.parse(readFileSync(path, 'utf8'))
  pkg.version = manifest.version
  writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`, 'utf8')
}

function syncCargoToml(manifest) {
  const path = join(ROOT, 'src-tauri', 'Cargo.toml')
  if (!existsSync(path)) return
  let text = readFileSync(path, 'utf8')
  text = text.replace(/^version\s*=\s*".*"$/m, `version = "${manifest.version}"`)
  writeFileSync(path, text, 'utf8')
}

function syncTauriConf(manifest) {
  const path = join(ROOT, 'src-tauri', 'tauri.conf.json')
  if (!existsSync(path)) return
  const conf = JSON.parse(readFileSync(path, 'utf8'))
  conf.version = '../package.json'
  conf.mainBinaryName = `${manifest.slug}-${manifest.version}`
  writeFileSync(path, `${JSON.stringify(conf, null, 2)}\n`, 'utf8')
}

function syncAndroidGradle(manifest) {
  const path = join(ROOT, 'android', 'app', 'build.gradle')
  if (!existsSync(path)) return
  let text = readFileSync(path, 'utf8')
  text = text.replace(/versionCode\s+\d+/, `versionCode ${manifest.versionCode}`)
  text = text.replace(/versionName\s+"[^"]*"/, `versionName "${manifest.version}"`)
  writeFileSync(path, text, 'utf8')
}

const manifest = readManifest()
syncPackageJson(manifest)
syncCargoToml(manifest)
syncTauriConf(manifest)
syncAndroidGradle(manifest)
console.log(`[tukifac-tenant] Versión ${manifest.version} (code ${manifest.versionCode})`)
