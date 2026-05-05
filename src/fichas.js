// ============================================================
// FICHAS TÉCNICAS — CRUD + tabla + modal por cotización
// ============================================================
// Funciones expuestas:
//   - loadFichas(): trae fichas de Supabase a state.FICHAS y refresca tabla
//   - rFic(list), fFic(q), setFicSeg(v, btn): tabla + filtros
//   - openFicModal(marca, modelo, medida): nueva ficha
//   - openEditFic(id): editar ficha existente
//   - saveFic(): guardar ficha (con sync de imagen a productos)
//   - cancelFic(): cerrar modal (vuelve al panel ficq si veníamos de ahí)
//   - ficSegChange(): toggle de campos según segmento (camion/auto/llanta)
//   - upFicImg(event): subir imagen para la ficha
//   - openFicQ(): panel de fichas para los productos del carrito
//   - renderFicQ(): re-render del panel ficq
// ============================================================

import { state } from './core/state.js';
import { sb } from './core/supabase.js';
import { showToast, openModal, closeModal } from './core/ui.js';
import { compImg, cleanPathPart, uniqueJpgPath } from './core/utils.js';

// ─── Estado interno del módulo (panel ficq) ───
let _ficqModels = [];
let _ficqReturnAfterSave = false;

// ============================================================
// LOAD + TABLA + FILTROS
// ============================================================

export async function loadFichas() {
  const { data } = await sb.from('fichas_tecnicas').select('*').order('marca');
  state.FICHAS = data || [];
  rFic(state.FICHAS);
}

export function rFic(list) {
  const filtered = list.filter(f => {
    if (state.FIC_SEG && f.segmento !== state.FIC_SEG) return false;
    if (state.FIC_Q) {
      const q = state.FIC_Q.toLowerCase();
      if (!f.marca?.toLowerCase().includes(q)
          && !f.modelo?.toLowerCase().includes(q)
          && !f.nombre_comercial?.toLowerCase().includes(q)) return false;
    }
    return true;
  });
  const tb = document.getElementById('fictb');
  if (!filtered.length) {
    tb.innerHTML = '<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--g500)">Sin fichas técnicas</td></tr>';
    return;
  }
  tb.innerHTML = filtered.map(f => {
    const campos = [f.telas, f.profundidad, f.li_ss, f.peso, f.indice_velocidad, f.medidas_disponibles];
    const filled = campos.filter(Boolean).length;
    const total = 5;
    const pct = Math.round(filled / total * 100);
    const stColor = pct >= 80 ? 'var(--green)' : pct >= 50 ? 'var(--amber)' : 'var(--red)';
    return `<tr>
      <td style="font-weight:700;color:var(--red);font-size:11px;">${f.marca}</td>
      <td style="font-weight:700;">${f.modelo}</td>
      <td style="font-size:11px;color:var(--g600);">${f.nombre_comercial || '—'}</td>
      <td><span style="background:${f.segmento === 'CAMION' ? '#0F172A' : '#64748B'};color:white;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;">${f.segmento}</span></td>
      <td style="font-size:11px;">${f.aplicacion || '—'}</td>
      <td style="font-size:11px;">${f.telas || '<span style="color:var(--g300)">—</span>'}</td>
      <td style="font-size:11px;">${f.li_ss || '<span style="color:var(--g300)">—</span>'}</td>
      <td style="font-size:11px;">${f.peso || '<span style="color:var(--g300)">—</span>'}</td>
      <td><span style="font-size:10px;font-weight:700;color:${stColor};">${pct}%</span></td>
      <td><button onclick="openEditFic('${f.id}')" style="background:none;border:none;cursor:pointer;font-size:14px;" title="Editar">✏️</button></td>
    </tr>`;
  }).join('');
}

export function fFic(q) { state.FIC_Q = q; rFic(state.FICHAS); }

export function setFicSeg(v, btn) {
  state.FIC_SEG = v;
  document.querySelectorAll('#fic-seg-chips .chip').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  rFic(state.FICHAS);
}

// ============================================================
// MODAL CRUD
// ============================================================

export function cancelFic() {
  closeModal('modal-fic');
  if (_ficqReturnAfterSave) {
    _ficqReturnAfterSave = false;
    setTimeout(renderFicQ, 200);
  }
}

