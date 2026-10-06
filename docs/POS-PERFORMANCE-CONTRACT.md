# POS — contrato de performance de carga

Objetivo: que el POS muestre **productos** lo antes posible. Medido en producción (06-oct-2026): cada llamada a la API
cuesta ~250 ms de piso (Perú → Cloudflare Río → VPS Boston), así que lo que importa es **cuántas olas de peticiones en
serie** hay antes de la primera pantalla y **cuántas peticiones** compiten por ella. El backend responde en ~16 ms (p50).

Este documento es el contrato: si cambias `POSPage.tsx`, `AuthContext`, `BranchContext` o
`BranchCheckoutSeriesContext`, no debes romper ninguna de estas reglas.

## 1. Peticiones críticas (bloquean la primera pantalla)

Son las ÚNICAS que pueden bloquear lo que ve el usuario. Todas se piden **a la vez** en el primer render del POS.

| Petición | Para qué | Por qué es indispensable |
|---|---|---|
| `GET /api/cashbank/sessions/open?branch_id=N` | ¿Hay caja abierta? | Decide entre "Caja cerrada / abrir caja" y el POS (`cashSessionLoading`). |
| `GET /api/products?...page=1&per_page=24&branch_id=N` | Primera página del catálogo | Es lo que se ve. |
| `GET /api/categories` | Pestañas de categorías | Parte visible de la primera pantalla. |

Requisito previo (sin petición): **la sucursal activa y la sesión salen de `localStorage` de forma síncrona** en el primer
render (`AuthProvider` usa `readStoredSession()`; `BranchProvider` toma `active_branch`). Si algo hace que el POS tenga que
esperar `GET /api/session/context` para conocer la sucursal, se ha roto el contrato (volvería la cascada de ~1 s).

## 2. Peticiones diferidas (NO bloquean la primera pantalla)

| Petición | Cuándo se pide | Quién la necesita |
|---|---|---|
| `GET /api/payment-methods` | Con la primera pantalla visible (idle, `runWhenIdle`) o al pulsar Cobrar | Cobro |
| `GET /api/cashbank/bank-accounts?all=1` | Ídem | Cobro (validar vínculo método ↔ cuenta) |
| `GET /api/contacts?type=customer` | Ídem | Cobro (cliente por defecto "Clientes Varios") |
| `GET /api/company/sunat` + `GET /api/company/series?branch_id=N&category=venta` | Contexto global (`BranchCheckoutSeriesContext`), **en paralelo entre sí**, desde que hay sucursal | Cobro (serie y tipo de comprobante) |
| `GET /api/billing/notification-counts`, `GET /api/memberships/reminder-counts` | Header, ≥1 s tras montar, en idle (`runWhenIdle`) | Campana de notificaciones |

Si el usuario pulsa **Cobrar** antes de que los datos diferidos hayan llegado, `openCheckout()` marca
`checkoutRequested`, dispara `ensureCheckoutData()` y el cobro **se abre solo al terminar** (medido: ~420 ms con 250 ms de
latencia por llamada). Nunca se abre un cobro con datos incompletos.

## 3. Peticiones que deben ejecutarse MÁXIMO UNA VEZ por carga y sucursal

`sessions/open`, `products` (página 1 con los mismos filtros), `categories`, `payment-methods`, `bank-accounts`,
`contacts`, `company/sunat`, `company/series`.

Reglas para no volver a duplicarlas:

- Los efectos de arranque dependen solo de `activeBranchId`, `q` y `selectedCat`. **No** deben depender del objeto `session`
  (se reemplaza al cambiar la sucursal y provocaba 3 × `products`).
- Todo efecto con `fetch` usa una bandera `cancelled` para descartar respuestas viejas.
- `ensureCheckoutData()` es idempotente por sucursal (`checkoutDataRef`).
- En desarrollo `React.StrictMode` ejecuta cada efecto dos veces: eso NO cuenta como duplicado de producción (el benchmark
  colapsa pares de la misma URL a <40 ms).

## 4. Dependencias entre peticiones

```
render inicial (sucursal ya conocida, sin esperar nada)
 ├─ sessions/open ──────────┐
 ├─ products (página 1) ────┼─► PRIMERA PANTALLA  (≈ 1 viaje)
 ├─ categories ─────────────┘
 ├─ company/sunat ┐
 ├─ company/series┴─► (paralelas) → habilitan el cobro
 └─ [primera pantalla visible] ► payment-methods + bank-accounts + contacts (idle) → habilitan el cobro
                                   └─ Header (≥1 s, idle) ► notification-counts, reminder-counts
```

Las únicas dependencias reales son: "mostrar productos" necesita caja abierta (la pantalla de caja cerrada reemplaza al
grid) y "cobrar" necesita series + datos de cobro. Nada de lo demás depende de otra petición.

## 5. Qué se puede cachear

| Dato | Se puede cachear | Notas |
|---|---|---|
| Sucursal activa, permisos, módulos (JWT) | Ya en `localStorage` | Se renueva con el token. |
| `company/sunat`, `company/series` | Sí, en memoria por sucursal (`BranchCheckoutSeriesContext.cacheRef`) | Se invalida con `invalidateCheckoutSeries`. |
| `payment-methods`, `bank-accounts`, `contacts` | Por sucursal durante la vida del POS (`checkoutDataRef`) | Cambian poco; se recargan al cambiar de sucursal. |
| `categories` | Candidato a caché de sesión (no implementado aún) | Cambian muy poco. |
| `products`, `sessions/open` | **No** | Stock/precio y estado de caja deben ser actuales. |

## 6. Cómo medir (regresiones)

`frontend_tenant/scripts/perf/pos-bench.cjs` abre el POS local en Chrome headless con latencia artificial de 250 ms por
llamada `/api` y reporta: tiempo hasta el primer producto visible, número de peticiones y repetidas.

```bash
# 1) copia en scripts/perf/seed.json las claves de localStorage de una sesión local (token, user, tenantSlug,
#    active_branch, allowed_branches, can_switch_branch); el archivo está en .gitignore
# 2) con el backend y `npm run dev` levantados:
node scripts/perf/pos-bench.cjs <etiqueta> 4 250
```

Resultado de referencia (dev, 250 ms por llamada `/api`, mediana de 4 corridas):

| | Antes | Después |
|---|---:|---:|
| Primer producto visible, caché caliente | 1156 ms | 589–623 ms |
| Primer producto visible, caché fría | 1532 ms | 1047–1084 ms |
| Peticiones únicas al cargar | 16 | 13 |
| Duplicadas reales (`sessions/open`, `products`) | 2 | 0 |
| `session/context` en la carga | sí (barrera) | no |

Criterio de aceptación para futuros cambios: el primer producto no debe tardar más de **~1 viaje + render** sobre el
arranque de la app, y `repetidas=[]` en la salida del benchmark.
