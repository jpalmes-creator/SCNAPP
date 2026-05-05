// ============================================================
// CLIENTES — CRUD + datalist + tabla
// ============================================================
// Funciones expuestas:
//   - loadClis(): trae clientes a state.CLIS
//   - buildDL(): construye el <datalist> para autocomplete en cotizador
//   - aFill(): autofill de RUT y email al elegir cliente en el datalist
//   - openNewCli(), openEditCli(id), saveCli(): CRUD del modal
//   - rCli(data), fCli(q): tabla de clientes + filtro
// ============================================================

import { state } from './core/state.js';
import { sb } from './core/supabase.js';
import { showToast, openModal, closeModal } from './core/ui.js';
import { $$ } from './core/utils.js';

// ─── Cargar clientes desde Supabase ───
export async function loadClis() {
  const { data } = await sb.from('clientes').select('*').order('nombre');
  state.CLIS = data || [];
}

// ─── Construir <datalist> con clientes (para autocomplete en cotizador) ───
export function buildDL() {
  document.getElementById('cll').innerHTML = state.CLIS.map(c =>
    `<option value="${c.nombre}" data-rut="${c.rut}" data-em="${c.email || ''}">`
  ).join('');
}

// ─── Autofill de RUT/email en cotizador al elegir cliente ───
export function aFill() {
  const v = document.getElementById('qcl').value;
  const c = state.CLIS.find(x => x.nombre === v);
  if (c) {
    document.getElementById('qrt').value = c.rut || '';
    document.getElementById('qem').value = c.email || '';
  }
}

// ─── Tabla de clientes + filtro ───
export function rCli(data) {
  document.getElementById('clitb').innerHTML = data.slice(0, 100).map(c => `<tr>
    <td class="mn" style="font-size:11px">${c.rut}</td>
    <td style="font-weight:600">${c.nombre}</td>
    <td><span class="bdg b${c.segmento === 'VIP' ? 'vip' : c.segmento === 'MEDIANO' ? 'med' : 'peq'}">${c.segmento || '—'}</span></td>
    <td class="mn">${$$(c.total_ventas_2025)}</td>
    <td style="color:var(--g500);font-size:11px">${c.email || '—'}</td>
    <td style="font-size:11px">${c.telefono || '—'}</td>
    <td><button onclick="openEditCli('${c.id}')" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--g400);" onmouseover="this.style.color='var(--blue)'" onmouseout="this.style.color='var(--g400)'">✏️</button></td>
  </tr>`).join('');
}

export function fCli(q) {
  rCli(state.CLIS.filter(c =>
    !q
    || c.nombre.toLowerCase().includes(q.toLowerCase())
    || c.rut.includes(q)
  ));
}

// ─── CRUD MODAL ───

export function openNewCli() {
  document.getElementById('modal-cli-title').textContent = 'Nuevo cliente';
  document.getElementById('cli-edit-id').value = '';
  ['cli-nm', 'cli-rut', 'cli-em', 'cli-tel', 'cli-cnt', 'cli-dir', 'cli-notas']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('cli-seg').value = 'PEQUEÑO';
  document.getElementById('cli-dc').value = '30';
  openModal('modal-cli');
}

export async function openEditCli(id) {
  const c = state.CLIS.find(x => x.id === id);
  if (!c) return;
  document.getElementById('modal-cli-title').textContent = 'Editar cliente';
  document.getElementById('cli-edit-id').value = c.id;
  document.getElementById('cli-nm').value = c.nombre || '';
  document.getElementById('cli-rut').value = c.rut || '';
  document.getElementById('cli-em').value = c.email || '';
  document.getElementById('cli-tel').value = c.telefono || '';
  document.getElementById('cli-cnt').value = c.contacto || '';
  document.getElementById('cli-dir').value = c.direccion || '';
  document.getElementById('cli-seg').value = c.segmento || 'PEQUEÑO';
  document.getElementById('cli-dc').value = c.dias_credito || 30;
  document.getElementById('cli-notas').value = c.notas || '';
  openModal('modal-cli');
}

export async function saveCli() {
  const editId = document.getElementById('cli-edit-id').value;
  const nm = document.getElementById('cli-nm').value.trim();
  const rut = document.getElementById('cli-rut').value.trim();
  if (!nm || !rut) { showToast('Nombre y RUT son obligatorios'); return; }
  const payload = {
    nombre: nm, rut: rut,
    email: document.getElementById('cli-em').value.trim() || null,
    telefono: document.getElementById('cli-tel').value.trim() || null,
    contacto: document.getElementById('cli-cnt').value.trim() || null,
    direccion: document.getElementById('cli-dir').value.trim() || null,
    segmento: document.getElementById('cli-seg').value,
    dias_credito: parseInt(document.getElementById('cli-dc').value) || 30,
    notas: document.getElementById('cli-notas').value.trim() || null,
  };
  let error;
  if (editId) {
    ({ error } = await sb.from('clientes').update(payload).eq('id', editId));
  } else {
    ({ error } = await sb.from('clientes').insert({ ...payload, total_ventas_2025: 0 }));
  }
  if (error) { showToast('Error: ' + error.message); return; }
  showToast(editId ? '✓ Cliente actualizado' : '✓ Cliente creado');
  closeModal('modal-cli');
  await loadClis();
  buildDL();
  rCli(state.CLIS);
}
