// ============================================================
// COTIZADOR — Carrito (Cart)
// ============================================================
// Maneja el estado del carrito: agregar, quitar, cambiar cantidad/precio,
// re-render del panel del carrito, totales, lock global mientras se guarda.
//
// Depende de:
//   - state (lectura/escritura de state.Q, state.QUOTE_BUSY, state.PRODS)
//   - SVCS (catálogo de servicios)
//   - showToast (avisos visuales)
//   - $$ (formato de moneda)
//   - renderCat (callback inyectado para refrescar catálogo)
//   - renderSvcs (callback inyectado para refrescar servicios)
//
// Los callbacks de catálogo se inyectan vía registerCatalogRender() para
// evitar dependencia circular cart ↔ catalog.
// ============================================================

import { state } from '../core/state.js';
import { showToast } from '../core/ui.js';
import { $$ } from '../core/utils.js';
import { SVCS } from './services.js';

// ─── Callbacks del catálogo (inyectados por catalog.js) ───
let _renderCat = () => {};
let _renderSvcs = () => {};

export function registerCatalogRender({ renderCat, renderSvcs } = {}) {
  if (renderCat) _renderCat = renderCat;
  if (renderSvcs) _renderSvcs = renderSvcs;
}

// ─── Acciones del carrito ───

export function addI(id, tipo) {
  const prod = tipo === 'n'
    ? state.PRODS.find(p => p.id === id)
    : SVCS.find(s => s.id === id);
  if (!prod) return;
  const ex = state.Q.find(i => i.id === id);
  if (ex) { ex.qty++; showToast('+1 agregado'); }
  else {
    state.Q.push({
      id, prod, qty: 1, tipo,
      up: tipo === 'n' ? prod.precio_venta : prod.pr,
    });
    showToast('Agregado');
  }
  rQ();
  _renderCat();
  if (document.getElementById('ps')?.style.display !== 'none') _renderSvcs();
}

export function chQty(id, d) {
  const i = state.Q.find(x => x.id === id);
  if (!i) return;
  i.qty += d;
  if (i.qty <= 0) state.Q = state.Q.filter(x => x.id !== id);
  rQ();
  _renderCat();
}

export function setQty(id, v) {
  const i = state.Q.find(x => x.id === id);
  if (!i) return;
  const qty = Math.max(1, parseInt(v) || 1);
  if (qty === i.qty) return;
  i.qty = qty;
  rQ();
  _renderCat();
}

export function rmI(id) {
  state.Q = state.Q.filter(i => i.id !== id);
  rQ();
  _renderCat();
}

export function upP(id, v) {
  const i = state.Q.find(x => x.id === id);
  if (!i) return;
  i.up = parseFloat(v) || 0;
  const el = document.getElementById('qs-' + id);
  if (el) el.textContent = $$(i.up * i.qty);
  rcTot();
}

// ─── Totales ───

export function rcTot() {
  const n = state.Q.reduce((a, i) => a + i.up * i.qty, 0);
  const iv = Math.round(n * 0.19);
  document.getElementById('tn2').textContent = $$(n);
  document.getElementById('ti').textContent = $$(iv);
  document.getElementById('tt').textContent = $$(n + iv);
}

export function calcQuoteTotals(items) {
  const neto = (items || []).reduce((a, i) => a + (Number(i.up) || 0) * (Number(i.qty) || 0), 0);
  const iva = Math.round(neto * 0.19);
  return { neto, iva, total: neto + iva };
}

// ─── Snapshot inmutable del carrito (para evitar race conditions en saves async) ───

export function snapshotQ() {
  return state.Q.map(i => ({
    id: i.id,
    tipo: i.tipo,
    qty: Math.max(1, parseInt(i.qty) || 1),
    up: Number(i.up) || 0,
    prod: { ...i.prod },
  }));
}

// ─── Lock global y sync de botones de cotización ───

