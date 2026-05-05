// ============================================================
// SCN App — Entry Point
// ============================================================
// Importa los módulos del núcleo. El resto del código sigue acá
// como un solo bloque por ahora — en Fase 3 se separa en módulos
// por funcionalidad (cotizador, productos, fichas, etc).
// ============================================================

import { initSentry, setSentryUser, captureError } from './core/sentry.js';
import { sb } from './core/supabase.js';
import { state, clearPreview, setPreview } from './core/state.js';
import { initAuth, doLogin, doLogout, setAuthHandlers } from './core/auth.js';
import {
  addI, rmI, chQty, setQty, upP,
  rQ, rcTot, syncQuoteButtons, setQuoteBusy,
  snapshotQ, calcQuoteTotals, updateMobCart,
  registerCatalogRender,
} from './cotizador/cart.js';
import {
  TCLASS, getFilt, renderCat, renderSvcs,
  fp, setFS, sb2sel, sb2, sb2mob, st2, setTab,
} from './cotizador/catalog.js';
import {
  openPDF, closePDFModal, downloadPDF, sendEmailFromPreview,
  registerCloseHandler,
} from './cotizador/pdf-modal.js';
import {
  loadQNum, clearQ, saveQ, sendAppr, genPDF,
  registerApprovalHandler,
} from './cotizador/quote.js';

import {
  loadProds, loadSmap, upPhoto,
  openNewProd, openEditProd, saveProd,
  rStk, fStk, rPre, fPre, svPr, rCrit,
  registerProductHandlers,
} from './productos.js';
import {
  loadClis, buildDL, aFill,
  openNewCli, openEditCli, saveCli,
  rCli, fCli,
} from './clientes.js';
import {
  loadFichas, rFic, fFic, setFicSeg,
  cancelFic, upFicImg, ficSegChange,
  openFicModal, openEditFic, openFicQ, saveFic,
} from './fichas.js';
import {
  loadApr, loadABadge, upAI, dlAPDF, aprQ, rejQ, previewCot,
} from './aprobaciones.js';
import { showToast, openModal, closeModal } from './core/ui.js';
import { $$, compImg, f2b64, cleanPathPart, uniqueJpgPath } from './core/utils.js';
import { SCN_LOGO } from './core/logo.js';
import { buildPDF, buildFichaPage } from './core/pdf.js';

// Inicializar tracking de errores ANTES de todo
initSentry();

// Conectar callbacks entre módulos del cotizador para evitar dependencias circulares
registerCatalogRender({ renderCat, renderSvcs });
registerCloseHandler({ onClose: () => clearQ(true, { syncNum: true }) });
registerApprovalHandler({ onApprovalSent: () => loadABadge() });
registerProductHandlers({ renderCat });

// `sb` se importa desde ./core/supabase.js
// El estado global vive en ./core/state.js (importado como `state`).
// Antes state.ME, state.Q, state.QNUM, state.PRODS, etc. eran globals; ahora son state.ME, state.Q, etc.

// SVCS se importa desde ./cotizador/services.js






async function showApp(){
  document.getElementById('login').style.display='none';
  document.getElementById('app').style.display='block';
  document.getElementById('tav').textContent=state.UNAME.charAt(0).toUpperCase();
  document.getElementById('tun').textContent=state.UNAME;
  document.getElementById('trl').textContent={admin:'Administrador',gerente:'Gerente',vendedor:'Vendedor',bodega:'Bodega'}[state.ROLE]||state.ROLE;
  const isMgr=state.ROLE==='gerente'||state.ROLE==='admin';
  document.getElementById('ng-mgr').style.display=isMgr?'block':'none';
  const bapr=document.getElementById('bapr');
  if(bapr)bapr.style.display=isMgr?'none':'flex';
  await Promise.all([loadProds(),loadSmap(),loadClis()]);
  renderCat();renderSvcs();buildDL();await loadQNum();
  if(isMgr)loadABadge();
  const sel=document.getElementById('dmes');if(sel)sel.value=new Date().getMonth();
}


