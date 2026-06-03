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
import { sb, withTimeout } from './supabase.js';
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

  // Failsafe: si la red se cuelga sí o sí desbloqueo el botón a los 15s
  const unstick = setTimeout(() => {
    if (btn.disabled) {
      btn.disabled = false;
      btn.textContent = 'Ingresar';
      showErr('La conexión está lenta. Intentá de nuevo.');
    }
  }, 15000);

  try {
    const { error } = await withTimeout(
      sb.auth.signInWithPassword({ email: em, password: pw }),
      12000,
      'login',
    );
    if (error) {
      showErr('Correo o contraseña incorrectos');
      btn.disabled = false;
      btn.textContent = 'Ingresar';
    }
    // Si fue exitoso, onAuthStateChange dispara onLogin() automáticamente.
  } catch (e) {
    console.error('[auth] doLogin error:', e);
    const msg = e.message?.includes('Timeout') || e.message?.includes('aborted') || e.message?.includes('Failed to fetch')
      ? 'No se pudo conectar. Revisá tu internet y reintentá.'
      : 'Error: ' + e.message;
    showErr(msg);
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  } finally {
    clearTimeout(unstick);
  }
}

// ─── Logout (con fallback forzado si Supabase no responde) ───
export async function doLogout() {
  try {
    await withTimeout(sb.auth.signOut(), 5000, 'logout');
  } catch (e) {
    console.warn('[auth] signOut colgado/falló — forzando cleanup local:', e.message);
    // Si Supabase no responde, limpiamos manualmente la sesión de localStorage
    // así el usuario al menos puede salir y volver a entrar.
    try {
      Object.keys(localStorage)
        .filter(k => k.startsWith('sb-') || k.includes('supabase'))
        .forEach(k => localStorage.removeItem(k));
    } catch (le) { console.warn('[auth] no se pudo limpiar localStorage:', le); }
  }
  // Mostramos login sí o sí — no esperamos al onAuthStateChange (que también puede colgar)
  showLogin();
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

  // Buscar rol en tabla `usuarios` con timeout corto. Si se cuelga o falla,
  // caemos al fallback por email — el usuario entra igual y la app no queda
  // pegada en "Ingresando..." durante 36 segundos.
  state.ROLE = null;
  try {
    const { data, error } = await withTimeout(
      sb.from('usuarios').select('*').eq('id', user.id).maybeSingle(),
      5000,
      'query usuarios',
    );
    console.log('[auth] usuarios query:', { data, error });
    if (error) console.error('[auth] Error consultando usuarios:', error);
    if (data) {
      state.ROLE = data.rol || 'vendedor';
      state.UNAME = data.nombre || user.email.split('@')[0];
    }
  } catch (e) {
    console.warn('[auth] usuarios query falló/timeout — voy al fallback:', e.message);
  }

  // Fallback si no hay registro en `usuarios` o si la query se colgó: deducir por email
  if (!state.ROLE) {
    console.warn('[auth] Usando fallback por email');
    const em = user.email.toLowerCase();
    if (em === 'pablo@scnchile.com') { state.ROLE = 'gerente'; state.UNAME = 'Pablo'; }
    else if (em === 'juan.palmess@gmail.com' || em === 'jpalmes@scnchile.com') { state.ROLE = 'admin'; state.UNAME = 'JP'; }
    else { state.ROLE = 'vendedor'; state.UNAME = em.split('@')[0]; }
  }
  console.log('[auth] Final state.ROLE:', state.ROLE);

  // Lanzamos showApp con try/catch así si peta cargando productos/clientes
  // el botón al menos se libera y el usuario ve qué pasó
  try {
    await _onLoggedIn();
  } catch (e) {
    console.error('[auth] _onLoggedIn falló:', e);
    showErr('Sesión iniciada pero hubo un error cargando datos: ' + e.message);
  }
}

// ─── Inicialización al arrancar la app ───
export async function initAuth() {
  loadLS(); // estadísticas en pantalla de login (no bloqueante)
  const { data: { session } } = await sb.auth.getSession();
  if (session) await onLogin(session.user);
  sb.auth.onAuthStateChange(async (ev, sess) => {
    // Ignorar TOKEN_REFRESHED y SIGNED_IN repetidos (visibility refresh dispara
    // SIGNED_IN para el mismo user → re-corría onLogin y bloqueaba requests).
    if (ev === 'SIGNED_IN' && sess) {
      if (state.ME && state.ME.id === sess.user.id) {
        console.log('[auth] SIGNED_IN ignorado (mismo usuario, refresh)');
        return;
      }
      await onLogin(sess.user);
    }
    if (ev === 'SIGNED_OUT') showLogin();
  });
}
