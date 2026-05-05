# SCN App — Refactor Progress

Documento del refactor por fases.

---

## ✅ Fase 1 — Setup Vite (commit `eaf82aa`)
Proyecto Vite vanilla con el código actual adentro sin tocar.
Credenciales de Supabase movidas a `.env`.

## ✅ Fase 2 — Núcleo común (commit `2a7498c`)
- `src/main.js` con todo el JS
- `src/core/supabase.js`, `ui.js`, `utils.js`

## ✅ Fase 3 — Vercel + Sentry + PDF (commits `e3266d0`, `488d5af`)
- Vercel auto-deploy desde GitHub: https://scnapp.vercel.app
- `src/core/logo.js`, `pdf.js`, `sentry.js`
- Error tracking en producción

## ✅ Fase 4 Día 1 — State + Auth (commits `507ef5d`, `9530035`)
- `src/core/state.js` — estado global compartido
- `src/core/auth.js` — login/logout/sesión

## ✅ Fase 4 Día 2 — Cotizador (commit `07d2ab5`)
- `src/cotizador/services.js`, `cart.js`, `catalog.js`, `pdf-modal.js`, `quote.js`

## ✅ Fase 4 Día 3 — Productos + Clientes (commit `ae365a4`)
- `src/productos.js`, `src/clientes.js`

## ✅ Fase 4 Día 4 — Fichas + Aprobaciones (commit `780858a`)
- `src/fichas.js`, `src/aprobaciones.js`

## ✅ Fase 4 Día 5 — Dashboard + Mis cotizaciones + Importar + Router (commit `55bd138`)
- `src/dashboard.js`, `src/mis-cotizaciones.js`, `src/importar.js`, `src/router.js`

---

## 📊 Estructura final del proyecto

```
scn-app/
├── index.html              (HTML + CSS, ~800 líneas, sin JS)
├── package.json            (Vite + Sentry como deps)
├── vite.config.js
├── .env                    (Supabase Staging credentials, NO commiteado)
├── .env.example
├── README.md
├── REFACTOR_PROGRESS.md    (este archivo)
└── src/
    ├── main.js             (210 líneas — solo bootstrap)
    ├── core/
    │   ├── state.js        (estado global compartido)
    │   ├── auth.js         (login, logout, sesión)
    │   ├── supabase.js     (cliente)
    │   ├── ui.js           (toast, modales)
    │   ├── utils.js        ($$, formatters, compImg, paths)
    │   ├── logo.js         (SCN_LOGO base64 — 40 KB)
    │   ├── pdf.js          (buildPDF, buildFichaPage)
    │   └── sentry.js       (error tracking)
    ├── cotizador/
    │   ├── services.js     (catálogo de servicios)
    │   ├── cart.js         (carrito + totales + lock)
    │   ├── catalog.js      (filtros + grilla productos + servicios)
    │   ├── pdf-modal.js    (preview + download + email)
    │   └── quote.js        (saveQ, sendAppr, genPDF, clearQ, loadQNum)
    ├── productos.js        (CRUD + foto + tabla stock + tabla precios)
    ├── clientes.js         (CRUD + datalist + tabla)
    ├── fichas.js           (CRUD + tabla + panel ficq)
    ├── aprobaciones.js     (loadApr, aprQ, rejQ, previewCot, badge)
    ├── dashboard.js        (KPIs + ranking + tabla mes)
    ├── mis-cotizaciones.js (loadMis + loadAll)
    ├── importar.js         (CSV parser + sync stock)
    └── router.js           (go + sidebars + nav)
```

---

## 📉 Reducción de main.js

| Hito | Líneas main.js | Reducción acumulada |
|---|---|---|
| Inicio (Fase 1: HTML+CSS+JS junto) | 2440 | — |
| Fase 2-3 (extraer núcleo + PDF) | 1485 | -39% |
| Día 1 (state + auth) | 1437 | -41% |
| Día 2 (cotizador) | 1034 | -58% |
| Día 3 (productos + clientes) | 813 | -67% |
| Día 4 (fichas + aprobaciones) | 483 | -80% |
| **Día 5 (dashboard + mis + import + router)** | **210** | **-91%** |

