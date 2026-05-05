# SCN App — Refactor Progress

Documento vivo del refactor por fases. Acá quedan registrados:
- Qué se hizo en cada fase (con commits)
- Patrones / decisiones técnicas adoptadas
- Qué viene después y por qué
- Cosas que NO hay que olvidar

---

## ✅ Fase 1 — Setup Vite (commit `eaf82aa`)
- Creado proyecto Vite vanilla en `/Users/juanpi/scn-app/`
- `index.html` actual copiado adentro sin tocar la lógica
- Credenciales de Supabase movidas a `.env` (ya no hardcoded)
- Build local + dev server funcionando

## ✅ Fase 2 — Extraer núcleo común (commit `2a7498c`)
- Movido el `<script type="module">` inline a `src/main.js`
- Creados módulos en `src/core/`:
  - `supabase.js` — cliente Supabase
  - `ui.js` — `showToast`, `openModal`, `closeModal`
  - `utils.js` — `$$` (formatCLP), `compImg`, `cleanPathPart`, `uniqueJpgPath`, `f2b64`
- 50 funciones expuestas a `window` para que los `onclick="foo()"` inline sigan funcionando
- **Patrón importante:** `Object.assign(window, {...})` al final de main.js. En Fase 5 se reemplaza por `addEventListener`.

## ✅ Fase 3 — Vercel + Sentry + PDF module
- **3a (commit `e3266d0`)** — Extraídos:
  - `src/core/logo.js` — `SCN_LOGO` base64 (40 KB)
  - `src/core/pdf.js` — `buildPDF`, `buildFichaPage`
  - Removido fallback a global `FICHAS` en `buildFichaPage` (ahora siempre se pasa por parámetro)