export async function upFicImg(event) {
  const input = event.target;
  const file = input.files && input.files[0];
  if (!file) return;
  input.disabled = true;
  showToast('Subiendo imagen…');
  try {
    const comp = await compImg(file, 900);
    const marca = cleanPathPart((document.getElementById('fic-marca').value || 'fic').toUpperCase().trim());
    const modelo = cleanPathPart((document.getElementById('fic-modelo').value || 'mod').toUpperCase().trim());
    const fn = uniqueJpgPath('fichas', 'fic_' + marca + '_' + modelo);
    const { error: upErr } = await sb.storage.from('fotos-neumaticos').upload(fn, comp, {
      contentType: 'image/jpeg', cacheControl: '3600', upsert: false,
    });
    if (upErr) {
      showToast('Error al subir: ' + upErr.message);
      console.error('Storage ficha error:', upErr);
      return;
    }
    const { data: ud } = sb.storage.from('fotos-neumaticos').getPublicUrl(fn);
    const url = ud.publicUrl;
    document.getElementById('fic-img').value = url;
    const prev = document.getElementById('fic-img-preview');
    prev.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;">`;
    showToast('✓ Imagen subida');
  } catch (e) {
    showToast('Error: ' + e.message);
    console.error(e);
  } finally {
    input.value = '';
    input.disabled = false;
  }
}

export function ficSegChange() {
  const seg = document.getElementById('fic-segmento').value;
  const aplSel = document.getElementById('fic-aplicacion');
  const tireFields = document.getElementById('fic-tire-fields');
  const llantaFields = document.getElementById('fic-llanta-fields');
  if (seg === 'CAMION') {
    aplSel.innerHTML = '<option value="DIRECCIONAL">Direccional</option><option value="TRACCION">Tracción</option><option value="MIXTO">Mixto</option><option value="FAENERO">Faenero</option>';
    tireFields.style.display = 'grid';
    llantaFields.style.display = 'none';
  } else if (seg === 'AUTO') {
    aplSel.innerHTML = '<option value="CITY/TOURING">City/Touring</option><option value="SPORT">Sport</option><option value="SUV">SUV</option><option value="ALL TERRAIN">All Terrain</option><option value="MUD TERRAIN">Mud Terrain</option><option value="COMERCIAL">Comercial</option>';
    tireFields.style.display = 'grid';
    llantaFields.style.display = 'none';
  } else {
    // LLANTA
    aplSel.innerHTML = '<option value="LLANTA">Llanta</option>';
    tireFields.style.display = 'none';
    llantaFields.style.display = 'block';
  }
}

export function openFicModal(marcaPre = '', modeloPre = '', medidaPre = '') {
  document.getElementById('modal-fic-title').textContent = 'Nueva ficha técnica';
  document.getElementById('fic-edit-id').value = '';
  ['fic-marca','fic-modelo','fic-medida','fic-origen','fic-telas','fic-prof','fic-liss','fic-peso','fic-iv','fic-agujeros','fic-diametro','fic-buje','fic-material','fic-acabado','fic-ensamble','fic-img','fic-notas']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('fic-segmento').value = 'CAMION';
  // Buscar imagen ya cargada para este modelo (en fichas o productos)
  const M = marcaPre?.toUpperCase().trim();
  const MO = modeloPre?.toUpperCase().trim();
  const existImg = marcaPre && modeloPre
    ? (state.FICHAS.find(x => x.marca?.toUpperCase().trim() === M && x.modelo?.toUpperCase().trim() === MO && x.imagen_url)?.imagen_url
       || state.PRODS.find(p => p.marca?.toUpperCase().trim() === M && p.modelo?.toUpperCase().trim() === MO && p.foto_url)?.foto_url)
    : null;
  const prev = document.getElementById('fic-img-preview');
  if (existImg) {
    prev.innerHTML = `<img src="${existImg}" style="width:100%;height:100%;object-fit:cover;">`;
    document.getElementById('fic-img').value = existImg;
  } else {
    prev.innerHTML = '🛞';
  }
  ficSegChange();
  if (marcaPre) document.getElementById('fic-marca').value = marcaPre;
  if (modeloPre) document.getElementById('fic-modelo').value = modeloPre;
  if (medidaPre) document.getElementById('fic-medida').value = medidaPre;
  const marcas = [...new Set(state.PRODS.map(p => p.marca).filter(Boolean))].sort();
  document.getElementById('fic-marcas-dl').innerHTML = marcas.map(m => `<option value="${m}">`).join('');
  openModal('modal-fic');
}