main.js ahora solo tiene **bootstrap**: imports, wiring de callbacks, `Object.assign(window, ...)`, y `initAuth()`.

---

## 🧩 Patrones técnicos adoptados

### Estado
Todo el estado mutable vive en `state` (un objeto exportado). Cualquier módulo lo importa y muta directamente: `state.Q = []`, `state.ME = user`, etc.

### Imports
- Path relativo con extensión `.js`
- `import { state } from '../core/state.js'`

### Callbacks para evitar deps circulares
Cuando A necesita una función de B y B necesita una de A:
- A expone `setOnX(fn)` (registrar)
- main.js llama `setOnX(funcionDeB)` al inicio
- Ejemplos: `registerCatalogRender`, `registerCloseHandler`, `registerApprovalHandler`, `registerProductHandlers`, `registerImportHandlers`

### Window exposure
Las funciones llamadas desde `onclick=""` inline en el HTML se exponen al final de `main.js` con `Object.assign(window, {...})`. Cuando movamos a `addEventListener` (futuro), se elimina.

### Errores
- `try / catch` con `showToast` para mostrar al usuario
- `console.error` con contexto
- Sentry captura automáticamente todo lo no manejado

---

## 🌐 Servicios y URLs

### Supabase
- **Producción** (la que usa Gisselle/Pablo): `https://viegpybdskqpgkrrjkeu.supabase.co`
- **Staging** (la que usa scnapp.vercel.app): `https://cqdlhosozcaaoldbqnfg.supabase.co`

### Vercel
- URL: `https://scnapp.vercel.app/`
- Auto-deploy desde branch `main` del repo `jpalmes-creator/SCNAPP`
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SENTRY_DSN`

### Sentry
- Org: `scn-ww`
- Project: `javascript`
- DSN en env var `VITE_SENTRY_DSN`
- Solo activo en `import.meta.env.PROD`

### GitHub
- Repo: `https://github.com/jpalmes-creator/SCNAPP`
- Auth via `gh` CLI (instalado en la Mac)

---

## 🚀 Comandos día a día

```bash
cd /Users/juanpi/scn-app

# Desarrollo
npm run dev          # Levanta servidor local en http://localhost:5173

# Build para producción (lo hace Vercel automáticamente al pushear)
npm run build

# Deploy
git add -A
git commit -m "mensaje"
git push             # Vercel auto-despliega ~1-2 min después
```

---

## ⏭️ Pendientes para el switch a producción

Estos son los pasos para mover scnapp.vercel.app a usar la BD de producción real:

1. **Backup de la BD de producción** (Supabase Dashboard → Database → Backups)
2. **Cambiar env vars en Vercel**: poner las URL/anon key de **PRODUCCIÓN** en lugar de staging
3. **Redeploy** en Vercel
4. **Verificar** que se vean datos reales (productos, clientes, etc.)
5. **Pruebas en vivo** con vos haciendo una cotización completa
6. **Compartir la nueva URL** con el equipo y avisarles de migrar
7. (Opcional) Apuntar dominio personalizado (`scnchile.com` o el que tengas) al proyecto Vercel
8. **Mantener el sistema viejo** funcionando por 30 días como backup

---

## 📝 Cosas pendientes / TODOs futuros

1. **Reemplazar Supabase del CDN** (`<script>` en index.html) por `import { createClient } from '@supabase/supabase-js'` — refactor menor, mejora bundle
2. **Reemplazar `Object.assign(window, ...)`** por `addEventListener` en HTML — refactor mediano, elimina globals
3. **Tests automáticos** — al menos smoke tests con Playwright
4. **Tree-shake Sentry** — reduce 100 KB del bundle si no necesitamos tracing/replay
5. **Centralizar types** con TypeScript (cuando crezca el equipo)

---

**Última actualización:** Refactor de Fase 4 completo. main.js: 2440 → 210 líneas (-91%). Listo para probar y hacer el switch.
