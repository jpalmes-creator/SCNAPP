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

async function loadABadge(){const{count}=await sb.from('cotizaciones').select('id',{count:'exact',head:true}).eq('estado','pendiente');const b=document.getElementById('nb-a');b.textContent=count||0;b.style.display=count?'inline-block':'none';}

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



async function loadApr(){
  const{data}=await sb.from('cotizaciones').select('*,cotizacion_items(*)').eq('estado','pendiente').order('created_at');
  const grid=document.getElementById('aprg');
  if(!data?.length){grid.innerHTML='<div class="empty"><div class="ei">✅</div>Sin cotizaciones pendientes</div>';return;}
  grid.innerHTML=data.map(c=>{
    const items=c.cotizacion_items||[];
    window['it_'+c.id]=items.map(i=>({...i}));
    return`<div class="ac">
      <div class="ach">
        <div><div class="acn">#${c.numero} · ${new Date(c.created_at).toLocaleString('es-CL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div>
        <div class="acc">${c.cliente_nombre}</div><div class="acm">${c.cliente_rut||''} · ${c.forma_pago}</div></div>
        <span class="bdg bpend">PENDIENTE</span>
      </div>
      <div class="acb">
        <div class="act" id="at-${c.id}">${$$(c.total)}</div>
        <div class="ae-row"><label>Email cliente</label><input id="ae-${c.id}" type="email" placeholder="cliente@empresa.cl" value="${c.cliente_email||''}"></div>
        <div class="ie">
          ${items.map(item=>`<div class="ier">
            <div><div class="ieb">${item.marca||'SERV'}</div><div class="ien">${item.descripcion}</div><div class="ieq">Cant: ${item.cantidad}</div><div class="iet" id="it-${c.id}-${item.id}">${$$(item.total)}</div></div>
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
  document.getElementById('nb-a').textContent=data.length;
}

function upAI(cid,iid,qty,v){
  const pr=parseFloat(v)||0,items=window['it_'+cid],item=items?.find(i=>i.id===iid);
  if(item){item.precio_unit=pr;item.total=pr*qty;}
  const el=document.getElementById('it-'+cid+'-'+iid);if(el)el.textContent=$$(pr*qty);
  const neto=(items||[]).reduce((a,i)=>a+(i.total||0),0),total=neto+Math.round(neto*.19);
  const r=document.getElementById('ar-'+cid);if(r)r.textContent=$$(total);
  const t=document.getElementById('at-'+cid);if(t)t.textContent=$$(total);
}

async function dlAPDF(cid){
  const{data:cot}=await sb.from('cotizaciones').select('*').eq('id',cid).single();
  if(!cot)return;
  const items=(window['it_'+cid]||[]).map(i=>({...i,prod:{descripcion:i.descripcion,marca:i.marca,tipo_uso:'',foto_url:null,ic:i.marca==='SERVICIO'?'🔧':'🔵',nm:i.descripcion},tipo:i.marca==='SERVICIO'?'s':'n',up:i.precio_unit,qty:i.cantidad}));
  openPDF(buildPDF(cot,items));
}

async function aprQ(id,num,cli){
  const em=document.getElementById('ae-'+id)?.value?.trim()||'';
  const items=window['it_'+id]||[];
  for(const i of items)await sb.from('cotizacion_items').update({precio_unit:i.precio_unit,total:i.total}).eq('id',i.id);
  const neto=items.reduce((a,i)=>a+(i.total||0),0),iva=Math.round(neto*.19),total=neto+iva;
  await sb.from('cotizaciones').update({estado:'aprobada',aprobado_por:state.ME.id,aprobado_at:new Date().toISOString(),neto,iva,total,...(em?{cliente_email:em}:{})}).eq('id',id);
  showToast('✓ Cotización #'+num+' aprobada');
  loadApr();loadABadge();
  // Show PDF preview with send button
  const{data:cot}=await sb.from('cotizaciones').select('*').eq('id',id).single();
  if(cot){
    const pdfItems=(items||[]).map(i=>({...i,prod:{descripcion:i.descripcion,marca:i.marca,tipo_uso:'',foto_url:null,ic:i.marca==='SERVICIO'?'🔧':'🔵',nm:i.descripcion},tipo:i.marca==='SERVICIO'?'s':'n',up:i.precio_unit,qty:i.cantidad}));
    openPDF(buildPDF({...cot,neto,iva,total}, pdfItems), em, num, true);
  }
}

async function rejQ(id){await sb.from('cotizaciones').update({estado:'rechazada',aprobado_por:state.ME.id,aprobado_at:new Date().toISOString()}).eq('id',id);showToast('Cotización rechazada');loadApr();loadABadge();}

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

async function previewCot(id){
  const{data:cot}=await sb.from('cotizaciones').select('*,cotizacion_items(*)').eq('id',id).single();
  if(!cot)return;
  const items=(cot.cotizacion_items||[]).map(i=>({
    ...i,
    prod:{descripcion:i.descripcion,marca:i.marca,tipo_uso:'',foto_url:null,ic:'🔧',nm:i.descripcion},
    tipo:'n',up:i.precio_unit,qty:i.cantidad
  }));
  // Build fichas from product data
  let fichasHTML='';
  const prodIds=[...new Set(items.map(i=>i.producto_id).filter(Boolean))];
  if(prodIds.length>0){
    const modelMap={};
    prodIds.forEach(pid=>{const p=state.PRODS.find(x=>x.id===pid);if(p&&p.modelo&&p.marca){const k=p.marca+'|'+p.modelo+'|'+(p.medida||'');if(!modelMap[k])modelMap[k]={marca:p.marca,modelo:p.modelo,medida:p.medida||'',prod:p};}});
    if(Object.keys(modelMap).length>0){
      const{data:fichas}=await sb.from('fichas_tecnicas').select('*');
      Object.values(modelMap).forEach(m=>{
        const f=fichas?.find(ft=>ft.marca===m.marca&&ft.modelo===m.modelo&&(ft.medida||'')===(m.medida||''));
        fichasHTML+=buildFichaPage(f||{marca:m.marca,modelo:m.modelo,medida:m.medida,segmento:m.prod.tipo_vehiculo||'CAMION',aplicacion:m.prod.tipo_uso||''},[m.prod],fichas);
      });
    }
  }
  const isMgr=state.ROLE==='gerente'||state.ROLE==='admin';
  const pdfHTML=buildPDF(cot,items);
  const fullHTML=fichasHTML?pdfHTML.replace('</body></html>',fichasHTML+'</body></html>'):pdfHTML;
  openPDF(fullHTML, cot.cliente_email||'', cot.numero, isMgr&&!!cot.cliente_email);
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

async function loadFichas(){
  const{data}=await sb.from('fichas_tecnicas').select('*').order('marca');
  state.FICHAS=data||[];
  rFic(state.FICHAS);
}

function rFic(list){
  const filtered=list.filter(f=>{
    if(state.FIC_SEG&&f.segmento!==state.FIC_SEG)return false;
    if(state.FIC_Q){const q=state.FIC_Q.toLowerCase();if(!f.marca?.toLowerCase().includes(q)&&!f.modelo?.toLowerCase().includes(q)&&!f.nombre_comercial?.toLowerCase().includes(q))return false;}
    return true;
  });
  const tb=document.getElementById('fictb');
  if(!filtered.length){tb.innerHTML='<tr><td colspan="10" style="text-align:center;padding:32px;color:var(--g500)">Sin fichas técnicas</td></tr>';return;}
  tb.innerHTML=filtered.map(f=>{
    const campos=[f.telas,f.profundidad,f.li_ss,f.peso,f.indice_velocidad,f.medidas_disponibles];
    const filled=campos.filter(Boolean).length;
    const total=f.segmento==='CAMION'?5:5;
    const pct=Math.round(filled/total*100);
    const stColor=pct>=80?'var(--green)':pct>=50?'var(--amber)':'var(--red)';
    return `<tr>
      <td style="font-weight:700;color:var(--red);font-size:11px;">${f.marca}</td>
      <td style="font-weight:700;">${f.modelo}</td>
      <td style="font-size:11px;color:var(--g600);">${f.nombre_comercial||'—'}</td>
      <td><span style="background:${f.segmento==='CAMION'?'#0F172A':'#64748B'};color:white;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;">${f.segmento}</span></td>
      <td style="font-size:11px;">${f.aplicacion||'—'}</td>
      <td style="font-size:11px;">${f.telas||'<span style="color:var(--g300)">—</span>'}</td>
      <td style="font-size:11px;">${f.li_ss||'<span style="color:var(--g300)">—</span>'}</td>
      <td style="font-size:11px;">${f.peso||'<span style="color:var(--g300)">—</span>'}</td>
      <td><span style="font-size:10px;font-weight:700;color:${stColor};">${pct}%</span></td>
      <td><button onclick="openEditFic('${f.id}')" style="background:none;border:none;cursor:pointer;font-size:14px;" title="Editar">✏️</button></td>
    </tr>`;
  }).join('');
}

function fFic(q){state.FIC_Q=q;rFic(state.FICHAS);}
function setFicSeg(v,btn){state.FIC_SEG=v;document.querySelectorAll('#fic-seg-chips .chip').forEach(b=>b.classList.remove('on'));btn.classList.add('on');rFic(state.FICHAS);}

function cancelFic(){
  closeModal('modal-fic');
  // Si veníamos del cotizador, volver a abrir el panel de fichas
  if(_ficqReturnAfterSave){
    _ficqReturnAfterSave=false;
    setTimeout(renderFicQ,200);
  }
}

async function upFicImg(event){
  const input=event.target;
  const file=input.files&&input.files[0];if(!file)return;
  input.disabled=true;
  showToast('Subiendo imagen…');
  try{
    const comp=await compImg(file,900);
    const marca=cleanPathPart((document.getElementById('fic-marca').value||'fic').toUpperCase().trim());
    const modelo=cleanPathPart((document.getElementById('fic-modelo').value||'mod').toUpperCase().trim());
    const fn=uniqueJpgPath('fichas','fic_'+marca+'_'+modelo);
    const{error:upErr}=await sb.storage.from('fotos-neumaticos').upload(fn,comp,{contentType:'image/jpeg',cacheControl:'3600',upsert:false});
    if(upErr){showToast('Error al subir: '+upErr.message);console.error('Storage ficha error:',upErr);return;}
    const{data:ud}=sb.storage.from('fotos-neumaticos').getPublicUrl(fn);
    const url=ud.publicUrl;
    document.getElementById('fic-img').value=url;
    const prev=document.getElementById('fic-img-preview');
    prev.innerHTML=`<img src="${url}" style="width:100%;height:100%;object-fit:cover;">`;
    showToast('✓ Imagen subida');
  }catch(e){showToast('Error: '+e.message);console.error(e);}
  finally{input.value='';input.disabled=false;}
}

function ficSegChange(){
  const seg=document.getElementById('fic-segmento').value;
  const aplSel=document.getElementById('fic-aplicacion');
  const tireFields=document.getElementById('fic-tire-fields');
  const llantaFields=document.getElementById('fic-llanta-fields');
  if(seg==='CAMION'){
    aplSel.innerHTML='<option value="DIRECCIONAL">Direccional</option><option value="TRACCION">Tracción</option><option value="MIXTO">Mixto</option><option value="FAENERO">Faenero</option>';
    tireFields.style.display='grid';
    llantaFields.style.display='none';
  } else if(seg==='AUTO'){
    aplSel.innerHTML='<option value="CITY/TOURING">City/Touring</option><option value="SPORT">Sport</option><option value="SUV">SUV</option><option value="ALL TERRAIN">All Terrain</option><option value="MUD TERRAIN">Mud Terrain</option><option value="COMERCIAL">Comercial</option>';
    tireFields.style.display='grid';
    llantaFields.style.display='none';
  } else {
    // LLANTA
    aplSel.innerHTML='<option value="LLANTA">Llanta</option>';
    tireFields.style.display='none';
    llantaFields.style.display='block';
  }
}

let _ficqModels=[];
async function openFicQ(){
  // Cerrar cualquier modal abierto antes de abrir ficq
  closeModal('modal-fic');
  _ficqReturnAfterSave=false;
  const seen=new Set();
  _ficqModels=[];
  state.Q.filter(i=>i.tipo==='n').forEach(i=>{
    const key=(i.prod.marca||'')+'|'+(i.prod.modelo||'')+'|'+(i.prod.medida||'');
    if(!seen.has(key)){seen.add(key);_ficqModels.push({marca:i.prod.marca||'',modelo:i.prod.modelo||'',medida:i.prod.medida||''});}
  });
  if(!_ficqModels.length){showToast('No hay neumáticos en la cotización');return;}
  await renderFicQ();
}

async function renderFicQ(){
  document.getElementById('modal-ficq')?.remove();
  let fichas=[];
  try{const{data}=await sb.from('fichas_tecnicas').select('*');fichas=data||[];}catch(e){console.error('Error cargando fichas:',e);}
  const wrap=document.createElement('div');
  wrap.id='modal-ficq';
  wrap.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:600;display:flex;align-items:center;justify-content:center;';
  const inner=document.createElement('div');
  inner.style.cssText='background:white;border-radius:14px;width:min(560px,95vw);max-height:80vh;overflow-y:auto;padding:20px;';
  inner.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
    <span style="font-size:15px;font-weight:700;">📑 Fichas técnicas de esta cotización</span>
    <button id="ficq-close" style="background:none;border:none;font-size:20px;cursor:pointer;color:#94A3B8;">✕</button>
  </div>`;
  _ficqModels.forEach((m,idx)=>{
    const f=fichas?.find(x=>x.marca===m.marca&&x.modelo===m.modelo&&(x.medida||'')===(m.medida||''));
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;justify-content:space-between;padding:10px 12px;border:1.5px solid #E2E8F0;border-radius:8px;margin-bottom:8px;';
    const status=f
      ?'<span style="color:#16A34A;font-size:11px;font-weight:600;">✅ Completa</span>'
      :'<span style="color:#DC2626;font-size:11px;font-weight:600;">⚠️ Sin ficha</span>';
    row.innerHTML=`
      <div>
        <div style="font-weight:700;font-size:13px;">${m.marca||'—'} <span style="color:#C8102E;">${m.modelo||'Sin modelo'}</span></div>
        <div style="font-size:11px;color:#64748B;">${m.medida||'Sin medida'}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">${status}
        <button data-idx="${idx}" data-fid="${f?.id||''}" class="ficq-btn" style="padding:6px 12px;background:${f?'#2563EB':'#C8102E'};color:white;border:none;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;">${f?'✏️ Editar':'+ Crear'}</button>
      </div>`;
    inner.appendChild(row);
  });
  wrap.appendChild(inner);
  document.body.appendChild(wrap);
  // Events
  document.getElementById('ficq-close').onclick=()=>wrap.remove();
  wrap.querySelectorAll('.ficq-btn').forEach(btn=>{
    btn.onclick=async()=>{
      const idx=parseInt(btn.dataset.idx);
      const fid=btn.dataset.fid;
      const m=_ficqModels[idx];
      wrap.remove();
      if(fid){
        const{data:f}=await sb.from('fichas_tecnicas').select('*').eq('id',fid).single();
        if(f){state.FICHAS=[...FICHAS.filter(x=>x.id!==f.id),f];openEditFic(f.id);}
      } else {
        _ficqReturnAfterSave=true;
        openFicModal(m.marca,m.modelo,m.medida);
      }
    };
  });
}

let _ficqReturnAfterSave=false;

function openFicModal(marcaPre='',modeloPre='',medidaPre=''){
  document.getElementById('modal-fic-title').textContent='Nueva ficha técnica';
  document.getElementById('fic-edit-id').value='';
  ['fic-marca','fic-modelo','fic-medida','fic-origen','fic-telas','fic-prof','fic-liss','fic-peso','fic-iv','fic-agujeros','fic-diametro','fic-buje','fic-material','fic-acabado','fic-ensamble','fic-img','fic-notas'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('fic-segmento').value='CAMION';
  // Buscar si ya hay imagen del modelo (en fichas O en productos) para pre-mostrarla
  const M=marcaPre?.toUpperCase().trim(), MO=modeloPre?.toUpperCase().trim();
  const existImg=marcaPre&&modeloPre?
    (state.FICHAS.find(x=>x.marca?.toUpperCase().trim()===M&&x.modelo?.toUpperCase().trim()===MO&&x.imagen_url)?.imagen_url
    || state.PRODS.find(p=>p.marca?.toUpperCase().trim()===M&&p.modelo?.toUpperCase().trim()===MO&&p.foto_url)?.foto_url)
    :null;
  const prev=document.getElementById('fic-img-preview');
  if(existImg){prev.innerHTML=`<img src="${existImg}" style="width:100%;height:100%;object-fit:cover;">`;document.getElementById('fic-img').value=existImg;}
  else{prev.innerHTML='🛞';}
  ficSegChange();
  if(marcaPre) document.getElementById('fic-marca').value=marcaPre;
  if(modeloPre) document.getElementById('fic-modelo').value=modeloPre;
  if(medidaPre) document.getElementById('fic-medida').value=medidaPre;
  const marcas=[...new Set(state.PRODS.map(p=>p.marca).filter(Boolean))].sort();
  document.getElementById('fic-marcas-dl').innerHTML=marcas.map(m=>`<option value="${m}">`).join('');
  openModal('modal-fic');
}

function openEditFic(id){
  const f=state.FICHAS.find(x=>x.id===id);if(!f)return;
  document.getElementById('modal-fic-title').textContent='Editar ficha: '+f.marca+' '+f.modelo+(f.medida?' '+f.medida:'');
  document.getElementById('fic-edit-id').value=f.id;
  document.getElementById('fic-marca').value=f.marca||'';
  document.getElementById('fic-modelo').value=f.modelo||'';
  document.getElementById('fic-medida').value=f.medida||'';
  document.getElementById('fic-segmento').value=f.segmento||'CAMION';
  ficSegChange();
  if(f.aplicacion)document.getElementById('fic-aplicacion').value=f.aplicacion;
  document.getElementById('fic-origen').value=f.origen||'';
  document.getElementById('fic-telas').value=f.telas||'';
  document.getElementById('fic-prof').value=f.profundidad||'';
  document.getElementById('fic-liss').value=f.li_ss||'';
  document.getElementById('fic-peso').value=f.peso||'';
  document.getElementById('fic-iv').value=f.indice_velocidad||'';
  document.getElementById('fic-agujeros').value=f.numero_agujeros||'';
  document.getElementById('fic-diametro').value=f.diametro_agujeros||'';
  document.getElementById('fic-buje').value=f.buje||'';
  document.getElementById('fic-material').value=f.material||'';
  document.getElementById('fic-acabado').value=f.acabado||'';
  document.getElementById('fic-ensamble').value=f.ensamble||'';
  document.getElementById('fic-img').value=f.imagen_url||'';
  const prev=document.getElementById('fic-img-preview');
  if(f.imagen_url){prev.innerHTML=`<img src="${f.imagen_url}" style="width:100%;height:100%;object-fit:cover;">`;}
  else{prev.innerHTML='🛞';}
  document.getElementById('fic-notas').value=f.notas||'';
  const marcas=[...new Set(state.PRODS.map(p=>p.marca).filter(Boolean))].sort();
  document.getElementById('fic-marcas-dl').innerHTML=marcas.map(m=>`<option value="${m}">`).join('');
  openModal('modal-fic');
}

async function saveFic(){
  const id=document.getElementById('fic-edit-id').value;
  const obj={
    marca:document.getElementById('fic-marca').value.toUpperCase().trim(),
    modelo:document.getElementById('fic-modelo').value.toUpperCase().trim(),
    medida:document.getElementById('fic-medida').value.trim()||null,
    segmento:document.getElementById('fic-segmento').value,
    aplicacion:document.getElementById('fic-aplicacion').value,
    origen:document.getElementById('fic-origen').value.trim()||null,
    telas:document.getElementById('fic-telas').value.trim()||null,
    profundidad:document.getElementById('fic-prof').value.trim()||null,
    li_ss:document.getElementById('fic-liss').value.trim()||null,
    peso:document.getElementById('fic-peso').value.trim()||null,
    indice_velocidad:document.getElementById('fic-iv').value.trim()||null,
    numero_agujeros:document.getElementById('fic-agujeros').value.trim()||null,
    diametro_agujeros:document.getElementById('fic-diametro').value.trim()||null,
    buje:document.getElementById('fic-buje').value.trim()||null,
    material:document.getElementById('fic-material').value.trim()||null,
    acabado:document.getElementById('fic-acabado').value.trim()||null,
    ensamble:document.getElementById('fic-ensamble').value.trim()||null,
    imagen_url:document.getElementById('fic-img').value.trim()||null,
    notas:document.getElementById('fic-notas').value.trim()||null,
    updated_at:new Date().toISOString(),
  };
  if(!obj.marca||!obj.modelo){showToast('Marca y modelo son obligatorios');return;}
  let error;
  try{
    if(id){({error}=await sb.from('fichas_tecnicas').update(obj).eq('id',id));}
    else{({error}=await sb.from('fichas_tecnicas').insert(obj));}
  }catch(e){showToast('Error JS: '+e.message);console.error(e);return;}
  if(error){showToast('❌ '+error.message);console.error('Supabase error:',error);return;}
  // La foto es por modelo — sincronizar a TODAS las fichas Y productos del mismo (marca, modelo)
  if(obj.imagen_url){
    try{
      await sb.from('fichas_tecnicas').update({imagen_url:obj.imagen_url}).ilike('marca',obj.marca).ilike('modelo',obj.modelo);
      await sb.from('productos').update({foto_url:obj.imagen_url}).ilike('marca',obj.marca).ilike('modelo',obj.modelo);
    }catch(e){console.warn('Sync foto ficha→productos falló (no crítico):',e);}
    // Actualizar caches locales
    state.PRODS.forEach(p=>{if(p.marca&&p.modelo&&p.marca.toUpperCase().trim()===obj.marca&&p.modelo.toUpperCase().trim()===obj.modelo)p.foto_url=obj.imagen_url;});
  }
  showToast(id?'✓ Ficha actualizada':'✓ Ficha creada');
  closeModal('modal-fic');
  loadFichas();
  if(_ficqReturnAfterSave){_ficqReturnAfterSave=false;setTimeout(renderFicQ,300);}
}

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
