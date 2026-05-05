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

async function loadProds(){
  const{data}=await sb.from('productos').select('*').eq('es_servicio',false).eq('activo',true).order('marca');
  state.PRODS=(data||[]).map(p=>({...p,precio_venta:p.precio_venta>0?p.precio_venta:Math.round((p.costo_unitario||0)*1.35)}));
  const brands=[...new Set(state.PRODS.map(p=>p.marca).filter(Boolean))].sort();
  const bSel=document.getElementById('bch-sel');
  const curBrand=bSel?.value||'';
  if(bSel)bSel.innerHTML='<option value="">Todas las marcas</option>'+brands.map(b=>`<option value="${b}"${b===curBrand?' selected':''}>${b}</option>`).join('');
  const tipos=[...new Set(state.PRODS.map(p=>p.tipo_uso).filter(Boolean))].sort();
  document.getElementById('tch').innerHTML='<button class="chip on" onclick="st2(\'\',this)">Todos</button>'+
    tipos.map(t=>{const tc=TCLASS(t);return `<button class="chip" onclick="st2('${t}',this)">${t}</button>`;}).join('');
}
async function loadSmap(){
  const{data}=await sb.from('stock').select('*');
  state.SMAP={};
  (data||[]).forEach(r=>{
    if(!state.SMAP[r.producto_id])state.SMAP[r.producto_id]={q:0,a:0,l:0,t:0};
    const s=state.SMAP[r.producto_id];
    if(r.bodega==='SCN QUILICURA')s.q=r.cantidad;
    if(r.bodega==='BODEGA AUTO')s.a=r.cantidad;
    if(r.bodega==='LOS ANDES')s.l=r.cantidad;
    s.t=s.q+s.a+s.l;
  });
}
async function loadClis(){const{data}=await sb.from('clientes').select('*').order('nombre');state.CLIS=data||[];}
function buildDL(){document.getElementById('cll').innerHTML=state.CLIS.map(c=>`<option value="${c.nombre}" data-rut="${c.rut}" data-em="${c.email||''}">`).join('');}
function aFill(){const v=document.getElementById('qcl').value;const c=state.CLIS.find(x=>x.nombre===v);if(c){document.getElementById('qrt').value=c.rut||'';document.getElementById('qem').value=c.email||'';}}
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

async function upPhoto(event,pid){
  const input=event.target;
  const file=input.files&&input.files[0];if(!file)return;
  input.disabled=true;
  showToast('Subiendo foto...');
  try{
    const comp=await compImg(file,800);
    const fn=uniqueJpgPath('productos','prod_'+pid);
    const{error:upErr}=await sb.storage.from('fotos-neumaticos').upload(fn,comp,{contentType:'image/jpeg',cacheControl:'3600',upsert:false});
    if(upErr){showToast('Error al subir: '+upErr.message);console.error('Storage error:',upErr);return;}
    const{data:ud}=sb.storage.from('fotos-neumaticos').getPublicUrl(fn);
    const url=ud.publicUrl;
    const{error:dbErr}=await sb.from('productos').update({foto_url:url}).eq('id',pid);
    if(dbErr){showToast('Error guardando URL: '+dbErr.message);console.error('DB foto_url error:',dbErr);return;}
    const p=state.PRODS.find(x=>x.id===pid);if(p)p.foto_url=url;
    // Sincronizar foto a TODOS los productos y fichas del mismo (marca, modelo) — la foto es por modelo, no por SKU
    if(p&&p.marca&&p.modelo){
      const M=p.marca.toUpperCase().trim(), MO=p.modelo.toUpperCase().trim();
      try{
        await sb.from('productos').update({foto_url:url}).ilike('marca',M).ilike('modelo',MO);
        await sb.from('fichas_tecnicas').update({imagen_url:url}).ilike('marca',M).ilike('modelo',MO);
      }catch(e){console.warn('Sync foto a productos/fichas falló (no crítico):',e);}
      // Actualizar caches locales
      state.PRODS.forEach(x=>{if(x.marca&&x.modelo&&x.marca.toUpperCase().trim()===M&&x.modelo.toUpperCase().trim()===MO)x.foto_url=url;});
      if(typeof state.FICHAS!=='undefined'&&Array.isArray(state.FICHAS)){
        state.FICHAS.forEach(f=>{if(f.marca&&f.modelo&&f.marca.toUpperCase().trim()===M&&f.modelo.toUpperCase().trim()===MO)f.imagen_url=url;});
      }
    }
    renderCat();
    showToast('✓ Foto guardada y sincronizada con la ficha técnica');
  }catch(e){showToast('Error: '+e.message);console.error(e);}
  finally{input.value='';input.disabled=false;}
}

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

