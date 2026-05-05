// ============================================================
// PRODUCTOS — CRUD + fotos + stock + tablas
// ============================================================
// Funciones expuestas:
//   - loadProds(): trae productos de Supabase a state.PRODS y refresca filtros
//   - loadSmap(): trae stock y arma state.SMAP por producto
//   - openNewProd(), openEditProd(id), saveProd(): CRUD del modal
//   - upPhoto(event, pid): subir foto + sync a fichas del mismo modelo
//   - rStk(data), fStk(q): tabla de stock + filtro
//   - rPre(data), fPre(q), svPr(id, v): tabla de precios + filtro + actualizar
//   - rCrit(): productos sin stock en ninguna bodega
//
// Para evitar dependencia circular con cotizador/catalog (que importa rederCat),
// usamos `registerProductHandlers({ renderCat })` que main.js inyecta.
// ============================================================

import { state } from './core/state.js';
import { sb } from './core/supabase.js';
import { showToast, openModal, closeModal } from './core/ui.js';
import { $$, compImg, uniqueJpgPath } from './core/utils.js';
import { TCLASS } from './cotizador/catalog.js';

// ─── Callback inyectado por main.js para refrescar el catálogo en cotizador ───
let _renderCat = () => {};
export function registerProductHandlers({ renderCat } = {}) {
  if (renderCat) _renderCat = renderCat;
}

// ============================================================
// LOAD — datos desde Supabase a state
// ============================================================

export async function loadProds() {
  const { data } = await sb.from('productos')
    .select('*')
    .eq('es_servicio', false)
    .eq('activo', true)
    .order('marca');
  state.PRODS = (data || []).map(p => ({
    ...p,
    precio_venta: p.precio_venta > 0 ? p.precio_venta : Math.round((p.costo_unitario || 0) * 1.35),
  }));

  // Refrescar dropdown de marcas y chips de tipo de uso
  const brands = [...new Set(state.PRODS.map(p => p.marca).filter(Boolean))].sort();
  const bSel = document.getElementById('bch-sel');
  const curBrand = bSel?.value || '';
  if (bSel) {
    bSel.innerHTML = '<option value="">Todas las marcas</option>'
      + brands.map(b => `<option value="${b}"${b === curBrand ? ' selected' : ''}>${b}</option>`).join('');
  }
  const tipos = [...new Set(state.PRODS.map(p => p.tipo_uso).filter(Boolean))].sort();
  document.getElementById('tch').innerHTML = '<button class="chip on" onclick="st2(\'\',this)">Todos</button>'
    + tipos.map(t => {
      const tc = TCLASS(t);
      return `<button class="chip" onclick="st2('${t}',this)">${t}</button>`;
    }).join('');
}

export async function loadSmap() {
  const { data } = await sb.from('stock').select('*');
  state.SMAP = {};
  (data || []).forEach(r => {
    if (!state.SMAP[r.producto_id]) state.SMAP[r.producto_id] = { q: 0, a: 0, l: 0, t: 0 };
    const s = state.SMAP[r.producto_id];
    if (r.bodega === 'SCN QUILICURA') s.q = r.cantidad;
    if (r.bodega === 'BODEGA AUTO') s.a = r.cantidad;
    if (r.bodega === 'LOS ANDES') s.l = r.cantidad;
    s.t = s.q + s.a + s.l;
  });
}

// ============================================================
// FOTO — sube imagen y sincroniza a productos+fichas del mismo modelo
// ============================================================

export async function upPhoto(event, pid) {
  const input = event.target;
  const file = input.files && input.files[0];
  if (!file) return;
  input.disabled = true;
  showToast('Subiendo foto...');
  try {
    const comp = await compImg(file, 800);
    const fn = uniqueJpgPath('productos', 'prod_' + pid);
    const { error: upErr } = await sb.storage.from('fotos-neumaticos').upload(fn, comp, {
      contentType: 'image/jpeg', cacheControl: '3600', upsert: false,
    });
    if (upErr) {
      showToast('Error al subir: ' + upErr.message);
      console.error('Storage error:', upErr);
      return;
    }
    const { data: ud } = sb.storage.from('fotos-neumaticos').getPublicUrl(fn);
    const url = ud.publicUrl;
    const { error: dbErr } = await sb.from('productos').update({ foto_url: url }).eq('id', pid);
    if (dbErr) {
      showToast('Error guardando URL: ' + dbErr.message);
      console.error('DB foto_url error:', dbErr);
      return;
    }
    const p = state.PRODS.find(x => x.id === pid);
    if (p) p.foto_url = url;

    // Sincronizar foto a TODOS los productos y fichas del mismo (marca, modelo)
    if (p && p.marca && p.modelo) {
      const M = p.marca.toUpperCase().trim();
      const MO = p.modelo.toUpperCase().trim();
      try {
        await sb.from('productos').update({ foto_url: url }).ilike('marca', M).ilike('modelo', MO);
        await sb.from('fichas_tecnicas').update({ imagen_url: url }).ilike('marca', M).ilike('modelo', MO);
      } catch (e) {
        console.warn('Sync foto a productos/fichas falló (no crítico):', e);
      }
      // Cache local
      state.PRODS.forEach(x => {
        if (x.marca && x.modelo
            && x.marca.toUpperCase().trim() === M
            && x.modelo.toUpperCase().trim() === MO) {
          x.foto_url = url;
        }
      });
      if (Array.isArray(state.FICHAS)) {
        state.FICHAS.forEach(f => {
          if (f.marca && f.modelo
              && f.marca.toUpperCase().trim() === M
              && f.modelo.toUpperCase().trim() === MO) {
            f.imagen_url = url;
          }
        });
      }
    }
    _renderCat();
    showToast('✓ Foto guardada y sincronizada con la ficha técnica');
  } catch (e) {
    showToast('Error: ' + e.message);
    console.error(e);
  } finally {
    input.value = '';
    input.disabled = false;
  }
}

