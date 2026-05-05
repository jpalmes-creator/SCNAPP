// ============================================================
// DASHBOARD — KPIs, ranking de clientes, cotizaciones del mes
// ============================================================

import { state } from './core/state.js';
import { sb } from './core/supabase.js';
import { $$ } from './core/utils.js';

/**
 * Formatea con M para millones: 1,250,000 → "$1.3M"
 */
export function fmt(n) {
  return n >= 1000000 ? '$' + (n / 1000000).toFixed(1) + 'M' : $$(n);
}

export async function loadDash() {
  const mes = parseInt(document.getElementById('dmes')?.value || new Date().getMonth());
  const anio = new Date().getFullYear();
  const start = new Date(anio, mes, 1).toISOString();
  const end = new Date(anio, mes + 1, 0, 23, 59, 59).toISOString();
  const today = new Date().toISOString().split('T')[0];

  const [hoy, mesD, pend, crit, top] = await Promise.all([
    sb.from('cotizaciones').select('total').gte('created_at', today).eq('estado', 'aprobada'),
    sb.from('cotizaciones').select('numero,cliente_nombre,cliente_rut,total,neto,created_at').gte('created_at', start).lte('created_at', end).eq('estado', 'aprobada').order('created_at', { ascending: false }),
    sb.from('cotizaciones').select('id', { count: 'exact', head: true }).eq('estado', 'pendiente'),
    sb.from('stock').select('producto_id').eq('cantidad', 0),
    sb.from('cotizaciones').select('cliente_nombre,total').gte('created_at', start).lte('created_at', end).eq('estado', 'aprobada'),
  ]);

  const mh = (hoy.data || []).reduce((a, c) => a + (c.total || 0), 0);
  const mm = (mesD.data || []).reduce((a, c) => a + (c.total || 0), 0);

  document.getElementById('dh').textContent = (hoy.data || []).length;
  document.getElementById('dhm').textContent = fmt(mh);
  document.getElementById('dm').textContent = fmt(mm);
  document.getElementById('dp').textContent = pend.count || 0;
  document.getElementById('dc').textContent = (crit.data || []).length;

  document.getElementById('dashtb').innerHTML = (mesD.data || []).map(c => `<tr>
    <td class="mn">#${c.numero}</td>
    <td>
      <div style="font-weight:600">${c.cliente_nombre}</div>
      <div style="font-size:10px;color:var(--g500)">${c.cliente_rut || ''}</div>
    </td>
    <td class="mn">${$$(c.total)}</td>
    <td class="mn" style="color:var(--g500)">${$$(c.neto)}</td>
    <td style="font-size:11px">${new Date(c.created_at).toLocaleDateString('es-CL')}</td>
  </tr>`).join('') || '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--g500)">Sin cotizaciones aprobadas este mes</td></tr>';

  // Ranking de clientes top
  const cm = {};
  (top.data || []).forEach(c => { cm[c.cliente_nombre] = (cm[c.cliente_nombre] || 0) + (c.total || 0); });
  const tl = Object.entries(cm).sort((a, b) => b[1] - a[1]).slice(0, 8);
  document.getElementById('topcli').innerHTML = tl.length
    ? tl.map(([n, t], i) => `
      <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--g100);">
        <div style="width:20px;height:20px;border-radius:50%;background:${i < 3 ? 'var(--red)' : 'var(--g200)'};color:${i < 3 ? 'white' : 'var(--g700)'};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0;">${i + 1}</div>
        <div style="flex:1;font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${n}</div>
        <div style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--green)">${fmt(t)}</div>
      </div>`).join('')
    : '<div style="text-align:center;padding:16px;color:var(--g500);font-size:12px;">Sin ventas este mes</div>';
}