function rCli(data){document.getElementById('clitb').innerHTML=data.slice(0,100).map(c=>`<tr>
  <td class="mn" style="font-size:11px">${c.rut}</td><td style="font-weight:600">${c.nombre}</td>
  <td><span class="bdg b${c.segmento==='VIP'?'vip':c.segmento==='MEDIANO'?'med':'peq'}">${c.segmento||'—'}</span></td>
  <td class="mn">${$$(c.total_ventas_2025)}</td>
  <td style="color:var(--g500);font-size:11px">${c.email||'—'}</td>
  <td style="font-size:11px">${c.telefono||'—'}</td>
  <td><button onclick="openEditCli('${c.id}')" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--g400);" onmouseover="this.style.color='var(--blue)'" onmouseout="this.style.color='var(--g400)'">✏️</button></td>
</tr>`).join('');}
function fCli(q){rCli(state.CLIS.filter(c=>!q||c.nombre.toLowerCase().includes(q.toLowerCase())||c.rut.includes(q)));}

function rStk(data){document.getElementById('stktb').innerHTML=data.slice(0,150).map(p=>{
  const s=state.SMAP[p.id]||{q:0,a:0,l:0,t:0};
  const sc=s.t>5?'sok':s.t>0?'slow':'szero';
  return`<tr>
    <td style="font-size:11px;max-width:180px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${p.descripcion}</td>
    <td style="font-weight:600;color:var(--red);font-size:11px">${p.marca}</td>
    <td class="mn" style="font-size:11px">${p.medida}</td>
    <td style="text-align:center"><span class="p-stk ${s.q>0?'sok':'szero'}">${s.q}</span></td>
    <td style="text-align:center"><span class="p-stk ${s.a>0?'sok':'szero'}">${s.a}</span></td>
    <td style="text-align:center"><span class="p-stk ${s.l>0?'sok':'szero'}">${s.l}</span></td>
    <td style="text-align:center"><span class="p-stk ${sc}"><strong>${s.t}</strong></span></td>
    <td><button onclick="openEditProd('${p.id}')" style="background:none;border:none;cursor:pointer;font-size:14px;color:var(--g400);" onmouseover="this.style.color='var(--blue)'" onmouseout="this.style.color='var(--g400)'">✏️</button></td>
  </tr>`;}).join('');}
function fStk(q){rStk(state.PRODS.filter(p=>!q||p.descripcion?.toLowerCase().includes(q.toLowerCase())||p.marca?.toLowerCase().includes(q.toLowerCase())));}

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

function rPre(data){document.getElementById('pretb').innerHTML=data.slice(0,80).map(p=>`
  <div style="display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--g100);">
    <div style="flex:1;min-width:0;"><div style="font-size:12px;font-weight:600;">${p.marca||''} ${p.medida||''} ${p.modelo||''}</div><div style="font-size:10px;color:var(--g500)">Costo: ${$$(p.costo_unitario)}</div></div>
    <input type="number" value="${p.precio_venta}" style="width:110px;padding:6px 9px;border:1.5px solid var(--g200);border-radius:6px;font-family:var(--mono);font-size:12px;text-align:right;outline:none;" onfocus="this.style.borderColor='var(--red)'" onblur="this.style.borderColor='var(--g200)'" onchange="svPr('${p.id}',this.value)">
  </div>`).join('');}