export function syncQuoteButtons() {
  const hasItems = state.Q.length > 0;
  const bp = document.getElementById('bpdf');
  const ba = document.getElementById('bapr');
  const bf = document.getElementById('bfic');
  if (bp) bp.disabled = state.QUOTE_BUSY || !hasItems;
  if (ba) ba.disabled = state.QUOTE_BUSY || !hasItems;
  if (bf) bf.disabled = state.QUOTE_BUSY || !hasItems;
}

export function setQuoteBusy(busy) {
  state.QUOTE_BUSY = !!busy;
  syncQuoteButtons();
}

// ─── Badge de carrito mobile ───

export function updateMobCart() {
  const badge = document.getElementById('mob-cart-n');
  const btn = document.getElementById('mob-cart');
  if (!badge || !btn) return;
  if (state.Q.length > 0) {
    badge.textContent = state.Q.length;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

// ─── Render del panel del carrito ───

export function rQ() {
  const list = document.getElementById('qilist');
  const empty = document.getElementById('qpempty');
  const tots = document.getElementById('qtots');
  if (!state.Q.length) {
    empty.style.display = 'flex';
    list.innerHTML = '';
    tots.style.display = 'none';
    syncQuoteButtons();
    updateMobCart();
    return;
  }
  empty.style.display = 'none';
  tots.style.display = 'block';
  syncQuoteButtons();
  const neu = state.Q.filter(i => i.tipo === 'n');
  const svc = state.Q.filter(i => i.tipo === 's');
  let h = '';
  if (neu.length) {
    const cnt = neu.reduce((a, i) => a + i.qty, 0);
    h += `<div class="qsec">Neumáticos <span class="qsec-b">${cnt}</span></div>`;
    h += neu.map(item => {
      const ph = item.prod.foto_url;
      return `<div class="qi">
        <div class="qi-img">${ph ? `<img src="${ph}">` : '🛞'}</div>
        <div style="min-width:0;">
          <div class="qi-br">${item.prod.marca || '—'}</div>
          <div class="qi-nm">${item.prod.medida || ''} ${item.prod.modelo || ''}</div>
          <input class="qi-pi" type="number" value="${item.up}" onchange="upP('${item.id}',this.value)" onfocus="this.style.borderColor='var(--red)'" onblur="this.style.borderColor='var(--g200)'">
          <div class="qi-ctrl">
            <button class="qcb" onclick="chQty('${item.id}',-1)">−</button>
            <input type="number" class="qcn" value="${item.qty}" min="1" onchange="setQty('${item.id}',this.value)" onclick="this.select()">
            <button class="qcb" onclick="chQty('${item.id}',1)">+</button>
          </div>
        </div>
        <div class="qi-r">
          <div class="qi-sub" id="qs-${item.id}">${$$(item.up * item.qty)}</div>
          <button class="qi-rm" onclick="rmI('${item.id}')">✕</button>
        </div>
      </div>`;
    }).join('');
  }
  if (svc.length) {
    const cnt = svc.reduce((a, i) => a + i.qty, 0);
    h += `<div class="qsec" style="margin-top:8px">Servicios <span class="qsec-b">${cnt}</span></div>`;
    h += svc.map(item => `<div class="qi">
      <div class="qi-img">${item.prod.ic}</div>
      <div style="min-width:0;">
        <div class="qi-br" style="color:var(--g500)">SERVICIO</div>
        <div class="qi-nm">${item.prod.nm}</div>
        <input class="qi-pi" type="number" value="${item.up}" onchange="upP('${item.id}',this.value)" onfocus="this.style.borderColor='var(--red)'" onblur="this.style.borderColor='var(--g200)'">
        <div class="qi-ctrl">
          <button class="qcb" onclick="chQty('${item.id}',-1)">−</button>
          <span class="qcn">${item.qty}</span>
          <button class="qcb" onclick="chQty('${item.id}',1)">+</button>
        </div>
      </div>
      <div class="qi-r">
        <div class="qi-sub" id="qs-${item.id}">${$$(item.up * item.qty)}</div>
        <button class="qi-rm" onclick="rmI('${item.id}')">✕</button>
      </div>
    </div>`).join('');
  }
  list.innerHTML = h;
  rcTot();
  updateMobCart();
}
