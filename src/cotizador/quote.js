// ============================================================
// COTIZADOR — Persistencia de cotizaciones
// ============================================================
// - loadQNum(): trae el próximo número desde Supabase
// - saveQ(): guarda cotización + items con retry de QNUM
// - sendAppr(): envía como 'pendiente' (vendedores)
// - genPDF(): guarda como 'borrador' y abre el modal con vista previa
// - clearQ(): limpia carrito y formulario
//
// El callback `onApprovalSent` (típicamente loadABadge) se inyecta
// con registerApprovalHandler() para evitar dependencia con main.js.
// ============================================================

import { state, clearPreview } from '../core/state.js';
import { sb, withTimeout } from '../core/supabase.js';
import { showToast } from '../core/ui.js';
import { buildPDF, buildFichaPage } from '../core/pdf.js';
import {
  snapshotQ, calcQuoteTotals, setQuoteBusy, rQ, maybeReleaseStaleLock,
} from './cart.js';
import { renderCat, renderSvcs } from './catalog.js';
import { openPDF } from './pdf-modal.js';

// ─── Callback que main.js inyecta para refrescar el badge de aprobaciones ───
let _onApprovalSent = async () => {};
export function registerApprovalHandler({ onApprovalSent } = {}) {
  if (onApprovalSent) _onApprovalSent = onApprovalSent;
}

// ─── Cargar próximo número de cotización desde la BD ───
export async function loadQNum() {
  const { data, error } = await sb.from('cotizaciones').select('numero').order('numero', { ascending: false }).limit(1);
  if (error) {
    console.error('loadQNum error:', error);
    document.getElementById('qnum').textContent = '#' + state.QNUM;
    return state.QNUM;
  }
  state.QNUM = data && data.length ? Number(data[0].numero) + 1 : 74815;
  document.getElementById('qnum').textContent = '#' + state.QNUM;
  return state.QNUM;
}

// ─── Limpiar carrito y formulario ───
export async function clearQ(force = false, opts = { syncNum: true }) {
  const fields = ['qcl', 'qrt', 'qat', 'qem'];
  const hasForm = fields.some(id => (document.getElementById(id)?.value || '').trim());
  if (!force && (state.Q.length || hasForm) && !confirm('¿Limpiar la cotización?')) return false;
  state.Q = [];
  fields.forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const pg = document.getElementById('qpg'); if (pg) pg.value = 'Contado';
  clearPreview();
  document.querySelector('.qp')?.classList.remove('mob-open');
  rQ();
  renderCat();
  if (document.getElementById('ps')?.style.display !== 'none') renderSvcs();
  if (opts.syncNum !== false) {
    try { await loadQNum(); }
    catch (e) { console.error('No se pudo sincronizar QNUM:', e); }
  }
  return true;
}

