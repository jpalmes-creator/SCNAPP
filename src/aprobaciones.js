// ============================================================
// APROBACIONES — pendientes, aprobar/rechazar, badge, ver PDF
// ============================================================
// Funciones expuestas:
//   - loadApr(): trae cotizaciones pendientes y renderiza
//   - loadABadge(): actualiza el badge del menú con la cantidad pendiente
//   - upAI(cid, iid, qty, v): actualizar precio inline en aprobaciones
//   - aprQ(id, num, cli): aprobar cotización (con ajustes de precio)
//   - rejQ(id): rechazar cotización
//   - dlAPDF(cid): ver PDF de una cotización pendiente
//   - previewCot(id): ver PDF de cualquier cotización (para "Todas")
//
// Las cantidades de items por cotización se guardan temporalmente
// en window['it_'+cid] (legacy del código original).
// ============================================================

import { state } from './core/state.js';
import { sb } from './core/supabase.js';
import { showToast } from './core/ui.js';
import { $$ } from './core/utils.js';
import { buildPDF, buildFichaPage } from './core/pdf.js';
import { openPDF } from './cotizador/pdf-modal.js';

// ─── Badge en el menú lateral (cotizaciones pendientes) ───
export async function loadABadge() {
  const { count } = await sb.from('cotizaciones')
    .select('id', { count: 'exact', head: true })
    .eq('estado', 'pendiente');
  const b = document.getElementById('nb-a');
  if (!b) return;
  b.textContent = count || 0;
  b.style.display = count ? 'inline-block' : 'none';
}

// ─── Cargar y renderizar cotizaciones pendientes ───
export async function loadApr() {
  const { data } = await sb.from('cotizaciones')
    .select('*,cotizacion_items(*)')
    .eq('estado', 'pendiente')
    .order('created_at');
  const grid = document.getElementById('aprg');
  if (!data?.length) {
    grid.innerHTML = '<div class="empty"><div class="ei">✅</div>Sin cotizaciones pendientes</div>';
    return;
  }
  grid.innerHTML = data.map(c => {
    const items = c.cotizacion_items || [];
    window['it_' + c.id] = items.map(i => ({ ...i }));
    return `<div class="ac">
      <div class="ach">
        <div>
          <div class="acn">#${c.numero} · ${new Date(c.created_at).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</div>
          <div class="acc">${c.cliente_nombre}</div>
          <div class="acm">${c.cliente_rut || ''} · ${c.forma_pago}</div>
        </div>
        <span class="bdg bpend">PENDIENTE</span>
      </div>
      <div class="acb">
        <div class="act" id="at-${c.id}">${$$(c.total)}</div>
        <div class="ae-row"><label>Email cliente</label><input id="ae-${c.id}" type="email" placeholder="cliente@empresa.cl" value="${c.cliente_email || ''}"></div>
        <div class="ie">
          ${items.map(item => `<div class="ier">
            <div>
              <div class="ieb">${item.marca || 'SERV'}</div>
              <div class="ien">${item.descripcion}</div>
              <div class="ieq">Cant: ${item.cantidad}</div>
              <div class="iet" id="it-${c.id}-${item.id}">${$$(item.total)}</div>
            </div>
            <div><input class="iep" type="number" value="${item.precio_unit}" onchange="upAI(${c.id},${item.id},${item.cantidad},this.value)" onfocus="this.style.borderColor='var(--red)'" onblur="this.style.borderColor='var(--g200)'"></div>
          </div>`).join('')}
        </div>
        <div class="arc"><span>Total con IVA</span><strong id="ar-${c.id}">${$$(c.total)}</strong></div>
        <div class="abtns">
          <button class="baprbtn" onclick="aprQ(${c.id},'${c.numero}','${c.cliente_nombre}')">✓ Aprobar</button>
          <button class="brejbtn" onclick="rejQ(${c.id})">✗ Rechazar</button>
        </div>
        <button class="apdf" onclick="dlAPDF(${c.id})">📄 Ver PDF</button>
      </div>
    </div>`;
  }).join('');
  document.getElementById('nb-a').textContent = data.length;
}

// ─── Actualizar precio inline ───
export function upAI(cid, iid, qty, v) {
  const pr = parseFloat(v) || 0;
  const items = window['it_' + cid];
  const item = items?.find(i => i.id === iid);
  if (item) { item.precio_unit = pr; item.total = pr * qty; }
  const el = document.getElementById('it-' + cid + '-' + iid);
  if (el) el.textContent = $$(pr * qty);
  const neto = (items || []).reduce((a, i) => a + (i.total || 0), 0);
  const total = neto + Math.round(neto * 0.19);
  const r = document.getElementById('ar-' + cid);
  if (r) r.textContent = $$(total);
  const t = document.getElementById('at-' + cid);
  if (t) t.textContent = $$(total);
}

