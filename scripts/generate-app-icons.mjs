/**
 * Iconos Tauri (Windows, formato ICO válido) y Android (Capacitor) desde public/logo-app.png
 */
import { execSync } from 'node:child_process'
import { copyFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SOURCE = join(ROOT, 'public', 'logo-app.png')
const ASSETS_DIR = join(ROOT, 'assets')
const ICON_ONLY = join(ASSETS_DIR, 'icon-only.png')
const SPLASH = join(ASSETS_DIR, 'splash.png')
const TAURI_ICONS = join(ROOT, 'src-tauri', 'icons')
const SIZE = 1024
const SPLASH_SIZE = 2732
const BG = '#f3f4f6'

async function buildSquareIcon(size, outPath, logoScale = 0.82) {
  const inner = Math.round(size * logoScale)
  const logo = await sharp(SOURCE)
    .resize(inner, inner, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()
  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(outPath)
}

async function main() {
  if (!existsSync(SOURCE)) {
    console.error(`No se encontró: ${SOURCE}`)
    process.exit(1)
  }

  mkdirSync(ASSETS_DIR, { recursive: true })
  console.log('→ Cuadrado 1024×1024 para Tauri / Capacitor…')
  await buildSquareIcon(SIZE, ICON_ONLY)
  console.log('→ Splash 2732×2732…')
  await buildSquareIcon(SPLASH_SIZE, SPLASH, 0.45)

  mkdirSync(TAURI_ICONS, { recursive: true })
  console.log('→ Tauri icon (ICO 3.00 + PNG para Windows)…')
  execSync(`npx tauri icon "${ICON_ONLY}" -o "${TAURI_ICONS}"`, {
    cwd: ROOT,
    stdio: 'inherit',
    shell: true,
  })

  const icoPath = join(TAURI_ICONS, 'icon.ico')
  if (existsSync(icoPath)) {
    const head = await sharp(icoPath).metadata().catch(() => null)
    if (head?.format === 'png') {
      console.error('icon.ico sigue siendo PNG; ejecute: npx tauri icon assets/icon-only.png -o src-tauri/icons')
      process.exit(1)
    }
  }

  console.log('→ Capacitor assets (Android launcher + splash)…')
  try {
    execSync(
      [
        'npx',
        '@capacitor/assets',
        'generate',
        '--android',
        '--iconBackgroundColor',
        BG,
        '--splashBackgroundColor',
        BG,
      ].join(' '),
      { cwd: ROOT, stdio: 'inherit', shell: true },
    )
  } catch {
    console.warn('@capacitor/assets omitido (instale devDependency si necesita splash Android)')
  }

  const androidRes = join(ROOT, 'android', 'app', 'src', 'main', 'res')
  const tauriAndroid = join(TAURI_ICONS, 'android')
  if (existsSync(tauriAndroid)) {
    console.log('→ Copiar mipmaps Android desde Tauri…')
    for (const dir of ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi']) {
      const from = join(tauriAndroid, dir)
      const to = join(androidRes, dir)
      mkdirSync(to, { recursive: true })
      for (const name of ['ic_launcher_foreground.png', 'ic_launcher.png', 'ic_launcher_round.png']) {
        const srcFile = join(from, name)
        if (existsSync(srcFile)) copyFileSync(srcFile, join(to, name))
      }
    }
    const anydpi = join(androidRes, 'mipmap-anydpi-v26')
    mkdirSync(anydpi, { recursive: true })
    for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) {
      const srcFile = join(tauriAndroid, 'mipmap-anydpi-v26', f)
      if (existsSync(srcFile)) copyFileSync(srcFile, join(anydpi, f))
    }
  }

  console.log('Listo: src-tauri/icons/icon.ico (formato Windows válido)')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