// ─── Guardar cotización + items en Supabase ───
export async function saveQ(estado, qItems = null) {
  if (!state.ME || !state.ME.id) {
    showToast('❌ Sesión inválida. Cerrá y volvé a iniciar sesión.');
    return null;
  }
  const items = (qItems && qItems.length ? qItems : snapshotQ()).map(i => ({
    id: i.id, tipo: i.tipo,
    qty: Math.max(1, parseInt(i.qty) || 1),
    up: Number(i.up) || 0,
    prod: { ...i.prod },
  }));
  if (!items.length) {
    showToast('Agregá al menos un ítem antes de guardar.');
    return null;
  }

  const cl = document.getElementById('qcl').value || '—';
  const rt = document.getElementById('qrt').value || '—';
  const at = document.getElementById('qat').value || '—';
  const em = document.getElementById('qem').value || '';
  const pg = document.getElementById('qpg').value;
  const { neto, iva, total } = calcQuoteTotals(items);
  const cr = state.CLIS.find(c => c.nombre === cl);
  const payload = {
    cliente_id: cr?.id || null,
    cliente_nombre: cl, cliente_rut: rt, cliente_contacto: at, cliente_email: em,
    forma_pago: pg, estado, neto, iva, total,
    creado_por: state.ME.id,
  };

  // Reintentar hasta 3 veces si choca el número (caso multi-usuario)
  let cot = null, lastError = null;
  let timeoutCount = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const numero = state.QNUM;
    let data, error;
    try {
      ({ data, error } = await withTimeout(
        sb.from('cotizaciones').insert({ numero, ...payload }).select().single(),
        10000,
        'insert cotizaciones',
      ));
    } catch (e) {
      console.error('[saveQ] timeout/error:', e);
      lastError = { message: e.message };
      timeoutCount++;
      // 2 timeouts seguidos = conexión muerta, recargar la página
      if (timeoutCount >= 2 && e.message?.includes('Timeout')) {
        showToast('🔄 Conexión perdida — reconectando…');
        // Guardar carrito en localStorage para restaurarlo después del reload
        try {
          localStorage.setItem('_recoveryQ', JSON.stringify(state.Q));
          localStorage.setItem('_recoveryClient', JSON.stringify({
            cl: document.getElementById('qcl').value,
            rt: document.getElementById('qrt').value,
            at: document.getElementById('qat').value,
            em: document.getElementById('qem').value,
          }));
        } catch (e) {}
        setTimeout(() => location.reload(), 1500);
        return null;
      }
      // Primer timeout: refrescar sesión y reintentar
      if (e.message?.includes('Timeout')) {
        try { await sb.auth.refreshSession(); } catch (re) { console.warn('refresh fail:', re); }
      }
      continue;
    }
    if (!error) { cot = data; break; }
    lastError = error;
    if (error.code === '23505' || (error.message || '').toLowerCase().includes('duplicate')) {
      console.warn('QNUM ' + state.QNUM + ' ya existe, reintentando con número fresco…');
      await loadQNum();
      continue;
    }
    if ((error.message || '').includes('creado_por_fkey') || (error.message || '').includes('creado_por')) {
      showToast('❌ Tu usuario no está registrado en la tabla usuarios. Avisá al admin.');
      console.error('FK error en creado_por. ME.id =', state.ME.id, '— hay que insertarlo en tabla usuarios.');
      return null;
    }
    break;
  }
  if (!cot) {
    const msg = lastError ? lastError.message : 'Error desconocido';
    showToast('❌ ' + msg);
    console.error('saveQ falló tras reintentos:', lastError);
    return null;
  }

  state.QNUM = Math.max(state.QNUM, Number(cot.numero) + 1);
  document.getElementById('qnum').textContent = '#' + state.QNUM;

  const rows = items.map(i => ({
    cotizacion_id: cot.id,
    producto_id: i.tipo === 'n' ? i.id : null,
    descripcion: i.tipo === 'n' ? (i.prod.marca + ' ' + (i.prod.descripcion || '')) : i.prod.nm,
    marca: i.tipo === 'n' ? i.prod.marca : 'SERVICIO',
    cantidad: i.qty, precio_unit: i.up, total: i.up * i.qty,
  }));
  const { error: itemsErr } = await sb.from('cotizacion_items').insert(rows);
  if (itemsErr) {
    console.error('Error insertando items (cotizacion ya guardada):', itemsErr);
    showToast('⚠️ Cotización guardada pero items fallaron: ' + itemsErr.message);
  }
  return { ...cot, neto, iva, total };
}

// ─── Enviar cotización para aprobación (estado='pendiente') ───
export async function sendAppr() {
  maybeReleaseStaleLock(); if (state.QUOTE_BUSY) return;
  const qSnap = snapshotQ();
  if (!qSnap.length) { showToast('Agregá productos o servicios antes de enviar.'); return; }
  const btn = document.getElementById('bapr');
  const old = btn ? btn.innerHTML : '';
  setQuoteBusy(true);
  if (btn) btn.textContent = 'Enviando...';
  // Failsafe: si algo se cuelga, liberar el lock a los 30s sí o sí
  const lockTimeout = setTimeout(() => {
    console.warn('[quote] sendAppr lock timeout 30s — forzando release');
    setQuoteBusy(false);
    if (btn) btn.innerHTML = old;
  }, 30000);
  try {
    console.log('[quote] sendAppr start');
    const c = await saveQ('pendiente', qSnap);
    if (c) {
      showToast('✓ Enviada para aprobación');
      await clearQ(true, { syncNum: true });
      try { await _onApprovalSent(); }
      catch (e) { console.error('onApprovalSent error:', e); }
    }
  } catch (e) {
    showToast('Error: ' + e.message);
    console.error('sendAppr error:', e);
  } finally {
    clearTimeout(lockTimeout);
    if (btn) btn.innerHTML = old;
    setQuoteBusy(false);
    console.log('[quote] sendAppr end — lock released');
  }
}