export function openEditFic(id) {
  const f = state.FICHAS.find(x => x.id === id);
  if (!f) return;
  document.getElementById('modal-fic-title').textContent = 'Editar ficha: ' + f.marca + ' ' + f.modelo + (f.medida ? ' ' + f.medida : '');
  document.getElementById('fic-edit-id').value = f.id;
  document.getElementById('fic-marca').value = f.marca || '';
  document.getElementById('fic-modelo').value = f.modelo || '';
  document.getElementById('fic-medida').value = f.medida || '';
  document.getElementById('fic-segmento').value = f.segmento || 'CAMION';
  ficSegChange();
  if (f.aplicacion) document.getElementById('fic-aplicacion').value = f.aplicacion;
  document.getElementById('fic-origen').value = f.origen || '';
  document.getElementById('fic-telas').value = f.telas || '';
  document.getElementById('fic-prof').value = f.profundidad || '';
  document.getElementById('fic-liss').value = f.li_ss || '';
  document.getElementById('fic-peso').value = f.peso || '';
  document.getElementById('fic-iv').value = f.indice_velocidad || '';
  document.getElementById('fic-agujeros').value = f.numero_agujeros || '';
  document.getElementById('fic-diametro').value = f.diametro_agujeros || '';
  document.getElementById('fic-buje').value = f.buje || '';
  document.getElementById('fic-material').value = f.material || '';
  document.getElementById('fic-acabado').value = f.acabado || '';
  document.getElementById('fic-ensamble').value = f.ensamble || '';
  document.getElementById('fic-img').value = f.imagen_url || '';
  const prev = document.getElementById('fic-img-preview');
  if (f.imagen_url) {
    prev.innerHTML = `<img src="${f.imagen_url}" style="width:100%;height:100%;object-fit:cover;">`;
  } else {
    prev.innerHTML = '🛞';
  }
  document.getElementById('fic-notas').value = f.notas || '';
  const marcas = [...new Set(state.PRODS.map(p => p.marca).filter(Boolean))].sort();
  document.getElementById('fic-marcas-dl').innerHTML = marcas.map(m => `<option value="${m}">`).join('');
  openModal('modal-fic');
}

export async function saveFic() {
  const id = document.getElementById('fic-edit-id').value;
  const obj = {
    marca: document.getElementById('fic-marca').value.toUpperCase().trim(),
    modelo: document.getElementById('fic-modelo').value.toUpperCase().trim(),
    medida: document.getElementById('fic-medida').value.trim() || null,
    segmento: document.getElementById('fic-segmento').value,
    aplicacion: document.getElementById('fic-aplicacion').value,
    origen: document.getElementById('fic-origen').value.trim() || null,
    telas: document.getElementById('fic-telas').value.trim() || null,
    profundidad: document.getElementById('fic-prof').value.trim() || null,
    li_ss: document.getElementById('fic-liss').value.trim() || null,
    peso: document.getElementById('fic-peso').value.trim() || null,
    indice_velocidad: document.getElementById('fic-iv').value.trim() || null,
    numero_agujeros: document.getElementById('fic-agujeros').value.trim() || null,
    diametro_agujeros: document.getElementById('fic-diametro').value.trim() || null,
    buje: document.getElementById('fic-buje').value.trim() || null,
    material: document.getElementById('fic-material').value.trim() || null,
    acabado: document.getElementById('fic-acabado').value.trim() || null,
    ensamble: document.getElementById('fic-ensamble').value.trim() || null,
    imagen_url: document.getElementById('fic-img').value.trim() || null,
    notas: document.getElementById('fic-notas').value.trim() || null,
    updated_at: new Date().toISOString(),
  };
  if (!obj.marca || !obj.modelo) { showToast('Marca y modelo son obligatorios'); return; }
  let error;
  try {
    if (id) ({ error } = await sb.from('fichas_tecnicas').update(obj).eq('id', id));
    else    ({ error } = await sb.from('fichas_tecnicas').insert(obj));
  } catch (e) {
    showToast('Error JS: ' + e.message);
    console.error(e);
    return;
  }
  if (error) { showToast('❌ ' + error.message); console.error('Supabase error:', error); return; }
  // La foto es por modelo — sincronizar a TODAS las fichas Y productos del mismo (marca, modelo)
  if (obj.imagen_url) {
    try {
      await sb.from('fichas_tecnicas').update({ imagen_url: obj.imagen_url }).ilike('marca', obj.marca).ilike('modelo', obj.modelo);
      await sb.from('productos').update({ foto_url: obj.imagen_url }).ilike('marca', obj.marca).ilike('modelo', obj.modelo);
    } catch (e) {
      console.warn('Sync foto ficha→productos falló (no crítico):', e);
    }
    state.PRODS.forEach(p => {
      if (p.marca && p.modelo
          && p.marca.toUpperCase().trim() === obj.marca
          && p.modelo.toUpperCase().trim() === obj.modelo) {
        p.foto_url = obj.imagen_url;
      }
    });
  }
  showToast(id ? '✓ Ficha actualizada' : '✓ Ficha creada');
  closeModal('modal-fic');
  loadFichas();
  if (_ficqReturnAfterSave) {
    _ficqReturnAfterSave = false;
    setTimeout(renderFicQ, 300);
  }
}