const PTITLES={cot:'Cotizador',mis:'Mis Cotizaciones',cli:'Clientes',stk:'Stock Disponible',apr:'Aprobaciones',dash:'Dashboard',pre:'Precios',all:'Todas las Cotizaciones',crit:'Stock Crítico',imp:'Importar Stock',fic:'Fichas Técnicas'};
function go(pg,btn){
  closeSidebar();
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  document.querySelectorAll('.nb').forEach(b=>b.classList.remove('on'));
  const el=document.getElementById('pg-'+pg);if(el)el.classList.add('on');
  if(btn)btn.classList.add('on');
  document.getElementById('pg-title').textContent=PTITLES[pg]||pg;
  var mc=document.getElementById('mob-cart');
  if(mc) mc.style.display=(pg==='cot')?'':'none';
  document.querySelector('.qp').classList.remove('mob-open');
  if(pg==='mis')loadMis();
  if(pg==='cli')rCli(state.CLIS);
  if(pg==='stk')rStk(state.PRODS);
  if(pg==='apr')loadApr();
  if(pg==='dash')loadDash();
  if(pg==='pre')rPre(state.PRODS);
  if(pg==='all')loadAll();
  if(pg==='crit')rCrit();
  if(pg==='fic')loadFichas();
}





// cleanPathPart, uniqueJpgPath se importan desde ./core/utils.js


// compImg, f2b64 se importan desde ./core/utils.js








// buildPDF, buildFichaPage se importan desde ./core/pdf.js



function initGmailToken() {}

// ── MOBILE HELPERS ──
function toggleSidebar() {
  var sb = document.querySelector('.sidebar');
  var ov = document.querySelector('.sidebar-overlay');
  sb.classList.toggle('open');
  ov.classList.toggle('show');
}
function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.querySelector('.sidebar-overlay').classList.remove('show');
}
function toggleMobCart() {
  document.querySelector('.qp').classList.toggle('mob-open');
}





async function loadMis(){
  const today=new Date().toISOString().split('T')[0];
  const{data}=await sb.from('cotizaciones')
    .select('id,numero,cliente_nombre,forma_pago,total,estado,created_at,cliente_email')
    .eq('creado_por',state.ME.id)
    .gte('created_at',today)
    .order('created_at',{ascending:false});
  const tb=document.getElementById('mistb');
  if(!data?.length){tb.innerHTML='<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--g500)">Sin cotizaciones hoy</td></tr>';return;}
  tb.innerHTML=data.map(c=>`<tr>
    <td class="mn">#${c.numero}</td><td style="font-weight:600">${c.cliente_nombre}</td>
    <td>${c.forma_pago}</td><td class="mn">${$$(c.total)}</td>
    <td><span class="bdg b${c.estado==='pendiente'?'pend':c.estado==='aprobada'?'aprov':c.estado==='rechazada'?'rech':'borr'}">${c.estado.toUpperCase()}</span></td>
    <td>${new Date(c.created_at).toLocaleTimeString('es-CL',{hour:'2-digit',minute:'2-digit'})}</td>
    <td><button onclick="previewCot(${c.id})" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--g500);" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--g500)'">📄</button></td>
  </tr>`).join('');
  const b=document.getElementById('nb-m');b.textContent=data.length;b.style.display='inline-block';
}








