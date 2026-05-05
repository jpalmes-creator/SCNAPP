// ============================================================
// ROUTER — navegación entre páginas + helpers móviles
// ============================================================
// go(pg, btn): cambia de página y dispara el loader correspondiente
// toggleSidebar / closeSidebar / toggleMobCart: sidebars y carrito mobile
// initGmailToken: stub legacy (sin uso actualmente)

import { state } from './core/state.js';
import { rCli } from './clientes.js';
import { rStk, rPre, rCrit } from './productos.js';
import { loadApr } from './aprobaciones.js';
import { loadDash } from './dashboard.js';
import { loadAll, loadMis } from './mis-cotizaciones.js';
import { loadFichas } from './fichas.js';

const PTITLES = {
  cot: 'Cotizador',
  mis: 'Mis Cotizaciones',
  cli: 'Clientes',
  stk: 'Stock Disponible',
  apr: 'Aprobaciones',
  dash: 'Dashboard',
  pre: 'Precios',
  all: 'Todas las Cotizaciones',
  crit: 'Stock Crítico',
  imp: 'Importar Stock',
  fic: 'Fichas Técnicas',
};

export function go(pg, btn) {
  closeSidebar();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('on'));
  document.querySelectorAll('.nb').forEach(b => b.classList.remove('on'));
  const el = document.getElementById('pg-' + pg);
  if (el) el.classList.add('on');
  if (btn) btn.classList.add('on');
  document.getElementById('pg-title').textContent = PTITLES[pg] || pg;
  const mc = document.getElementById('mob-cart');
  if (mc) mc.style.display = (pg === 'cot') ? '' : 'none';
  document.querySelector('.qp')?.classList.remove('mob-open');

  // Loaders por página
  if (pg === 'mis')  loadMis();
  if (pg === 'cli')  rCli(state.CLIS);
  if (pg === 'stk')  rStk(state.PRODS);
  if (pg === 'apr')  loadApr();
  if (pg === 'dash') loadDash();
  if (pg === 'pre')  rPre(state.PRODS);
  if (pg === 'all')  loadAll();
  if (pg === 'crit') rCrit();
  if (pg === 'fic')  loadFichas();
}

export function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.querySelector('.sidebar-overlay').classList.toggle('show');
}

export function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.querySelector('.sidebar-overlay').classList.remove('show');
}

export function toggleMobCart() {
  document.querySelector('.qp').classList.toggle('mob-open');
}

// Stub legacy — antes era para Gmail OAuth, ahora no se usa
export function initGmailToken() {}
