// ============================================================
// COTIZADOR — Catálogo (productos + servicios + filtros)
// ============================================================
// - getFilt(): aplica filtros FB/FT/FS al listado de productos
// - renderCat(): re-render debounced del grid de productos
// - renderSvcs(): render de la lista de servicios
// - setFS/st2/sb2*/setTab: handlers de filtros y tabs
// - TCLASS: mapea tipo de uso a clase CSS
//
// Depende de:
//   - state (PRODS, SMAP, Q, FB, FT, FS)
//   - SVCS (servicios)
//   - $$ (formato moneda)
//
// Las funciones de filtro/tab se exportan y main.js las pone en window
// para los onclick="" inline del HTML.
// ============================================================

import { state } from '../core/state.js';
import { $$ } from '../core/utils.js';
import { SVCS } from './services.js';

// ─── Mapa de clase CSS según tipo de uso ───
export function TCLASS(t) {
  return {
    DIRECCIONAL: 'D', TRACCION: 'T', MIXTO: 'M', FAENERO: 'F',
    'CITY/TOURING': 'CT', SPORT: 'SP', SUV: 'SV',
    'ALL TERRAIN': 'AT', 'MUD TERRAIN': 'MT',
    COMERCIAL: 'CO', LLANTA: 'LL', CAMARA: 'CA',
  }[t] || 'OT';
}

// ─── Aplicar filtros ───
export function getFilt() {
  const q = (document.getElementById('psr')?.value || '').toLowerCase();
  return state.PRODS.filter(p => {
    if (state.FS) {
      const s = state.SMAP[p.id] || { t: 0 };
      if (state.FS === 'si' && s.t <= 0) return false;
      if (state.FS === 'no' && s.t > 0) return false;
    }
    if (state.FB && p.marca !== state.FB) return false;
    if (state.FT && p.tipo_uso !== state.FT) return false;
    if (q
      && !p.descripcion?.toLowerCase().includes(q)
      && !p.marca?.toLowerCase().includes(q)
      && !p.medida?.toLowerCase().includes(q)
      && !p.modelo?.toLowerCase().includes(q)) return false;
    return true;
  });
}

// ─── Render del grid de productos (debounced 60ms) ───
let _rcTimer = null;
export function renderCat() {
  clearTimeout(_rcTimer);
  _rcTimer = setTimeout(_renderCat, 60);
}

function _renderCat() {
  const items = getFilt();
  const inQ = new Set(state.Q.map(i => i.id));
  const grid = document.getElementById('pgrd');
  document.getElementById('pct').textContent = items.length + ' neumáticos';
  if (!items.length) {
    grid.innerHTML = '<div class="empty"><div class="ei">🔍</div>Sin resultados</div>';
    return;
  }
  grid.innerHTML = items.slice(0, 60).map(p => {
    const s = state.SMAP[p.id] || { t: 0 };
    const sc = s.t > 5 ? 'sok' : s.t > 0 ? 'slow' : 'szero';
    const sl = s.t > 0 ? s.t + ' ud.' : 'Sin stock';
    const tc = TCLASS(p.tipo_uso);
    const img = p.foto_url
      ? `<img src="${p.foto_url}" alt="" onerror="this.style.display='none'">`
      : `<span class="p-ni">🛞</span>`;
    return `<div class="pcard ${inQ.has(p.id) ? 'pk' : ''}" onclick="addI('${p.id}','n')">
      <div class="p-img">${img}
        <button class="p-photo-btn" onclick="event.stopPropagation()">📷 Foto<input type="file" accept="image/*" onchange="upPhoto(event,'${p.id}')"></button>
      </div>
      <div class="p-inf">
        <div class="p-brand">${p.marca || '—'}</div>
        <div class="p-name">${p.medida || ''} ${p.modelo || ''}</div>
        <div class="p-bot"><span class="p-tipo t${tc}">${p.tipo_uso || ''}</span><span class="p-stk ${sc}">${sl}</span></div>
        <div class="p-price">${$$(p.precio_venta)}</div>
      </div>
      <button class="p-add">${inQ.has(p.id) ? '✓' : '+'}</button>
    </div>`;
  }).join('');
  if (items.length > 60) {
    grid.innerHTML += `<div style="grid-column:1/-1;text-align:center;padding:12px;color:var(--g500);font-size:11px;">Mostrando 60 de ${items.length} — usa el buscador para filtrar</div>`;
  }
}

// ─── Render de la lista de servicios ───
export function renderSvcs() {
  const inQ = new Set(state.Q.map(i => i.id));
  document.getElementById('svl').innerHTML = SVCS.map(s => `
    <div class="sv-row ${inQ.has(s.id) ? 'pk' : ''}" onclick="addI('${s.id}','s')">
      <span class="sv-ic">${s.ic}</span>
      <span class="sv-nm">${s.nm}</span>
      <span class="sv-pr">${$$(s.pr)}</span>
      <button class="sv-add">${inQ.has(s.id) ? '✓' : '+'}</button>
    </div>`).join('');
}

// ─── Handlers de filtros y tabs ───
export function fp() { renderCat(); }

export function setFS(v, btn) {
  state.FS = v;
  document.querySelectorAll('#stk-tog button').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  renderCat();
}

export function sb2sel(v) { state.FB = v; renderCat(); }
export function sb2(v, btn) { state.FB = v; renderCat(); }
export function sb2mob(v) { state.FB = v; renderCat(); }

export function st2(v, btn) {
  state.FT = v;
  document.querySelectorAll('#tch .chip').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  renderCat();
}

export function setTab(t, btn) {
  document.getElementById('pn').style.display = t === 'n' ? 'block' : 'none';
  document.getElementById('ps').style.display = t === 's' ? 'block' : 'none';
  document.getElementById('tn').className = 't-btn' + (t === 'n' ? ' on' : '');
  document.getElementById('ts').className = 't-btn' + (t === 's' ? ' on' : '');
  if (t === 's') renderSvcs();
}
