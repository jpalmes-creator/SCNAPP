// ============================================================
// HELPERS DE UI
// Funciones genéricas para mostrar toasts y abrir/cerrar modales.
// ============================================================

/**
 * Muestra un mensaje tipo "toast" en la parte inferior de la pantalla.
 * El elemento #toast tiene que existir en el HTML.
 * @param {string} m - mensaje a mostrar
 */
export function showToast(m) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = m;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2200);
}

/**
 * Muestra un modal por id.
 * @param {string} id - id del elemento modal a mostrar
 */
export function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'flex';
}

/**
 * Oculta un modal por id.
 * @param {string} id - id del elemento modal a ocultar
 */
export function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.style.display = 'none';
}