// ─── Ver PDF de una cotización pendiente ───
export async function dlAPDF(cid) {
  const { data: cot } = await sb.from('cotizaciones').select('*').eq('id', cid).single();
  if (!cot) return;
  const items = (window['it_' + cid] || []).map(i => ({
    ...i,
    prod: {
      descripcion: i.descripcion, marca: i.marca, tipo_uso: '',
      foto_url: null, ic: i.marca === 'SERVICIO' ? '🔧' : '🔵',
      nm: i.descripcion,
    },
    tipo: i.marca === 'SERVICIO' ? 's' : 'n',
    up: i.precio_unit, qty: i.cantidad,
  }));
  openPDF(buildPDF(cot, items));
}

// ─── Aprobar cotización ───
export async function aprQ(id, num, cli) {
  const em = document.getElementById('ae-' + id)?.value?.trim() || '';
  const items = window['it_' + id] || [];
  for (const i of items) {
    await sb.from('cotizacion_items').update({ precio_unit: i.precio_unit, total: i.total }).eq('id', i.id);
  }
  const neto = items.reduce((a, i) => a + (i.total || 0), 0);
  const iva = Math.round(neto * 0.19);
  const total = neto + iva;
  await sb.from('cotizaciones').update({
    estado: 'aprobada',
    aprobado_por: state.ME.id,
    aprobado_at: new Date().toISOString(),
    neto, iva, total,
    ...(em ? { cliente_email: em } : {}),
  }).eq('id', id);
  showToast('✓ Cotización #' + num + ' aprobada');
  loadApr();
  loadABadge();
  // Mostrar PDF preview con botón de enviar
  const { data: cot } = await sb.from('cotizaciones').select('*').eq('id', id).single();
  if (cot) {
    const pdfItems = (items || []).map(i => ({
      ...i,
      prod: {
        descripcion: i.descripcion, marca: i.marca, tipo_uso: '',
        foto_url: null, ic: i.marca === 'SERVICIO' ? '🔧' : '🔵',
        nm: i.descripcion,
      },
      tipo: i.marca === 'SERVICIO' ? 's' : 'n',
      up: i.precio_unit, qty: i.cantidad,
    }));
    openPDF(buildPDF({ ...cot, neto, iva, total }, pdfItems), em, num, true);
  }
}

// ─── Rechazar cotización ───
export async function rejQ(id) {
  await sb.from('cotizaciones').update({
    estado: 'rechazada',
    aprobado_por: state.ME.id,
    aprobado_at: new Date().toISOString(),
  }).eq('id', id);
  showToast('Cotización rechazada');
  loadApr();
  loadABadge();
}

// ─── Ver PDF de cualquier cotización (usado en página "Todas") ───
export async function previewCot(id) {
  const { data: cot } = await sb.from('cotizaciones').select('*,cotizacion_items(*)').eq('id', id).single();
  if (!cot) return;
  const items = (cot.cotizacion_items || []).map(i => ({
    ...i,
    prod: {
      descripcion: i.descripcion, marca: i.marca, tipo_uso: '',
      foto_url: null, ic: '🔧', nm: i.descripcion,
    },
    tipo: 'n', up: i.precio_unit, qty: i.cantidad,
  }));
  // Construir fichas técnicas a partir de los productos en la cotización
  let fichasHTML = '';
  const prodIds = [...new Set(items.map(i => i.producto_id).filter(Boolean))];
  if (prodIds.length > 0) {
    const modelMap = {};
    prodIds.forEach(pid => {
      const p = state.PRODS.find(x => x.id === pid);
      if (p && p.modelo && p.marca) {
        const k = p.marca + '|' + p.modelo + '|' + (p.medida || '');
        if (!modelMap[k]) modelMap[k] = { marca: p.marca, modelo: p.modelo, medida: p.medida || '', prod: p };
      }
    });
    if (Object.keys(modelMap).length > 0) {
      const { data: fichas } = await sb.from('fichas_tecnicas').select('*');
      Object.values(modelMap).forEach(m => {
        const f = fichas?.find(ft => ft.marca === m.marca && ft.modelo === m.modelo && (ft.medida || '') === (m.medida || ''));
        fichasHTML += buildFichaPage(
          f || { marca: m.marca, modelo: m.modelo, medida: m.medida, segmento: m.prod.tipo_vehiculo || 'CAMION', aplicacion: m.prod.tipo_uso || '' },
          [m.prod],
          fichas || [],
        );
      });
    }
  }
  const isMgr = state.ROLE === 'gerente' || state.ROLE === 'admin';
  const pdfHTML = buildPDF(cot, items);
  const fullHTML = fichasHTML ? pdfHTML.replace('</body></html>', fichasHTML + '</body></html>') : pdfHTML;
  openPDF(fullHTML, cot.cliente_email || '', cot.numero, isMgr && !!cot.cliente_email);
}
