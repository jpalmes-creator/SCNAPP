// ============================================================
// SENTRY — Error tracking
// Captura errores en producción y los reporta a sentry.io
// para que veamos los problemas antes que los usuarios los reporten.
// ============================================================

import * as Sentry from '@sentry/browser';

const DSN = import.meta.env.VITE_SENTRY_DSN;

/**
 * Inicializa Sentry. Llamar una vez al arrancar la app.
 * - En desarrollo (npm run dev): NO captura errores (para no spamear el dashboard)
 * - En producción (build deployed): captura todos los errores no manejados
 */
export function initSentry() {
  if (!DSN) {
    if (import.meta.env.PROD) {
      console.warn('[Sentry] VITE_SENTRY_DSN no está definido — error tracking desactivado');
    }
    return;
  }

  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE, // 'development' o 'production'
    enabled: import.meta.env.PROD, // solo activo en producción
    // Capturar pequeño % de transacciones para no llenar el cupo
    tracesSampleRate: 0.1,
    // Cuando el usuario tiene un error, capturar contexto previo (10 segundos antes)
    integrations: [
      // Captura clicks, navegación, etc.
      Sentry.browserTracingIntegration(),
    ],
    // Filtrar errores que no son útiles
    beforeSend(event, hint) {
      const err = hint?.originalException;
      const msg = err?.message || event?.message || '';
      // Ignorar errores de extensiones del navegador
      if (/ResizeObserver loop|Non-Error promise rejection captured/.test(msg)) {
        return null;
      }
      return event;
    },
  });

  // Capturar errores globales que escapen
  window.addEventListener('error', (e) => {
    if (e.error) Sentry.captureException(e.error);
  });
  window.addEventListener('unhandledrejection', (e) => {
    if (e.reason) Sentry.captureException(e.reason);
  });
}

/**
 * Asocia un usuario al stream de errores.
 * Cuando logueamos un usuario, Sentry sabe quién tuvo el error.
 */
export function setSentryUser(user) {
  if (!DSN) return;
  if (user) {
    Sentry.setUser({
      id: user.id,
      email: user.email,
    });
  } else {
    Sentry.setUser(null);
  }
}

/**
 * Captura una excepción manualmente (útil dentro de catch blocks).
 */
export function captureError(err, context = {}) {
  if (!DSN) {
    console.error('[captureError]', err, context);
    return;
  }
  Sentry.captureException(err, { extra: context });
}