async function loadDash(){
  const mes=parseInt(document.getElementById('dmes')?.value||new Date().getMonth());
  const anio=new Date().getFullYear();
  const start=new Date(anio,mes,1).toISOString(),end=new Date(anio,mes+1,0,23,59,59).toISOString();
  const today=new Date().toISOString().split('T')[0];
  const[hoy,mesD,pend,crit,top]=await Promise.all([
    sb.from('cotizaciones').select('total').gte('created_at',today).eq('estado','aprobada'),
    sb.from('cotizaciones').select('numero,cliente_nombre,cliente_rut,total,neto,created_at').gte('created_at',start).lte('created_at',end).eq('estado','aprobada').order('created_at',{ascending:false}),
    sb.from('cotizaciones').select('id',{count:'exact',head:true}).eq('estado','pendiente'),
    sb.from('stock').select('producto_id').eq('cantidad',0),
    sb.from('cotizaciones').select('cliente_nombre,total').gte('created_at',start).lte('created_at',end).eq('estado','aprobada'),
  ]);
  const mh=(hoy.data||[]).reduce((a,c)=>a+(c.total||0),0);
  const mm=(mesD.data||[]).reduce((a,c)=>a+(c.total||0),0);
  document.getElementById('dh').textContent=(hoy.data||[]).length;
  document.getElementById('dhm').textContent=fmt(mh);
  document.getElementById('dm').textContent=fmt(mm);
  document.getElementById('dp').textContent=pend.count||0;
  document.getElementById('dc').textContent=(crit.data||[]).length;
  document.getElementById('dashtb').innerHTML=(mesD.data||[]).map(c=>`<tr>
    <td class="mn">#${c.numero}</td>
    <td><div style="font-weight:600">${c.cliente_nombre}</div><div style="font-size:10px;color:var(--g500)">${c.cliente_rut||''}</div></td>
    <td class="mn">${$$(c.total)}</td><td class="mn" style="color:var(--g500)">${$$(c.neto)}</td>
    <td style="font-size:11px">${new Date(c.created_at).toLocaleDateString('es-CL')}</td>
  </tr>`).join('')||'<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--g500)">Sin cotizaciones aprobadas este mes</td></tr>';
  const cm={};(top.data||[]).forEach(c=>{cm[c.cliente_nombre]=(cm[c.cliente_nombre]||0)+(c.total||0);});
  const tl=Object.entries(cm).sort((a,b)=>b[1]-a[1]).slice(0,8);
  document.getElementById('topcli').innerHTML=tl.length?tl.map(([n,t],i)=>`
    <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--g100);">
      <div style="width:20px;height:20px;border-radius:50%;background:${i<3?'var(--red)':'var(--g200)'};color:${i<3?'white':'var(--g700)'};display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;flex-shrink:0;">${i+1}</div>
      <div style="flex:1;font-size:12px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${n}</div>
      <div style="font-family:var(--mono);font-size:12px;font-weight:700;color:var(--green)">${fmt(t)}</div>
    </div>`).join(''):'<div style="text-align:center;padding:16px;color:var(--g500);font-size:12px;">Sin ventas este mes</div>';
}


async function loadAll(){
  const tb = document.getElementById('alltb');
  tb.innerHTML = '<tr><td colspan="7"><div class="loading"><div class="spin"></div>Cargando...</div></td></tr>';
  const{data,error}=await sb.from('cotizaciones')
    .select('id,numero,cliente_nombre,cliente_rut,total,neto,estado,created_at,forma_pago,cliente_email')
    .order('created_at',{ascending:false})
    .limit(200);
  if(error||!data?.length){
    tb.innerHTML='<tr><td colspan="7" style="text-align:center;padding:32px;color:var(--g500)">Sin cotizaciones guardadas</td></tr>';
    return;
  }
  tb.innerHTML=data.map(c=>`<tr>
    <td class="mn">#${c.numero}</td>
    <td><div style="font-weight:600">${c.cliente_nombre||'—'}</div></td>
    <td style="font-size:11px;color:var(--g500)">${c.cliente_rut||'—'}</td>
    <td class="mn">${$$(c.total)}</td>
    <td><span class="bdg b${c.estado==='pendiente'?'pend':c.estado==='aprobada'?'aprov':c.estado==='rechazada'?'rech':'borr'}">${c.estado.toUpperCase()}</span></td>
    <td style="font-size:11px">${new Date(c.created_at).toLocaleDateString('es-CL')}</td>
    <td><button onclick="previewCot(${c.id})" style="background:none;border:none;cursor:pointer;font-size:16px;color:var(--g500);" onmouseover="this.style.color='var(--red)'" onmouseout="this.style.color='var(--g500)'">📄</button></td>
  </tr>`).join('');
}