// ─── Generar PDF de vista previa (guarda como 'borrador') ───
export async function genPDF() {
  maybeReleaseStaleLock(); if (state.QUOTE_BUSY) return;
  const qSnap = snapshotQ();
  if (!qSnap.length) { showToast('Agregá productos o servicios antes de generar PDF.'); return; }
  const btn = document.getElementById('bpdf');
  const old = btn ? btn.innerHTML : '';
  setQuoteBusy(true);
  if (btn) btn.textContent = 'Generando...';
  // Failsafe: si algo se cuelga, liberar el lock a los 30s sí o sí
  const lockTimeout = setTimeout(() => {
    console.warn('[quote] genPDF lock timeout 30s — forzando release');
    setQuoteBusy(false);
    if (btn) btn.innerHTML = old;
  }, 30000);
  try {
    console.log('[quote] genPDF start — saveQ');
    const cot = await saveQ('borrador', qSnap);
    if (!cot) { console.warn('[quote] genPDF aborted — saveQ returned null'); return; }
    console.log('[quote] genPDF — cot saved:', cot.numero);
    const email = document.getElementById('qem').value || cot.cliente_email || '';

    // Agrupar productos por (marca|modelo|medida) para incluir cada ficha solo una vez
    const modelMap = {};
    qSnap.filter(i => i.tipo === 'n' && i.prod.modelo && i.prod.marca).forEach(i => {
      const key = i.prod.marca + '|' + i.prod.modelo + '|' + (i.prod.medida || '');
      if (!modelMap[key]) {
        modelMap[key] = { marca: i.prod.marca, modelo: i.prod.modelo, medida: i.prod.medida || '', prod: i.prod };
      }
    });

    let fichasHTML = '';
    if (Object.keys(modelMap).length > 0) {
      console.log('[quote] genPDF — cargando fichas');
      const { data: fichas, error: fichasErr } = await sb.from('fichas_tecnicas').select('*');
      if (fichasErr) console.error('Error cargando fichas para PDF:', fichasErr);
      Object.values(modelMap).forEach(m => {
        const f = fichas?.find(ft => ft.marca === m.marca && ft.modelo === m.modelo && (ft.medida || '') === (m.medida || ''));
        fichasHTML += buildFichaPage(
          f || { marca: m.marca, modelo: m.modelo, medida: m.medida, segmento: m.prod.tipo_vehiculo || 'CAMION', aplicacion: m.prod.tipo_uso || '' },
          [m.prod],
          fichas || [],
        );
      });
    }

    const totals = calcQuoteTotals(qSnap);
    const pdfHTML = buildPDF({ ...cot, ...totals }, qSnap);
    const fullHTML = fichasHTML ? pdfHTML.replace('</body></html>', fichasHTML + '</body></html>') : pdfHTML;
    console.log('[quote] genPDF — abriendo modal');
    openPDF(fullHTML, email, cot.numero, !!email, true);
    showToast('Vista previa lista' + (fichasHTML ? ' (con fichas técnicas)' : ''));
  } catch (e) {
    showToast('Error al generar PDF: ' + e.message);
    console.error('genPDF error:', e);
  } finally {
    clearTimeout(lockTimeout);
    if (btn) btn.innerHTML = old;
    setQuoteBusy(false);
    console.log('[quote] genPDF end — lock released');
  }
}