// ============================================================
// CRUD MODAL — Nuevo / Editar / Guardar producto
// ============================================================

export function openNewProd() {
  document.getElementById('modal-prod-title').textContent = 'Nuevo producto';
  document.getElementById('prod-edit-id').value = '';
  document.getElementById('prod-id').disabled = false;
  ['prod-desc', 'prod-marca', 'prod-medida', 'prod-id', 'prod-modelo',
   'prod-telas', 'prod-prof', 'prod-ic', 'prod-iv', 'prod-peso']
    .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  document.getElementById('prod-costo').value = '';
  document.getElementById('prod-precio').value = '';
  document.getElementById('prod-stk-q').value = '0';
  document.getElementById('prod-stk-a').value = '0';
  document.getElementById('prod-stk-l').value = '0';
  document.getElementById('prod-tipo').value = 'DIRECCIONAL';
  document.getElementById('prod-veh').value = 'CAMION';
  openModal('modal-prod');
}

export async function openEditProd(id) {
  const p = state.PRODS.find(x => x.id === id);
  if (!p) return;
  document.getElementById('modal-prod-title').textContent = 'Editar producto';
  document.getElementById('prod-edit-id').value = p.id;
  document.getElementById('prod-desc').value = p.descripcion || '';
  document.getElementById('prod-marca').value = p.marca || '';
  document.getElementById('prod-medida').value = p.medida || '';
  document.getElementById('prod-id').value = p.id;
  document.getElementById('prod-id').disabled = true;
  document.getElementById('prod-costo').value = p.costo_unitario || '';
  document.getElementById('prod-precio').value = p.precio_venta || '';
  document.getElementById('prod-tipo').value = p.tipo_uso || 'DIRECCIONAL';
  document.getElementById('prod-veh').value = p.tipo_vehiculo || 'CAMION';
  const s = state.SMAP[p.id] || { q: 0, a: 0, l: 0 };
  document.getElementById('prod-stk-q').value = s.q;
  document.getElementById('prod-stk-a').value = s.a;
  document.getElementById('prod-stk-l').value = s.l;
  document.getElementById('prod-modelo').value = p.modelo || '';
  document.getElementById('prod-telas').value = p.telas || '';
  document.getElementById('prod-prof').value = p.profundidad || '';
  document.getElementById('prod-ic').value = p.indice_carga || '';
  document.getElementById('prod-iv').value = p.indice_velocidad || '';
  document.getElementById('prod-peso').value = p.peso_kg || '';
  openModal('modal-prod');
}

export async function saveProd() {
  const editId = document.getElementById('prod-edit-id').value;
  const desc = document.getElementById('prod-desc').value.trim();
  const marca = document.getElementById('prod-marca').value.trim().toUpperCase();
  const prodId = (editId || document.getElementById('prod-id').value.trim() || Date.now().toString());
  if (!desc || !marca) { showToast('Descripción y marca son obligatorios'); return; }
  const costo = parseFloat(document.getElementById('prod-costo').value) || 0;
  const precio = parseFloat(document.getElementById('prod-precio').value) || Math.round(costo * 1.35);
  const payload = {
    id: prodId, descripcion: desc, marca,
    medida: document.getElementById('prod-medida').value.trim() || null,
    tipo_uso: document.getElementById('prod-tipo').value,
    tipo_vehiculo: document.getElementById('prod-veh').value,
    costo_unitario: costo, precio_venta: precio,
    es_servicio: false, activo: true,
    modelo: document.getElementById('prod-modelo').value.trim().toUpperCase() || null,
    telas: document.getElementById('prod-telas').value.trim() || null,
    profundidad: document.getElementById('prod-prof').value.trim() || null,
    indice_carga: document.getElementById('prod-ic').value.trim() || null,
    indice_velocidad: document.getElementById('prod-iv').value.trim() || null,
    peso_kg: document.getElementById('prod-peso').value.trim() || null,
  };
  let error;
  if (editId) {
    ({ error } = await sb.from('productos').update(payload).eq('id', editId));
  } else {
    ({ error } = await sb.from('productos').insert(payload));
  }
  if (error) { showToast('Error: ' + error.message); return; }

  // Stock: upsert en las 3 bodegas
  const bodegas = [
    { bodega: 'SCN QUILICURA', cantidad: parseInt(document.getElementById('prod-stk-q').value) || 0 },
    { bodega: 'BODEGA AUTO',   cantidad: parseInt(document.getElementById('prod-stk-a').value) || 0 },
    { bodega: 'LOS ANDES',     cantidad: parseInt(document.getElementById('prod-stk-l').value) || 0 },
  ];
  let stkError = null;
  for (const b of bodegas) {
    const { error: se } = await sb.from('stock').upsert(
      { producto_id: prodId, bodega: b.bodega, cantidad: b.cantidad },
      { onConflict: 'producto_id,bodega' },
    );
    if (se) { stkError = se; console.error('Stock upsert error:', b.bodega, se); }
  }
  showToast(stkError
    ? '⚠️ Producto guardado pero error en stock: ' + stkError.message
    : (editId ? '✓ Producto actualizado' : '✓ Producto creado'));
  closeModal('modal-prod');
  document.getElementById('prod-id').disabled = false;
  await Promise.all([loadProds(), loadSmap()]);
  _renderCat();
  rStk(state.PRODS);
}