// ── MODAL HELPERS ────────────────────────────────────────
// openModal, closeModal se importan desde ./core/ui.js

// ── NEW / EDIT CLIENTE ────────────────────────────────────



// ── NEW / EDIT PRODUCTO ───────────────────────────────────




// $$ (formatCLP) se importa desde ./core/utils.js
function fmt(n){return n>=1000000?'$'+(n/1000000).toFixed(1)+'M':$$(n);}
// showToast se importa desde ./core/ui.js

// ── IMPORTAR STOCK DESDE DEFONTANA ───────────────────────
const BODEGA_MAP = {
  'BODEGACENTRAL': 'SCN QUILICURA',
  'BODEGA_AUTO': 'BODEGA AUTO',
  'LA': 'LOS ANDES',
  'BODFOX001': 'BODEGA FOX',
  'BODEGA_RESERVAS': 'BODEGA RESERVAS',
};

async function handleImpFile(file) {
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

  addLog('📂 Archivo: ' + file.name + ' (' + Math.round(file.size/1024) + ' KB)');

  try {
    const text = await file.text();
    const lines = text.split('\n').filter(function(l) { return l.trim(); });
    addLog('📋 ' + (lines.length - 1) + ' registros encontrados');

    // Parse CSV
    var records = [];
    var descMap = {}; // codArticulo -> descripcion completa
    for (var i = 1; i < lines.length; i++) {
      var cols = lines[i].split(';').map(function(c) { return c.replace(/"/g, '').replace(/'/g, '').replace(/\r/g, '').trim(); });
      if (cols.length < 5) continue;
      var codArticulo = cols[0];
      var descripcion = cols[1] || codArticulo;
      var codBodega = cols[2];
      var nombreBodega = BODEGA_MAP[codBodega] || cols[3];
      var stock = parseInt(cols[4]) || 0;
      records.push({ producto_id: codArticulo, bodega: nombreBodega, cantidad: stock });
      if (!descMap[codArticulo]) descMap[codArticulo] = descripcion;
    }

    addLog('✅ ' + records.length + ' registros parseados correctamente');

    // Helper: parse marca, medida, modelo and tipo_uso from id+description
    function parseProd(id, desc) {
      var tv = 'CAMION', tu = 'COMERCIAL';
      if      (id.startsWith('TBDIR')) { tv='CAMION'; tu='DIRECCIONAL'; }
      else if (id.startsWith('TBTRA')) { tv='CAMION'; tu='TRACCION'; }
      else if (id.startsWith('TBMIX')) { tv='CAMION'; tu='MIXTO'; }
      else if (id.startsWith('TBOFF')) { tv='CAMION'; tu='FAENERO'; }
      else if (id.startsWith('TBPIS')) { tv='CAMION'; tu='MIXTO'; }
      else if (id.startsWith('LLALU')||id.startsWith('LLFIE')||id.startsWith('LLPIS')) { tv='AUTO'; tu='LLANTA'; }
      else if (id.startsWith('CCCAM')||id.startsWith('CCCUB')) { tv='CAMION'; tu='CAMARA'; }
      else if (id.startsWith('OTIND')||id.startsWith('OTOFF')) { tv='CAMION'; tu='FAENERO'; }
      else if (id.startsWith('LT'))  { tv='AUTO'; tu='CITY/TOURING'; }
      else if (id.match(/^[0-9]/))   { tv='AUTO'; tu='CITY/TOURING'; }
      else if (id.startsWith('BT'))  { tv='AUTO'; tu='COMERCIAL'; }
      else if (id.startsWith('SC'))  { tv='CAMION'; tu='COMERCIAL'; }
      else if (id.startsWith('VA'))  { tv='CAMION'; tu='COMERCIAL'; }

      var clean = desc.replace(/^NEUM\s+/i,'').trim();
      var medidaMatch = clean.match(/\b[\d]{1,3}[./][\d]{1,3}[RrXx-][\d.]{2,6}[A-Z0-9]?\b/);
      var medida = medidaMatch ? medidaMatch[0] : '';

      var words = clean.split(/\s+/);
      var skipWords = new Set(['TL','TT','SET','XL','CH','L','B','PR','M+S','UN','3PMSF','FAE','VG','MI']);
      var marca = '';
      for (var w = words.length - 1; w >= 0; w--) {
        var wd = words[w].replace(/[^A-Za-z]/g,'');
        if (wd.length > 2 && !skipWords.has(wd.toUpperCase()) && /^[A-Za-z]+$/.test(wd)) { marca = wd.toUpperCase(); break; }
      }
      if (!marca) marca = 'SIN MARCA';

      var modelo = clean;
      if (medida) modelo = modelo.replace(medida,'');
      modelo = modelo.replace(new RegExp(marca+'.*$','i'),'').replace(/^\s*\d+PR\s*/,'').replace(/^[\s\-,]+|[\s\-,]+$/g,'').trim();

      return { marca, medida, modelo, tv, tu };
    }

    // Upsert ALL unique products from CSV (creates new + updates incomplete existing)
    var allIds = [...new Set(records.map(function(r){ return r.producto_id; }))];
    addLog('🔄 Sincronizando ' + allIds.length + ' productos...', 'var(--blue)');
    document.getElementById('imp-prog').textContent = 'Sincronizando productos...';

    var creados = 0, errCrear = 0;
    for (var ni = 0; ni < allIds.length; ni += 20) {
      var prodBatch = allIds.slice(ni, ni + 20).map(function(id) {
        var desc = descMap[id] || id;
        var p = parseProd(id, desc);
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
      var { error: insErr } = await sb.from('productos').upsert(prodBatch, { onConflict: 'id' });
      if (insErr) { errCrear += prodBatch.length; addLog('⚠️ Error sync lote: ' + insErr.message, 'var(--red)'); }
      else creados += prodBatch.length;
    }
    addLog('✅ ' + creados + ' productos sincronizados' + (errCrear ? ', ' + errCrear + ' errores' : ''), 'var(--green)');

    // Reload state.PRODS with updated data
    await loadProds();
    var matched = records.filter(function(r){ return new Set(state.PRODS.map(function(p){ return p.id; })).has(r.producto_id); });

    // First reset all stock to 0
    document.getElementById('imp-prog').textContent = 'Reseteando stock actual...';
    addLog('🔄 Reseteando stock actual a 0...');
    var { error: resetErr } = await sb.from('stock').update({ cantidad: 0 }).gte('cantidad', 0);
    if (resetErr) addLog('⚠️ Error reseteando: ' + resetErr.message, 'var(--red)');

    // Upsert in batches
    document.getElementById('imp-prog').textContent = 'Actualizando stock...';
    var batchSize = 50;
    var updated = 0;
    var errors = 0;

    for (var b = 0; b < matched.length; b += batchSize) {
      var batch = matched.slice(b, b + batchSize);
      var { error: batchErr } = await sb.from('stock').upsert(batch, { onConflict: 'producto_id,bodega' });
      if (batchErr) {
        errors += batch.length;
        addLog('❌ Error lote ' + Math.floor(b/batchSize + 1) + ': ' + batchErr.message, 'var(--red)');
      } else {
        updated += batch.length;
      }
      document.getElementById('imp-prog').textContent = 'Actualizando... ' + updated + '/' + matched.length;
    }

    // Reload stock map and refresh UI
    await Promise.all([loadProds(), loadSmap()]);
    rStk(state.PRODS);
    rCrit();
    renderCat();

    // Show summary
    var summary = '✅ Importación completada: ' + updated + ' registros actualizados';
    if (errors > 0) summary += ', ' + errors + ' errores';
    addLog(summary, 'var(--green)');
    addLog('📊 Stock total en sistema: ' + Object.keys(state.SMAP).length + ' productos con stock');

    status.innerHTML = '<div style="display:flex;align-items:center;gap:8px;padding:12px;background:var(--green-l);border:1px solid #86EFAC;border-radius:8px;margin-bottom:12px;"><span style="font-size:16px;">✅</span><div><span style="font-size:12px;font-weight:600;color:var(--green);">' + summary + '</span><div style="font-size:11px;color:var(--g500);margin-top:2px;">Fecha: ' + new Date().toLocaleString('es-CL') + '</div></div></div>';

    showToast('✓ Stock importado — navegando a Stock...');
    setTimeout(()=>{ go('stk', document.querySelector('.nb[onclick*="stk"]')); }, 1500);

    // Update hist
    var hist = document.getElementById('imp-hist');
    hist.innerHTML = '<div style="display:flex;align-items:center;gap:10px;padding:10px;background:var(--g50);border-radius:7px;margin-bottom:6px;"><span style="font-size:16px;">📄</span><div><div style="font-size:12px;font-weight:600;">' + file.name + '</div><div style="font-size:11px;color:var(--g500);">' + new Date().toLocaleString('es-CL') + ' · ' + updated + ' registros · ' + matched.length + ' productos</div></div></div>' + hist.innerHTML;

  } catch(e) {
    addLog('❌ Error: ' + e.message, 'var(--red)');
    status.innerHTML = '<div style="padding:12px;background:var(--red-l);border:1px solid #FCA5A5;border-radius:8px;margin-bottom:12px;font-size:12px;color:var(--red-d);font-weight:600;">❌ Error: ' + e.message + '</div>';
  }

  document.getElementById('imp-file').value = '';
}

// ── FICHAS TÉCNICAS CRUD ────────────────────────────────
// state.FICHAS, state.FIC_SEG, state.FIC_Q ahora están en state (./core/state.js)













// Conectar el ciclo de vida de auth con el bootstrap de la app
// (initAuth() se llama al final, después de exponer funciones a window)
setAuthHandlers({
  onLoggedIn: showApp,
  onLoggedOut: () => {
    // El estado de auth se limpia adentro de showLogin().
  },
});

// ============================================================
// EXPONER FUNCIONES A WINDOW
// (necesario para que los onclick="foo()" inline en HTML funcionen)
// En Fase 3 las reemplazaremos por addEventListener para no contaminar window.
// ============================================================
Object.assign(window, {
  // Auth
  doLogin, doLogout,
  // Navegación / UI
  go, setTab, setFS, st2, sb2sel, sb2mob, toggleSidebar, toggleMobCart,
  closeModal, closePDFModal, fp,
  // Cotizador
  addI, rmI, chQty, setQty, upP, clearQ, sendAppr, genPDF,
  // Productos
  openNewProd, openEditProd, saveProd, upPhoto, fStk, fPre, svPr,
  // Clientes
  openNewCli, openEditCli, saveCli, fCli, aFill,
  // Fichas técnicas
  openFicModal, openEditFic, openFicQ, saveFic, cancelFic, ficSegChange, setFicSeg, upFicImg, fFic,
  // Aprobaciones / cotizaciones
  aprQ, rejQ, previewCot, dlAPDF,
  // PDF / email
  downloadPDF, sendEmailFromPreview,
  // Importar
  handleImpFile, upAI,
  // Dashboard
  loadDash
});

// Bootstrap de la app — arranca la verificación de sesión
initAuth();
