// ============================================================
// IMPORTAR — Carga masiva de stock desde CSV de Defontana
// ============================================================
// Acepta un CSV con formato:
//   CodArticulo;Descripcion;CodBodega;NombreBodega;Saldo Stock;...
//
// 1. Parsea el CSV
// 2. Hace upsert de TODOS los productos (crea o actualiza nombre/marca/medida)
// 3. Resetea el stock a 0
// 4. Hace upsert del stock por (producto_id, bodega)
// 5. Refresca state local y navega a Stock

import { state } from './core/state.js';
import { sb } from './core/supabase.js';
import { showToast } from './core/ui.js';
import { loadProds, loadSmap, rStk, rCrit } from './productos.js';

// Mapeo de código de bodega del ERP → nombre legible que usa la app
const BODEGA_MAP = {
  BODEGACENTRAL: 'SCN QUILICURA',
  BODEGA_AUTO: 'BODEGA AUTO',
  LA: 'LOS ANDES',
  BODFOX001: 'BODEGA FOX',
  BODEGA_RESERVAS: 'BODEGA RESERVAS',
};

// ─── Callback inyectado por router.js para refrescar el catálogo ───
let _renderCat = () => {};
let _go = () => {};
export function registerImportHandlers({ renderCat, go } = {}) {
  if (renderCat) _renderCat = renderCat;
  if (go) _go = go;
}

// ─── Parser: del id+descripcion deduce marca, medida, modelo, tipo ───
function parseProd(id, desc) {
  let tv = 'CAMION', tu = 'COMERCIAL';
  if      (id.startsWith('TBDIR')) { tv = 'CAMION'; tu = 'DIRECCIONAL'; }
  else if (id.startsWith('TBTRA')) { tv = 'CAMION'; tu = 'TRACCION'; }
  else if (id.startsWith('TBMIX')) { tv = 'CAMION'; tu = 'MIXTO'; }
  else if (id.startsWith('TBOFF')) { tv = 'CAMION'; tu = 'FAENERO'; }
  else if (id.startsWith('TBPIS')) { tv = 'CAMION'; tu = 'MIXTO'; }
  else if (id.startsWith('LLALU') || id.startsWith('LLFIE') || id.startsWith('LLPIS')) { tv = 'AUTO'; tu = 'LLANTA'; }
  else if (id.startsWith('CCCAM') || id.startsWith('CCCUB')) { tv = 'CAMION'; tu = 'CAMARA'; }
  else if (id.startsWith('OTIND') || id.startsWith('OTOFF')) { tv = 'CAMION'; tu = 'FAENERO'; }
  else if (id.startsWith('LT')) { tv = 'AUTO'; tu = 'CITY/TOURING'; }
  else if (id.match(/^[0-9]/))  { tv = 'AUTO'; tu = 'CITY/TOURING'; }
  else if (id.startsWith('BT')) { tv = 'AUTO'; tu = 'COMERCIAL'; }
  else if (id.startsWith('SC')) { tv = 'CAMION'; tu = 'COMERCIAL'; }
  else if (id.startsWith('VA')) { tv = 'CAMION'; tu = 'COMERCIAL'; }

  const clean = desc.replace(/^NEUM\s+/i, '').trim();
  const medidaMatch = clean.match(/\b[\d]{1,3}[./][\d]{1,3}[RrXx-][\d.]{2,6}[A-Z0-9]?\b/);
  const medida = medidaMatch ? medidaMatch[0] : '';

  const words = clean.split(/\s+/);
  const skipWords = new Set(['TL', 'TT', 'SET', 'XL', 'CH', 'L', 'B', 'PR', 'M+S', 'UN', '3PMSF', 'FAE', 'VG', 'MI']);
  let marca = '';
  for (let w = words.length - 1; w >= 0; w--) {
    const wd = words[w].replace(/[^A-Za-z]/g, '');
    if (wd.length > 2 && !skipWords.has(wd.toUpperCase()) && /^[A-Za-z]+$/.test(wd)) {
      marca = wd.toUpperCase();
      break;
    }
  }
  if (!marca) marca = 'SIN MARCA';

  let modelo = clean;
  if (medida) modelo = modelo.replace(medida, '');
  modelo = modelo.replace(new RegExp(marca + '.*$', 'i'), '')
    .replace(/^\s*\d+PR\s*/, '')
    .replace(/^[\s\-,]+|[\s\-,]+$/g, '')
    .trim();

  return { marca, medida, modelo, tv, tu };
}