// ============================================================
// VISTAS — Tablas de stock y precios
// ============================================================

export function rStk(data) {
  document.getElementById('stktb').innerHTML = data.slice(0, 150).map(p => {
    const s = state.SMAP[p.id] || { q: 0, a: 0, l: 0, t: 0 };
    const sc = s.t > 5 ? 'sok' : s.t > 0 ? 'slow' : 'szero';
    return `<tr>
      <td style="font-size:11px;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.descripcion}</td>
      <td style="font-weight:600;color:var(--red);font-size:11px">${p.marca}</td>
      <td class="mn" style="font-size:11px">${p.medida}</td>
      <td style="text-align:center"><span class="p-stk ${s.q > 0 ? 'sok' : 'szero'}">${s.q}</span></td>
      <td style="text-align:center"><span class="p-stk ${s.a > 0 ? 'sok' : 'szero'}">${s.a}</span></td>
      <td style="text-align:center"><span class="p-stk ${s.l > 0 ? 'sok' : 'szero'}">${s.l}</span></td>
      <td style="text-align:center"><span class="p-stk ${sc}"><strong>${s.t}</strong></span></td>
      <td><button onclick="openEditProd('${p.id}')" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--g400);" onmouseover="this.style.color='var(--blue)'" onmouseout="this.style.color='var(--g400)'">✏️</button></td>
    </tr>`;
  }).join('');
}

export function fStk(q) {
  rStk(state.PRODS.filter(p =>
    !q
    || p.descripcion?.toLowerCase().includes(q.toLowerCase())
    || p.marca?.toLowerCase().includes(q.toLowerCase())
  ));
}

export function rPre(data) {
  document.getElementById('pretb').innerHTML = data.slice(0, 80).map(p => `
    <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--g100);">
      <div style="flex:1;min-width:0;">
        <div style="font-size:12px;font-weight:600;">${p.marca || ''} ${p.medida || ''} ${p.modelo || ''}</div>
        <div style="font-size:10px;color:var(--g500)">Costo: ${$$(p.costo_unitario)}</div>
      </div>
      <input type="number" value="${p.precio_venta}" style="width:110px;padding:6px 9px;border:1.5px solid var(--g200);border-radius:6px;font-family:var(--mono);font-size:12px;text-align:right;outline:none;" onfocus="this.style.borderColor='var(--red)'" onblur="this.style.borderColor='var(--g200)'" onchange="svPr('${p.id}',this.value)">
    </div>`).join('');
}

export function fPre(q) {
  rPre(state.PRODS.filter(p =>
    !q
    || p.descripcion?.toLowerCase().includes(q.toLowerCase())
    || p.marca?.toLowerCase().includes(q.toLowerCase())
  ));
}

export async function svPr(id, v) {
  const pr = parseFloat(v) || 0;
  await sb.from('productos').update({ precio_venta: pr }).eq('id', id);
  const p = state.PRODS.find(x => x.id === id);
  if (p) p.precio_venta = pr;
  showToast('✓ Precio guardado');
}

// ============================================================
// STOCK CRÍTICO — productos sin stock en ninguna bodega
// ============================================================

export function rCrit() {
  const cr = state.PRODS.filter(p => (state.SMAP[p.id] || { t: 0 }).t === 0);
  const el = document.getElementById('critl');
  if (!cr.length) {
    el.innerHTML = '<div class="empty"><div class="ei">✅</div>No hay productos sin stock</div>';
    return;
  }
  el.innerHTML = cr.map(p => `
    <div style="background:var(--red-l);border:1px solid #FCA5A5;border-radius:8px;padding:10px 14px;margin-bottom:8px;display:flex;align-items:center;gap:10px;">
      <span style="font-size:18px;">⚠️</span>
      <div>
        <div style="font-size:12px;font-weight:700;color:#9B0D22">${p.marca || ''} — ${p.descripcion}</div>
        <div style="font-size:11px;color:var(--red)">Medida: ${p.medida || '—'} · Sin stock en las 3 bodegas</div>
      </div>
    </div>`).join('');
}