function fPre(q){rPre(state.PRODS.filter(p=>!q||p.descripcion?.toLowerCase().includes(q.toLowerCase())||p.marca?.toLowerCase().includes(q.toLowerCase())));}
async function svPr(id,v){const pr=parseFloat(v)||0;await sb.from('productos').update({precio_venta:pr}).eq('id',id);const p=state.PRODS.find(x=>x.id===id);if(p)p.precio_venta=pr;showToast('✓ Precio guardado');}

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
function openNewCli(){
  document.getElementById('modal-cli-title').textContent='Nuevo cliente';
  document.getElementById('cli-edit-id').value='';
  ['cli-nm','cli-rut','cli-em','cli-tel','cli-cnt','cli-dir','cli-notas'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('cli-seg').value='PEQUEÑO';
  document.getElementById('cli-dc').value='30';
  openModal('modal-cli');
}

async function openEditCli(id){
  const c=state.CLIS.find(x=>x.id===id);
  if(!c)return;
  document.getElementById('modal-cli-title').textContent='Editar cliente';
  document.getElementById('cli-edit-id').value=c.id;
  document.getElementById('cli-nm').value=c.nombre||'';
  document.getElementById('cli-rut').value=c.rut||'';
  document.getElementById('cli-em').value=c.email||'';
  document.getElementById('cli-tel').value=c.telefono||'';
  document.getElementById('cli-cnt').value=c.contacto||'';
  document.getElementById('cli-dir').value=c.direccion||'';
  document.getElementById('cli-seg').value=c.segmento||'PEQUEÑO';
  document.getElementById('cli-dc').value=c.dias_credito||30;
  document.getElementById('cli-notas').value=c.notas||'';
  openModal('modal-cli');
}

async function saveCli(){
  const editId=document.getElementById('cli-edit-id').value;
  const nm=document.getElementById('cli-nm').value.trim();
  const rut=document.getElementById('cli-rut').value.trim();
  if(!nm||!rut){showToast('Nombre y RUT son obligatorios');return;}
  const payload={
    nombre:nm, rut:rut,
    email:document.getElementById('cli-em').value.trim()||null,
    telefono:document.getElementById('cli-tel').value.trim()||null,
    contacto:document.getElementById('cli-cnt').value.trim()||null,
    direccion:document.getElementById('cli-dir').value.trim()||null,
    segmento:document.getElementById('cli-seg').value,
    dias_credito:parseInt(document.getElementById('cli-dc').value)||30,
    notas:document.getElementById('cli-notas').value.trim()||null,
  };
  let error;
  if(editId){
    ({error}=await sb.from('clientes').update(payload).eq('id',editId));
  } else {
    ({error}=await sb.from('clientes').insert({...payload, total_ventas_2025:0}));
  }
  if(error){showToast('Error: '+error.message);return;}
  showToast(editId?'✓ Cliente actualizado':'✓ Cliente creado');
  closeModal('modal-cli');
  await loadClis();
  buildDL();
  rCli(state.CLIS);
}

// ── NEW / EDIT PRODUCTO ───────────────────────────────────
function openNewProd(){
  document.getElementById('modal-prod-title').textContent='Nuevo producto';
  document.getElementById('prod-edit-id').value='';
  document.getElementById('prod-id').disabled=false;
  ['prod-desc','prod-marca','prod-medida','prod-id','prod-modelo','prod-telas','prod-prof','prod-ic','prod-iv','prod-peso'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('prod-costo').value='';
  document.getElementById('prod-precio').value='';
  document.getElementById('prod-stk-q').value='0';
  document.getElementById('prod-stk-a').value='0';
  document.getElementById('prod-stk-l').value='0';
  document.getElementById('prod-tipo').value='DIRECCIONAL';
  document.getElementById('prod-veh').value='CAMION';
  openModal('modal-prod');
}

async function openEditProd(id){
  const p=state.PRODS.find(x=>x.id===id);
  if(!p)return;
  document.getElementById('modal-prod-title').textContent='Editar producto';
  document.getElementById('prod-edit-id').value=p.id;
  document.getElementById('prod-desc').value=p.descripcion||'';
  document.getElementById('prod-marca').value=p.marca||'';
  document.getElementById('prod-medida').value=p.medida||'';
  document.getElementById('prod-id').value=p.id;
  document.getElementById('prod-id').disabled=true;
  document.getElementById('prod-costo').value=p.costo_unitario||'';
  document.getElementById('prod-precio').value=p.precio_venta||'';
  document.getElementById('prod-tipo').value=p.tipo_uso||'DIRECCIONAL';
  document.getElementById('prod-veh').value=p.tipo_vehiculo||'CAMION';
  const s=state.SMAP[p.id]||{q:0,a:0,l:0};
  document.getElementById('prod-stk-q').value=s.q;
  document.getElementById('prod-stk-a').value=s.a;
  document.getElementById('prod-stk-l').value=s.l;
  document.getElementById('prod-modelo').value=p.modelo||'';
  document.getElementById('prod-telas').value=p.telas||'';
  document.getElementById('prod-prof').value=p.profundidad||'';
  document.getElementById('prod-ic').value=p.indice_carga||'';
  document.getElementById('prod-iv').value=p.indice_velocidad||'';
  document.getElementById('prod-peso').value=p.peso_kg||'';
  openModal('modal-prod');
}

async function saveProd(){
  const editId=document.getElementById('prod-edit-id').value;
  const desc=document.getElementById('prod-desc').value.trim();
  const marca=document.getElementById('prod-marca').value.trim().toUpperCase();
  const prodId=(editId||document.getElementById('prod-id').value.trim()||Date.now().toString());
  if(!desc||!marca){showToast('Descripción y marca son obligatorios');return;}
  const costo=parseFloat(document.getElementById('prod-costo').value)||0;
  const precio=parseFloat(document.getElementById('prod-precio').value)||Math.round(costo*1.35);
  const payload={
    id:prodId, descripcion:desc, marca, 
    medida:document.getElementById('prod-medida').value.trim()||null,
    tipo_uso:document.getElementById('prod-tipo').value,
    tipo_vehiculo:document.getElementById('prod-veh').value,
    costo_unitario:costo, precio_venta:precio,
    es_servicio:false, activo:true,
    modelo:document.getElementById('prod-modelo').value.trim().toUpperCase()||null,
    telas:document.getElementById('prod-telas').value.trim()||null,
    profundidad:document.getElementById('prod-prof').value.trim()||null,
    indice_carga:document.getElementById('prod-ic').value.trim()||null,
    indice_velocidad:document.getElementById('prod-iv').value.trim()||null,
    peso_kg:document.getElementById('prod-peso').value.trim()||null,
  };
  let error;
  if(editId){
    ({error}=await sb.from('productos').update(payload).eq('id',editId));
  } else {
    ({error}=await sb.from('productos').insert(payload));
  }
  if(error){showToast('Error: '+error.message);return;}
  // Save stock
  const bodegas=[
    {bodega:'SCN QUILICURA', cantidad:parseInt(document.getElementById('prod-stk-q').value)||0},
    {bodega:'BODEGA AUTO',   cantidad:parseInt(document.getElementById('prod-stk-a').value)||0},
    {bodega:'LOS ANDES',     cantidad:parseInt(document.getElementById('prod-stk-l').value)||0},
  ];
  let stkError=null;
  for(const b of bodegas){
    const{error:se}=await sb.from('stock').upsert({producto_id:prodId, bodega:b.bodega, cantidad:b.cantidad},{onConflict:'producto_id,bodega'});
    if(se){stkError=se;console.error('Stock upsert error:',b.bodega,se);}
  }
  showToast(stkError?'⚠️ Producto guardado pero error en stock: '+stkError.message:editId?'✓ Producto actualizado':'✓ Producto creado');
  closeModal('modal-prod');
  document.getElementById('prod-id').disabled=false;
  await Promise.all([loadProds(),loadSmap()]);
  renderCat();
  rStk(state.PRODS);
}

function rCrit(){
  const cr=state.PRODS.filter(p=>(state.SMAP[p.id]||{t:0}).t===0);
  const el=document.getElementById('critl');
  if(!cr.length){el.innerHTML='<div class="empty"><div class="ei">✅</div>No hay productos sin stock</div>';return;}
  el.innerHTML=cr.map(p=>`<div style="background:var(--red-l);border:1px solid #FCA5A5;border-radius:8px;padding:10px 14px;margin-bottom:8px;display:flex;align-items:center;gap:10px;"><span style="font-size:18px;">⚠️</span><div><div style="font-size:12px;font-weight:700;color:#9B0D22">${p.marca||''} — ${p.descripcion}</div><div style="font-size:11px;color:var(--red)">Medida: ${p.medida||'—'} · Sin stock en las 3 bodegas</div></div></div>`).join('');
}

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
