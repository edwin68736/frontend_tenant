# Frontend Tenant — Panel ERP por empresa

SPA React del ERP multi-tenant: ventas, POS, inventario, facturación, restaurante (config), caja, membresías, etc.

## Stack (código actual)

- **Vite 5** · **React 18** · **TypeScript**
- **Tailwind CSS v3** + PostCSS
- **React Router 6**
- **Axios** · **RHF** + **zod 3** · **sonner**
- Utilidades: jspdf, qrcode, hucre (Excel), date-fns, recharts 2

## Puerto y proxy

- Dev: **http://localhost:5173**
- Proxy: `/api` → `http://localhost:3000`

## Estructura `src/`

```
contexts/       AuthContext, ThemeContext
layouts/        MainLayout (Sidebar + Header)
pages/          Por dominio: sales, pos, products, billing, restaurant, ...
services/       api.ts + 16 servicios
components/
  ui/           Modal, RequireModule, RequirePermission, ConfirmDialog, ...
  Sidebar.tsx, Header.tsx, UbigeoSelects.tsx
constants/, types/, utils/
```

## Autenticación

| Clave | Uso |
|-------|-----|
| `token` | JWT tenant |
| `user` | Perfil |
| `tenantSlug` | Slug empresa (dev/login) |

- Login: `POST /api/login` con email/password
- JWT decodificado en cliente: `modules`, `permissions`, `status`
- Guards: `RequireModule`, `RequirePermission` en rutas sensibles
- Interceptor: `Authorization` + **`X-Tenant-Slug`**

### Resolver tenant en dev

1. `VITE_TENANT_SLUG=mi-empresa` en `.env`
2. `localStorage.tenantSlug` tras login
3. Subdominio en producción
4. Backend: `GET /dev/enter/:slug` (cookie `dev_tenant`)

## Base URL API

Resolución centralizada en `src/config/apiBaseUrl.ts` (exportada vía `services/api.ts`).

| Entorno | Host | API base |
|---------|------|----------|
| Dev | `localhost:5173` | `VITE_API_URL` → `http://localhost:3000` |
| Dev | `demo.localhost:5173` | `VITE_API_URL` o `http://localhost:3000` |
| Prod tenant | `demo.tukifac.com` | **same-origin** → `https://demo.tukifac.com/api/*` |
| Prod reservado | `app.tukifac.com` | `https://api.tukifac.com` (no usar panel tenant aquí) |

Prod **no** debe definir `VITE_API_URL=https://api.tukifac.com` (provoca 403 `missing_resolved_tenant`).

Ver `.env.example` y `backend_go/docs/TENANT-ISOLATION.md`.

## Tema y diseño

- `ThemeContext`: paletas `--p50`…`--p900`, carga branding desde `GET /company/config`
- Usar clases **`primary-*`**, no `blue-600` fijo
- Animación: `page-enter` en contenedor de página
- `MainLayout` ya aplica card blanca — no duplicar `bg-white` en cada página

```tsx
<button className="bg-primary-600 hover:bg-primary-700">
```

## Rutas (extracto)

```
/login
/home, /dashboard
/sales, /sales/register, /sales/pos
/products, /contacts, /inventory, /purchases
/billing/*, /cash/*, /bank/*
/restaurant/*   # Configuración (mesas, productos restaurante)
/company/*, /users, /memberships, /reports/*
```

## Módulos JWT

El backend habilita módulos por plan (`billing`, `restaurant`, etc.). Rutas con `RequireModule` fallan con 403 si no está en el token (requiere re-login tras cambio de plan).

## Scripts

```bash
npm install
npm run dev
npm run build
```

## Variables

```env
VITE_API_URL=http://localhost:3000
VITE_TENANT_SLUG=demo
```

## Código duplicado / deuda

- `pages/sales/POSPage.tsx` — placeholder; la POS real está en `pages/pos/POSPage.tsx`
- `pages/cashbank/*` — placeholders; rutas usan `pages/cash/` y `pages/bank/`
- Lógica compartida con `restaurant_frontend_tenant` copiada (no paquete común): `api.ts`, `taxCalc.ts`, servicios

Antes de crear utilidades, buscar en `utils/` y `services/`.

## Restaurante

Configuración (mesas, mozos, salas) → este frontend (`/restaurant/*`).

Operación en sala (POS cocina, comandas) → `restaurant_frontend_tenant/`.

## Convenciones

- `import api from './api'` único
- Formularios: RHF + Zod
- Toasts: `sonner`
- Normalizar arrays: `data.items ?? []`


CODIGOS PARA MIGRACIONES.
cd E:\tukifac\tukifac_premium\backend_go
go run . migrate-bump-target
go run . migrate-fleet
go run . migrate-backfill-fleet --version=37