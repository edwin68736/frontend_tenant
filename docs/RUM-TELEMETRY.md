# Telemetría de rendimiento real (RUM)

Mide, en el navegador de usuarios reales, cuánto tardan la conexión, las vistas y las llamadas API. Nació para saber si
los atascos de conexión IPv6 que medimos en una red concreta (06-oct-2026) ocurren también en producción.

## Qué se mide

| Dato | De dónde sale |
|---|---|
| DNS, conexión (TCP), TLS, TTFB, carga de página | `PerformanceNavigationTiming` del navegador |
| Protocolo (`h2`, `h3`, `http/1.1`) | `nextHopProtocol` |
| Tipo de red (`4g`, `3g`…), móvil sí/no | `navigator.connection.effectiveType`, user-agent (solo "móvil") |
| Tiempo que tarda cada vista en cargar sus datos | `lib/rum/RumRouteTracker` (800 ms sin respuestas API) |
| Duración (p50/p95/máx), TTFB y KB de cada ruta API | `PerformanceObserver('resource')`, agrupado por ruta normalizada (`/api/products/:id`) |
| **Familia de IP (v4/v6), datacenter de Cloudflare, país** | El **servidor**, de la cabecera `CF-Connecting-IP` (solo si la conexión viene de Cloudflare), `CF-Ray` y `CF-IPCountry` |

## Qué NO se recoge

IP, user-agent, usuario o dispositivo, ids de recursos, query strings, contenido de las respuestas. El servidor no guarda
nada de eso: del user-agent solo sale un booleano `mobile`. Se respeta *Do Not Track*. En desarrollo (`localhost`) no se
mide salvo `localStorage.tukifac_rum_force = '1'`.

## Cómo viaja y dónde queda

- El navegador envía `POST /api/public/rum` (sin login, para medir también la pantalla de inicio de sesión) cada 60 s,
  al ocultar la pestaña y 8 s después de cargar. Cuerpo máx. 16 KB; el servidor responde siempre `204` y descarta lo
  inválido. Pasa por el mismo rate limit general que el resto de la API.
- El backend escribe una línea de log `rum_sample` (JSON) por envío. **No hay tabla ni migración**: se consulta con los
  logs del contenedor.

## Cómo leer los resultados

```bash
ssh deploy@72.62.83.69 'docker logs --since 24h tukifac-backend-go 2>&1 | grep rum_sample' | node backend_principal/scripts/rum-report.mjs
```

El informe muestra por familia de IP el % de conexiones lentas (>900 ms, >2 s, >6 s), por datacenter de Cloudflare, por
país, por protocolo, las vistas más lentas y las llamadas API con mayor p95.

**Cómo decidir sobre IPv6:** si `v6` tiene un % de conexiones >900 ms claramente mayor que `v4` en muchos usuarios y
redes distintas, el problema es general y justifica evaluar desactivar IPv6 en Cloudflare; si es parecido a `v4`, el
atasco observado era de una red concreta y no hay nada que cambiar en Cloudflare.

## Código

- Frontend: `src/lib/rum/rum.ts` (recolección y envío), `src/lib/rum/RumRouteTracker.tsx` (montado en `AppRouter`).
- Backend: `internal/rum/handler.go` (validación, saneado y enriquecimiento), `scripts/rum-report.mjs` (informe).