// ============================================================
// PANEL FICQ — fichas técnicas para los productos en el carrito
// ============================================================

export async function openFicQ() {
  closeModal('modal-fic');
  _ficqReturnAfterSave = false;
  const seen = new Set();
  _ficqModels = [];
  state.Q.filter(i => i.tipo === 'n').forEach(i => {
    const key = (i.prod.marca || '') + '|' + (i.prod.modelo || '') + '|' + (i.prod.medida || '');
    if (!seen.has(key)) {
      seen.add(key);
      _ficqModels.push({
        marca: i.prod.marca || '',
        modelo: i.prod.modelo || '',
        medida: i.prod.medida || '',
      });
    }
  });
  if (!_ficqModels.length) { showToast('No hay neumáticos en la cotización'); return; }
  await renderFicQ();
}

export async function renderFicQ() {
  document.getElementById('modal-ficq')?.remove();
  let fichas = [];
  try {
    const { data } = await sb.from('fichas_tecnicas').select('*');
    fichas = data || [];
  } catch (e) {
    console.error('Error cargando fichas:', e);
  }
  const wrap = document.createElement('div');
  wrap.id = 'modal-ficq';
  wrap.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:600;display:flex;align-items:center;justify-content:center;';
  const inner = document.createElement('div');
  inner.style.cssText = 'background:white;border-radius:14px;width:min(560px,95vw);max-height:80vh;overflow-y:auto;padding:20px;';
  inner.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
    <span style="font-size:15px;font-weight:700;">📑 Fichas técnicas de esta cotización</span>
    <button id="ficq-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94A3B8;">✕</button>
  </div>`;
  _ficqModels.forEach((m, idx) => {
    const f = fichas.find(x => x.marca === m.marca && x.modelo === m.modelo && (x.medida || '') === (m.medida || ''));
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1.5px solid #E2E8F0;border-radius:8px;margin-bottom:8px;';
    const status = f
      ? '<span style="color:#16A34A;font-size:11px;font-weight:600;">✅ Completa</span>'
      : '<span style="color:#DC2626;font-size:11px;font-weight:600;">⚠️ Sin ficha</span>';
    row.innerHTML = `
      <div>
        <div style="font-weight:700;font-size:13px;">${m.marca || '—'} <span style="color:#C8102E;">${m.modelo || 'Sin modelo'}</span></div>
        <div style="font-size:11px;color:#64748B;">${m.medida || 'Sin medida'}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">${status}
        <button data-idx="${idx}" data-fid="${f?.id || ''}" class="ficq-btn" style="padding:6px 12px;background:${f ? '#2563EB' : '#C8102E'};color:white;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">${f ? '✏️ Editar' : '+ Crear'}</button>
      </div>`;
    inner.appendChild(row);
  });
  wrap.appendChild(inner);
  document.body.appendChild(wrap);
  document.getElementById('ficq-close').onclick = () => wrap.remove();
  wrap.querySelectorAll('.ficq-btn').forEach(btn => {
    btn.onclick = async () => {
      const idx = parseInt(btn.dataset.idx);
      const fid = btn.dataset.fid;
      const m = _ficqModels[idx];
      wrap.remove();
      if (fid) {
        const { data: f } = await sb.from('fichas_tecnicas').select('*').eq('id', fid).single();
        if (f) {
          state.FICHAS = [...state.FICHAS.filter(x => x.id !== f.id), f];
          openEditFic(f.id);
        }
      } else {
        _ficqReturnAfterSave = true;
        openFicModal(m.marca, m.modelo, m.medida);
      }
    };
  });
}
