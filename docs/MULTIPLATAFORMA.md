# Tukifac Tenant — Multiplataforma (Web, Windows, Android)

> Carpeta del proyecto: `frontend_tenant` (equivalente al nombre `tenant_frontend` en requisitos).

## Resumen

| Plataforma | Tecnología | Estado |
|----------|------------|--------|
| Web | Vite + React (sin cambios de rutas en navegador) | OK — `npm run build` |
| Windows | Tauri v2 | Configurado — requiere espacio en disco para `tauri build` |
| Android | Capacitor 7 | OK — `npx cap add android` + `cap sync` |

La web sigue usando `BrowserRouter` y rutas `/dashboard`, etc. En Tauri y Capacitor se usa `HashRouter` (`#/dashboard`) según [documentación Tauri](https://v2.tauri.app/es/start/) para assets locales.

### Identificación del tenant

| Plataforma | Cómo se identifica la empresa |
|------------|-------------------------------|
| **Web** | Subdominio (`https://demo.tukifac.com`) — **no** hay pantalla RUC |
| **Windows / Android** | Primera vez: pantalla **RUC** → `GET /api/public/tenant-by-ruc` en API central → guarda slug + `api_url` en disco |

Flujo nativo (igual que Tukichef): `#/ruc` → vincular → `#/login` → panel.

---

## Archivos creados

| Ruta | Descripción |
|------|-------------|
| `src-tauri/` | Proyecto Rust Tauri v2 (ventana, bundle MSI/NSIS, permisos mínimos) |
| `capacitor.config.ts` | Config Capacitor (appId, splash, status bar, portrait plugin) |
| `android/` | Proyecto Android generado por `npx cap add android` |
| `src/lib/platform/` | Detección runtime web/tauri/capacitor |
| `src/lib/tenantBinding/` | Vinculación RUC (solo apps nativas) |
| `src/contexts/TenantBindingContext.tsx` | Estado de vinculación |
| `src/pages/auth/RucPage.tsx` | Onboarding RUC (Windows/Android) |
| `src/services/public.service.ts` | `tenant-by-ruc` contra API central |
| `src-tauri/src/tenant_binding.rs` | Persistencia en disco (Windows) |
| `src/providers/NativeShellProvider.tsx` | Bootstrap Capacitor (safe area, status bar, teclado) |
| `src/components/routing/AppRouter.tsx` | Rutas con lazy loading + router condicional |
| `scripts/sync-app-version.mjs` | Sincroniza versión a package, Tauri y Gradle |
| `scripts/generate-app-icons.mjs` | Iconos desde `public/logo.png` |
| `tukifac-tenant.version.json` | Manifest de versión única |
| `docs/MULTIPLATAFORMA.md` | Este documento |

## Archivos modificados

| Ruta | Cambio |
|------|--------|
| `package.json` | Scripts `tauri:*`, `cap:*`, dependencias nativas |
| `vite.config.ts` | Base relativa (Tauri/Capacitor), proxy API, code splitting |
| `src/main.tsx` | `NativeShellProvider` |
| `src/App.tsx` | Delega en `AppRouter` |
| `src/index.css` | Safe areas, utilidades móvil (`pt-safe`, `table-scroll-x`, `touch-target`) |
| `index.html` | `viewport-fit=cover`, theme-color |
| `tailwind.config.js` | Breakpoints 320–1536px |
| `src/layouts/MainLayout.tsx` | Safe areas, padding móvil |
| `src/pages/auth/LoginPage.tsx` | Sin slug en nativo (solo email/clave); slug solo en web local |
| `src/config/apiBaseUrl.ts` | Web: subdominio; nativo: URL desde vinculación RUC |
| `src/services/api.ts` | Proxy dev con `X-Tenant-Api-Origin`, redirect login hash |
| `android/.../AndroidManifest.xml` | `screenOrientation="portrait"` |

---

## Dependencias instaladas

**Producción:** `@capacitor/*`, `@tauri-apps/api`, `@tauri-apps/plugin-opener`

**Desarrollo:** `@capacitor/cli`, `@capacitor/assets`, `@tauri-apps/cli`, `http-proxy`, `sharp`

---

## Comandos — Web (sin cambios)

```bash
cd frontend_tenant
npm install
npm run dev          # http://localhost:5173
npm run build        # dist/ para despliegue web
npm run preview
```

Variables: `.env.development` / `.env.production` (`VITE_API_URL`, `VITE_TENANT_SLUG`, etc.).

---

## Comandos — Windows (Tauri v2)

Requisitos: [Rust](https://www.rust-lang.org/tools/install), Visual Studio Build Tools (C++), WebView2 (Windows 11 ya lo incluye).

```bash
cd frontend_tenant
npm install
npm run tauri dev      # alias: desarrollo con hot reload
npm run tauri build    # instaladores en src-tauri/target/release/bundle/
```

Salida típica:

- `bundle/msi/` — instalador MSI
- `bundle/nsis/` — instalador NSIS
- Ejecutable: `tukifac-tenant-1.0.0.exe` (nombre según `tukifac-tenant.version.json`)

**Nota:** Si `tauri build` falla con *Espacio en disco insuficiente*, libere espacio en el disco donde está `src-tauri/target/` (~2–4 GB en release).

**Versiones Tauri:** `@tauri-apps/api@2.11.0` y `@tauri-apps/cli@2.11.2` (fijados en `package.json`).

### Error `Cannot find native binding` / `not a valid Win32 application`

El binario `cli.win32-x64-msvc.node` quedó corrupto (0 bytes), suele pasar tras disco lleno o `npm install` interrumpido. Solución:

```bash
cd frontend_tenant
rm -rf node_modules package-lock.json
npm install
npx tauri --version   # debe mostrar tauri-cli 2.11.2
npm run tauri:dev
```

En PowerShell: `Remove-Item -Recurse -Force node_modules, package-lock.json` y luego `npm install`.

### Error `icon.ico is not in 3.00 format` (RC2175)

`icon.ico` era un PNG renombrado (generación incorrecta con Sharp). Regenerar con:

```bash
npm run icons:generate
```

El script usa `npx tauri icon` (formato ICO válido para Windows). Fuente: `public/logo-app.png`.

Permisos Tauri: solo `opener` + capacidades core (ver `src-tauri/capabilities/default.json`).

---

## Comandos — Android (Capacitor)

Requisitos: Android Studio, JDK 17+, SDK Android 34+.

```bash
cd frontend_tenant
npm install
npm run build:android    # build Vite modo capacitor (base ./)
npx cap sync android     # o: npm run cap:sync
npx cap open android     # abre Android Studio
```

En Android Studio:

- **Run** en dispositivo/emulador
- **Build > Generate Signed Bundle / APK** → APK o AAB

Orientación: bloqueada en **portrait** vía:

1. `AndroidManifest.xml` → `android:screenOrientation="portrait"`
2. `@capacitor/screen-orientation` en `orientationPolicy.ts`
3. `capacitor.config.ts` → plugin `ScreenOrientation: portrait`

Safe areas: `viewport-fit=cover` + variables CSS `env(safe-area-inset-*)` + clases `pt-safe` / `pb-safe` en layout.

Login nativo: tras vincular RUC, solo email y contraseña. La API del tenant es la devuelta por el central (`api_url` en la respuesta).

Iconos / splash:

```bash
npm run icons:generate   # requiere public/logo.png
```

---

## Validaciones realizadas

| Prueba | Resultado |
|--------|-----------|
| `npm run build` (web) | OK |
| `npx cap add android` | OK |
| `npm run tauri build` | Falló por espacio en disco del entorno (no por código) |
| Rutas web | Sin cambio (`BrowserRouter`) |
| Rutas nativas | `HashRouter` automático |
| TypeScript `tsc` | OK en build |

---

## Responsive y móvil

- Breakpoints Tailwind: `xs` 320px, `sm` 390px, `md` 768px, `lg` 1024px
- Sidebar: drawer en `< lg` (ya existente), refinado padding safe
- Utilidades globales: `table-scroll-x`, `touch-target`, `min-h-screen-safe`
- Vistas pesadas: **lazy import** por ruta (code splitting)

Para tablas muy anchas en móvil, envolver tablas con `className="table-scroll-x"` en iteraciones futuras por pantalla.

---

## Mejoras futuras sugeridas

1. Pantalla de **vinculación RUC/API** en nativo (como Tukichef) si se usa API central fija.
2. Plugin Tauri impresión térmica si el tenant lo requiere en Windows.
3. CI: GitHub Actions para `tauri build` y `gradle assembleRelease`.
4. Revisión pantalla a pantalla de tablas (`overflow-x-auto`) en POS y facturación.
5. Modo `capacitor` en `.env` con `VITE_API_URL` para QA en dispositivo físico.
6. iOS (`npx cap add ios`) si se requiere App Store.

---

## Referencias oficiales

- Tauri v2: https://v2.tauri.app/es/start/
- Capacitor: https://capacitorjs.com/docs
