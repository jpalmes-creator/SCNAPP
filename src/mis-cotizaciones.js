// ============================================================
// MIS COTIZACIONES + TODAS LAS COTIZACIONES
// ============================================================
// loadMis(): cotizaciones del vendedor logueado en el día de hoy
// loadAll(): todas las cotizaciones (con paginación 200) — para gerentes/admin

import { state } from './core/state.js';
import { sb } from './core/supabase.js';
import { $$ } from './core/utils.js';

export async function loadMis() {
  const today = new Date().toISOString().split('T')[0];
  const { data } = await sb.from('cotizaciones')
    .select('id,numero,cliente_nombre,forma_pago,total,estado,created_at,cliente_email')
    .eq('creado_por', state.ME.id)
    .gte('created_at', today)
    .order('created_at', { ascending: false });
  const tb = document.getElementById('mistb');
  if (!data?.length) {
    tb.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--g500)">Sin cotizaciones hoy</td></tr>';
    return;
  }
  tb.innerHTML = data.map(c => `<tr>
    <td class="mn">#${c.numero}</td>
    <td style="font-weight:600">${c.cliente_nombre}</td>
    <td>${c.forma_pago}</td>
    <td class="mn">${$$(c.total)}</td>
    <td><span class="bdg b${c.estado === 'pendiente' ? 'pend' : c.estado === 'aprobada' ? 'aprov' : c.estado === 'rechazada' ? 'rech' : 'borr'}">${c.estado.toUpperCase()}</span></td>
    <td>${new Date(c.created_at).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}</td>
    <td><button onclick="previewCot(${c.id})" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--g500);" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--g500)'">📄</button></td>
  </tr>`).join('');
  const b = document.getElementById('nb-m');
  if (b) { b.textContent = data.length; b.style.display = 'inline-block'; }
}

export async function loadAll() {
  const tb = document.getElementById('alltb');
  tb.innerHTML = '<tr><td colspan="7"><div class="loading"><div class="spin"></div>Cargando...</div></td></tr>';
  const { data, error } = await sb.from('cotizaciones')
    .select('id,numero,cliente_nombre,cliente_rut,total,neto,estado,created_at,forma_pago,cliente_email')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error || !data?.length) {
    tb.innerHTML = '<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--g500)">Sin cotizaciones guardadas</td></tr>';
    return;
  }
  tb.innerHTML = data.map(c => `<tr>
    <td class="mn">#${c.numero}</td>
    <td><div style="font-weight:600">${c.cliente_nombre || '—'}</div></td>
    <td style="font-size:11px;color:var(--g500)">${c.cliente_rut || '—'}</td>
    <td class="mn">${$$(c.total)}</td>
    <td><span class="bdg b${c.estado === 'pendiente' ? 'pend' : c.estado === 'aprobada' ? 'aprov' : c.estado === 'rechazada' ? 'rech' : 'borr'}">${c.estado.toUpperCase()}</span></td>
    <td style="font-size:11px">${new Date(c.created_at).toLocaleDateString('es-CL')}</td>
    <td><button onclick="previewCot(${c.id})" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--g500);" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--g500)'">📄</button></td>
  </tr>`).join('');
}