export async function handleImpFile(file) {
  if (!file) return;
  if (!file.name.endsWith('.csv')) { showToast('Solo archivos CSV'); return; }

  const status = document.getElementById('imp-status');
  const log = document.getElementById('imp-log');
  status.style.display = 'block';
  log.style.display = 'block';
  log.innerHTML = '';

  function addLog(msg, color) {
    log.innerHTML += '<div style="color:' + (color || 'var(--g700)') + '">' + msg + '</div>';
    log.scrollTop = log.scrollHeight;
  }

  status.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:12px;background:var(--amber-l);border:1px solid #FCD34D;border-radius:8px;margin-bottom:12px;"><div class="spin"></div><span style="font-size:12px;font-weight:600;color:#92400E;" id="imp-prog">Leyendo archivo...</span></div>';

  addLog('📂 Archivo: ' + file.name + ' (' + Math.round(file.size / 1024) + ' KB)');

  try {
    const text = await file.text();
    const lines = text.split('\n').filter(l => l.trim());
    addLog('📋 ' + (lines.length - 1) + ' registros encontrados');

    // Parse CSV
    const records = [];
    const descMap = {};
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(';').map(c => c.replace(/"/g, '').replace(/'/g, '').replace(/\r/g, '').trim());
      if (cols.length < 5) continue;
      const codArticulo = cols[0];
      const descripcion = cols[1] || codArticulo;
      const codBodega = cols[2];
      const nombreBodega = BODEGA_MAP[codBodega] || cols[3];
      const stock = parseInt(cols[4]) || 0;
      records.push({ producto_id: codArticulo, bodega: nombreBodega, cantidad: stock });
      if (!descMap[codArticulo]) descMap[codArticulo] = descripcion;
    }

    addLog('✅ ' + records.length + ' registros parseados correctamente');

    // Upsert TODOS los productos únicos (crea + actualiza)
    const allIds = [...new Set(records.map(r => r.producto_id))];
    addLog('🔄 Sincronizando ' + allIds.length + ' productos...', 'var(--blue)');
    document.getElementById('imp-prog').textContent = 'Sincronizando productos...';

    let creados = 0, errCrear = 0;
    for (let ni = 0; ni < allIds.length; ni += 20) {
      const prodBatch = allIds.slice(ni, ni + 20).map(id => {
        const desc = descMap[id] || id;
        const p = parseProd(id, desc);
        return {
          id: id,
          descripcion: desc,
          marca: p.marca,
          medida: p.medida,
          modelo: p.modelo,
          tipo_uso: p.tu,
          tipo_vehiculo: p.tv,
          es_servicio: false,
          activo: true,
        };
      });
      const { error: insErr } = await sb.from('productos').upsert(prodBatch, { onConflict: 'id' });
      if (insErr) {
        errCrear += prodBatch.length;
        addLog('⚠️ Error sync lote: ' + insErr.message, 'var(--red)');
      } else {
        creados += prodBatch.length;
      }
    }
    addLog('✅ ' + creados + ' productos sincronizados' + (errCrear ? ', ' + errCrear + ' errores' : ''), 'var(--green)');

    // Recargar PRODS con la data actualizada
    await loadProds();
    const matched = records.filter(r => new Set(state.PRODS.map(p => p.id)).has(r.producto_id));

    // Resetear todo el stock a 0
    document.getElementById('imp-prog').textContent = 'Reseteando stock actual...';
    addLog('🔄 Reseteando stock actual a 0...');
    const { error: resetErr } = await sb.from('stock').update({ cantidad: 0 }).gte('cantidad', 0);
    if (resetErr) addLog('⚠️ Error reseteando: ' + resetErr.message, 'var(--red)');

    // Upsert stock en lotes
    document.getElementById('imp-prog').textContent = 'Actualizando stock...';
    const batchSize = 50;
    let updated = 0;
    let errors = 0;

    for (let b = 0; b < matched.length; b += batchSize) {
      const batch = matched.slice(b, b + batchSize);
      const { error: batchErr } = await sb.from('stock').upsert(batch, { onConflict: 'producto_id,bodega' });
      if (batchErr) {
        errors += batch.length;
        addLog('❌ Error lote ' + Math.floor(b / batchSize + 1) + ': ' + batchErr.message, 'var(--red)');
      } else {
        updated += batch.length;
      }
      document.getElementById('imp-prog').textContent = 'Actualizando... ' + updated + '/' + matched.length;
    }

    // Recargar y refrescar UI
    await Promise.all([loadProds(), loadSmap()]);
    rStk(state.PRODS);
    rCrit();
    _renderCat();

    let summary = '✅ Importación completada: ' + updated + ' registros actualizados';
    if (errors > 0) summary += ', ' + errors + ' errores';
    addLog(summary, 'var(--green)');
    addLog('📊 Stock total en sistema: ' + Object.keys(state.SMAP).length + ' productos con stock');

    status.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:12px;background:var(--green-l);border:1px solid #86EFAC;border-radius:8px;margin-bottom:12px;"><span style="font-size:16px;">✅</span><div><span style="font-size:12px;font-weight:600;color:var(--green);">' + summary + '</span><div style="font-size:11px;color:var(--g500);margin-top:2px;">Fecha: ' + new Date().toLocaleString('es-CL') + '</div></div></div>';

    showToast('✓ Stock importado — navegando a Stock...');
    setTimeout(() => { _go('stk', document.querySelector('.nb[onclick*="stk"]')); }, 1500);

    // Histórico
    const hist = document.getElementById('imp-hist');
    hist.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--g50);border-radius:7px;margin-bottom:6px;"><span style="font-size:16px;">📄</span><div><div style="font-size:12px;font-weight:600;">' + file.name + '</div><div style="font-size:11px;color:var(--g500);">' + new Date().toLocaleString('es-CL') + ' · ' + updated + ' registros · ' + matched.length + ' productos</div></div></div>' + hist.innerHTML;

  } catch (e) {
    addLog('❌ Error: ' + e.message, 'var(--red)');
    status.innerHTML = '<div style="padding:12px;background:var(--red-l);border:1px solid #FCA5A5;border-radius:8px;margin-bottom:12px;font-size:12px;color:var(--red-d);font-weight:600;">❌ Error: ' + e.message + '</div>';
  }

  document.getElementById('imp-file').value = '';
}
