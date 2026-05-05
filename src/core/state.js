// ============================================================
// ESTADO GLOBAL COMPARTIDO
// ============================================================
// Todo el estado mutable de la app vive acá. Los demás módulos
// lo importan con `import { state } from './core/state.js'` y
// leen/escriben con `state.X`.
//
// El objeto `state` se exporta como const, pero sus PROPIEDADES
// son mutables. Esto permite que cuando un módulo modifica
// `state.Q = []`, todos los otros módulos ven el cambio.
//
// Por qué un objeto y no `export let`:
//   - Permite mutar desde cualquier módulo (no solo el origen)
//   - Evita conflictos de nombre con funciones (ej: setFS ya existe)
//   - Es trivial agregar nuevo estado: solo añadir una propiedad
// ============================================================

export const state = {
  // ─── Auth / sesión ───
  ME: null,        // usuario logueado (objeto de Supabase Auth)
  ROLE: null,      // 'admin' | 'gerente' | 'vendedor'
  UNAME: null,     // nombre legible del usuario

  // ─── Caches de datos cargados desde Supabase ───
  PRODS: [],       // productos activos
  SMAP: {},        // mapa de stock por producto: { [prodId]: {q, a, l, t} }
  CLIS: [],        // clientes
  FICHAS: [],      // fichas técnicas

  // ─── Cotización en curso ───
  Q: [],           // items del carrito: [{id, prod, qty, tipo, up}]
  QNUM: 74815,     // número de la próxima cotización
  QUOTE_BUSY: false, // lock global mientras se guarda/genera PDF

  // ─── Filtros del catálogo ───
  FB: '',          // filtro por marca
  FT: '',          // filtro por tipo de uso
  FS: '',          // filtro por stock ('si'/'no'/'')

  // ─── Filtros de fichas técnicas ───
  FIC_SEG: '',     // filtro por segmento
  FIC_Q: '',       // texto búsqueda

  // ─── Estado del modal de PDF ───
  PREVIEW_PDF_HTML: '',
  PREVIEW_EMAIL: '',
  PREVIEW_NUM: '',
  PREVIEW_SHOULD_CLEAR_Q: false, // si al cerrar el modal hay que limpiar el carrito
};

// Helpers convenientes para mutaciones agrupadas
export function clearPreview() {
  state.PREVIEW_PDF_HTML = '';
  state.PREVIEW_EMAIL = '';
  state.PREVIEW_NUM = '';
  state.PREVIEW_SHOULD_CLEAR_Q = false;
}

export function setPreview(html, email, num, shouldClearQ) {
  state.PREVIEW_PDF_HTML = html || '';
  state.PREVIEW_EMAIL = email || '';
  state.PREVIEW_NUM = num || '';
  state.PREVIEW_SHOULD_CLEAR_Q = !!shouldClearQ;
}