- **Vercel conectado** — `https://scnapp.vercel.app` con auto-deploy desde `main`
- Env vars en Vercel: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SENTRY_DSN`
- **3b (commit `488d5af`)** — Sentry:
  - `src/core/sentry.js` — `initSentry()`, `setSentryUser()`, `captureError()`
  - Solo activo en `import.meta.env.PROD`
  - `setSentryUser()` se llama en `onLogin()` para asociar errores al usuario
  - Test verificado: `throw new Error('Test')` desde DevTools llega a Sentry

## ✅ Fase 4 Día 1 — State + Auth (commits `507ef5d` + `9530035`)
- **`src/core/state.js`** — Estado global compartido como un único objeto `state`:
  - Auth: `ME`, `ROLE`, `UNAME`
  - Caches: `PRODS`, `SMAP`, `CLIS`, `FICHAS`
  - Cotización: `Q`, `QNUM`, `QUOTE_BUSY`
  - Filtros: `FB`, `FT`, `FS`, `FIC_SEG`, `FIC_Q`
  - PDF preview: `PREVIEW_*`
  - Helpers: `clearPreview()`, `setPreview()`
- **168 referencias** migradas en `main.js` con regex de word boundary
- **`src/core/auth.js`** — Auth lifecycle:
  - Públicos: `doLogin`, `doLogout`, `showErr`, `showLogin`, `initAuth`, `setAuthHandlers`
  - Privados: `onLogin`, `loadLS`
  - Pattern: `setAuthHandlers({ onLoggedIn, onLoggedOut })` para que main.js conecte `showApp` sin crear dependencia circular
- `init()` reemplazado por `initAuth()` al final de `main.js` (después de `Object.assign(window, ...)`)

---

## 🚧 Fase 4 Día 2 — Cotizador (PRÓXIMO)

### Objetivo
Extraer el módulo más grande: cotizador (carrito, totales, guardar quote, generar PDF).

### Archivos a crear

```
src/cotizador/
├── cart.js          # addI, rmI, chQty, setQty, upP, snapshotQ, syncQuoteButtons,
│                    # setQuoteBusy, calcQuoteTotals, rcTot, rQ, updateMobCart
├── catalog.js       # renderCat, _renderCat, getFilt, setFS, st2, sb2sel, sb2mob,
│                    # setTab, renderSvcs, fp, TCLASS
├── quote.js         # saveQ, sendAppr, genPDF, clearQ, loadQNum
└── pdf-modal.js     # openPDF, closePDFModal, downloadPDF, sendEmailFromPreview
```

### Funciones a mover desde main.js

**De `cart.js`:**
- `addI(id, tipo)` — agregar item al carrito
- `rmI(id)` — remover item
- `chQty(id, d)` — cambiar cantidad +/-
- `setQty(id, v)` — set cantidad directa
- `upP(id, v)` — actualizar precio unitario
- `snapshotQ()` — copia inmutable del carrito
- `syncQuoteButtons()` — habilitar/deshabilitar botones
- `setQuoteBusy(busy)` — lock global
- `calcQuoteTotals(items)` — neto/iva/total
- `rcTot()` — recalcular totales en UI
- `rQ()` — re-render del carrito
- `updateMobCart()` — actualizar badge mobile

**De `catalog.js`:**
- `renderCat()`, `_renderCat()` — render de la grilla de productos (debounced)
- `getFilt()` — aplicar filtros FB/FT/FS al catálogo
- `setFS(v, btn)` — set filtro stock
- `st2(v, btn)` — set filtro tipo
- `sb2sel(v)`, `sb2mob(v)`, `sb2(v, btn)` — set filtro marca
- `setTab(t, btn)` — cambiar tab neumáticos/servicios
- `renderSvcs()` — render lista de servicios
- `fp()` — alias filter products
- `TCLASS(t)` — clase CSS según tipo de uso

**De `quote.js`:**
- `saveQ(estado, qItems)` — guardar cotización en BD con retry de QNUM
- `sendAppr()` — enviar para aprobación
- `genPDF()` — guardar borrador y abrir PDF preview
- `clearQ(force, opts)` — limpiar carrito y formulario
- `loadQNum()` — sincronizar próximo número de cotización

**De `pdf-modal.js`:**
- `openPDF(html, email, num, showSend, clearOnClose)` — abrir modal con iframe
- `closePDFModal()` — cerrar modal (limpia carrito si shouldClearQ)
- `downloadPDF()` — descargar como archivo
- `sendEmailFromPreview()` — enviar por email (Resend)

### Riesgos a tener en cuenta

1. **Estado compartido**: todas estas funciones usan `state.Q`, `state.QNUM`, `state.QUOTE_BUSY`, `state.PRODS`, etc.
   → Importar `import { state } from '../core/state.js'` en cada uno.

2. **Llamadas cruzadas**: por ejemplo:
   - `addI` llama `rQ` (mismo archivo) y `renderCat` (otro archivo)
   - `genPDF` llama `saveQ`, `buildPDF`, `buildFichaPage`, `openPDF`, `clearQ`
   → Usar imports cruzados entre módulos del cotizador.

3. **Funciones expuestas a `window`**: las que tienen `onclick="foo()"` en HTML deben seguir en `window`. Actualizar el `Object.assign(window, ...)` en main.js para importarlas desde su nuevo lugar.

4. **Circular deps potenciales**: si `cart.js` importa `catalog.js` Y `catalog.js` importa `cart.js`, romper con un `events.js` o pasar callbacks.

### Pattern a usar

Mismo que Fase 4 Día 1: **state object via import**, callbacks para evitar circular deps.

### Tiempo estimado: 3-4 horas

---

## 🔜 Fases siguientes (Día 3 en adelante)

- **Día 3** — Productos (`src/productos/`) + Clientes (`src/clientes/`)
- **Día 4** — Fichas técnicas (`src/fichas/`) + Aprobaciones (`src/aprobaciones/`)
- **Día 5** — Dashboard + Importar + Router + Tests + Docs final

---

## 📐 Convenciones técnicas

### Estado
- `state.X` en vez de globals bare
- Mutación directa: `state.Q = []`, no setters
- Para mutaciones complejas, usar helpers en `state.js` (ej. `clearPreview()`)

### Imports
- Module path SIEMPRE relativo con `.js` extension (Vite ESM)
- Ejemplo: `import { state } from '../core/state.js'`

### Window exposure
- Solo para funciones llamadas desde `onclick=""`/`onchange=""` inline
- Se hace al final de `main.js` con `Object.assign(window, {...})`
- Cuando movamos a `addEventListener` (Fase 5), eliminamos esto

### Naming
- snake_case en BD (Supabase)
- camelCase en JS
- UPPER_SNAKE_CASE para constantes globales y env vars

### Errores
- Nunca silenciar con `try {} catch(e) {}`. Mínimo `console.error`
- En catch críticos llamar `captureError(e, { context })`

### Testing pre-commit
- `npm run build` debe pasar
- `npm run dev` debe servir HTTP 200 en localhost:5173
- Verificar que Vercel auto-deployó después del push

---

## 🔐 Credenciales y servicios

### Supabase
- **Producción**: `https://viegpybdskqpgkrrjkeu.supabase.co` (NO usar — el viejo)
- **Staging**: `https://cqdlhosozcaaoldbqnfg.supabase.co` (lo que usa scnapp.vercel.app)
- Anon keys en `.env` (local) y Vercel env vars (deploy)

### Vercel
- Proyecto: `scnapp`
- URL: `https://scnapp.vercel.app/`
- Auto-deploy desde branch `main` del repo `jpalmes-creator/SCNAPP`

### GitHub
- Repo: `https://github.com/jpalmes-creator/SCNAPP`
- Auth via `gh` CLI (instalado, autenticado como `jpalmes-creator`)

### Sentry
- Org: `scn-ww`
- Project: `javascript`
- DSN en env var `VITE_SENTRY_DSN`
- Solo activo en producción (no en `npm run dev`)

---

## 📝 Cosas pendientes / TODOs futuros

1. **Copiar schema de Supabase producción → staging** para que la app funcione completa en staging (hoy da 404 en `productos`, `clientes`, `stock`)
2. **Reemplazar Supabase del CDN** (`<script src="cdn.jsdelivr.net">` en index.html) por el paquete npm `@supabase/supabase-js` (cuando hagamos refactor mayor)
3. **Reemplazar `Object.assign(window, ...)`** por `addEventListener` en HTML (Fase 5)
4. **Tests automáticos** — al menos smoke tests de login, crear cotización, guardar producto
5. **Bundle size**: actualmente 262 KB (~102 KB gzip). Mucho de esto es Sentry. Ver si se puede tree-shake.

---

**Última actualización:** Día 1 de Fase 4 completado. Próximo: **Día 2 Cotizador.**
