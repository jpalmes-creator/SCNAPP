// ============================================================
// AUTH — Login / logout / sesión / roles
// ============================================================
// Maneja todo el ciclo de vida de autenticación:
//   - Verificar sesión existente al cargar
//   - Login con email/password
//   - Logout
//   - Resolver rol del usuario (desde tabla usuarios o fallback por email)
//   - Mostrar/ocultar las pantallas de login/app
//
// El módulo es stand-alone: el código de bootstrap de la app
// (cargar productos, clientes, etc.) NO va acá. Eso vive en main.js
// y se conecta vía `setAuthHandlers({ onLoggedIn: ... })`.
// ============================================================

import { state } from './state.js';
import { sb } from './supabase.js';
import { setSentryUser } from './sentry.js';

// ─── Handlers que main.js conecta para reaccionar a cambios de sesión ───
let _onLoggedIn = async () => {};
let _onLoggedOut = () => {};

/**
 * Registra los callbacks que se ejecutan cuando hay login/logout.
 * @param {object} handlers
 * @param {function} handlers.onLoggedIn - se llama después de resolver el rol
 * @param {function} handlers.onLoggedOut - se llama al cerrar sesión
 */
export function setAuthHandlers({ onLoggedIn, onLoggedOut } = {}) {
  if (onLoggedIn) _onLoggedIn = onLoggedIn;
  if (onLoggedOut) _onLoggedOut = onLoggedOut;
}

// ─── Pantalla de error en login ───
export function showErr(m) {
  const e = document.getElementById('lerr');
  if (!e) return;
  e.textContent = m;
  e.style.display = 'block';
}

// ─── Cargar estadísticas en la pantalla de login ───
async function loadLS() {
  try {
    const [p, c, s] = await Promise.all([
      sb.from('productos').select('id', { count: 'exact', head: true }),
      sb.from('clientes').select('id', { count: 'exact', head: true }),
      sb.from('stock').select('cantidad'),
    ]);
    const setText = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v.toLocaleString('es-CL');
    };
    setText('ls-p', p.count || 0);
    setText('ls-c', c.count || 0);
    setText('ls-s', (s.data || []).reduce((a, r) => a + (r.cantidad || 0), 0));
  } catch (e) {
    // estadísticas opcionales — si falla no pasa nada
  }
}

// ─── Login con email/password ───
export async function doLogin() {
  const em = document.getElementById('le').value.trim();
  const pw = document.getElementById('lp').value;
  if (!em || !pw) { showErr('Completa todos los campos'); return; }
  const btn = document.getElementById('blg');
  btn.disabled = true;
  btn.textContent = 'Ingresando...';
  document.getElementById('lerr').style.display = 'none';
  const { error } = await sb.auth.signInWithPassword({ email: em, password: pw });
  if (error) {
    showErr('Correo o contraseña incorrectos');
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
  // Si fue exitoso, onAuthStateChange dispara onLogin() automáticamente.
}

// ─── Logout ───
export async function doLogout() {
  await sb.auth.signOut();
}

// ─── Mostrar pantalla de login (cuando no hay sesión o se cierra) ───
export function showLogin() {
  document.getElementById('login').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  const b = document.getElementById('blg');
  if (b) { b.disabled = false; b.textContent = 'Ingresar'; }
  setSentryUser(null);
  // Reset state de auth
  state.ME = null;
  state.ROLE = null;
  state.UNAME = null;
  _onLoggedOut();
}

// ─── Callback interno: usuario autenticado, resolver rol ───
async function onLogin(user) {
  state.ME = user;
  setSentryUser(user);
  // Debug: exponer state y sb a window para inspección manual desde DevTools
  window.state = state;
  window.sb = sb;
  console.log('[auth] Login user:', { id: user.id, email: user.email });

  // Buscar rol en tabla `usuarios` (con retry por si la fila aún no se replicó)
  state.ROLE = null;
  let lastError = null;
  for (let i = 0; i < 3; i++) {
    const { data, error } = await sb.from('usuarios').select('*').eq('id', user.id).maybeSingle();
    console.log(`[auth] Intento ${i + 1} usuarios query:`, { data, error });
    if (error) lastError = error;
    if (data) {
      state.ROLE = data.rol || 'vendedor';
      state.UNAME = data.nombre || user.email.split('@')[0];
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  if (lastError) console.error('[auth] Error consultando usuarios:', lastError);

  // Fallback si no hay registro en `usuarios`: deducir por email
  if (!state.ROLE) {
    console.warn('[auth] No se encontró rol en usuarios — usando fallback por email');
    const em = user.email.toLowerCase();
    if (em === 'pablo@scnchile.com') { state.ROLE = 'gerente'; state.UNAME = 'Pablo'; }
    else if (em === 'juan.palmess@gmail.com' || em === 'jpalmes@scnchile.com') { state.ROLE = 'admin'; state.UNAME = 'JP'; }
    else { state.ROLE = 'vendedor'; state.UNAME = em.split('@')[0]; }
  }
  console.log('[auth] Final state.ROLE:', state.ROLE);

  await _onLoggedIn();
}

// ─── Inicialización al arrancar la app ───
export async function initAuth() {
  loadLS(); // estadísticas en pantalla de login (no bloqueante)
  const { data: { session } } = await sb.auth.getSession();
  if (session) await onLogin(session.user);
  sb.auth.onAuthStateChange(async (ev, sess) => {
    if (ev === 'SIGNED_IN' && sess) await onLogin(sess.user);
    if (ev === 'SIGNED_OUT') showLogin();
  });
}
