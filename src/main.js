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
import { loadDash } from './dashboard.js';
import { loadMis, loadAll } from './mis-cotizaciones.js';
import { handleImpFile, registerImportHandlers } from './importar.js';
import { go, toggleSidebar, toggleMobCart, initGmailToken } from './router.js';
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
registerImportHandlers({ renderCat, go });

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







// cleanPathPart, uniqueJpgPath se importan desde ./core/utils.js


// compImg, f2b64 se importan desde ./core/utils.js








// buildPDF, buildFichaPage se importan desde ./core/pdf.js




// ── MOBILE HELPERS ──

















// ── MODAL HELPERS ────────────────────────────────────────
// openModal, closeModal se importan desde ./core/ui.js

// ── NEW / EDIT CLIENTE ────────────────────────────────────



// ── NEW / EDIT PRODUCTO ───────────────────────────────────




// $$ (formatCLP) se importa desde ./core/utils.js
// showToast se importa desde ./core/ui.js

// ── IMPORTAR STOCK DESDE DEFONTANA ───────────────────────


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
