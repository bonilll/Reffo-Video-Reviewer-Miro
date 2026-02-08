/**
 * Helper per gestire l'autenticazione e l'identificazione dell'utente
 * Questo file può essere espanso con altre funzionalità di autenticazione
 */

// Cache per l'ID utente per evitare troppe chiamate API
let cachedUserId: string | null = null;
let cacheExpiry = 0;
const CACHE_TTL = 60000; // 1 minuto in millisecondi

/**
 * Ottiene l'ID dell'utente corrente
 * Utilizza una cache per migliorare le prestazioni
 */
export async function getCurrentUserId(): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/me');
    const data = await response.json();
    
    if (data?.userId) {
      return data.userId;
    }
    
    console.warn('[AUTH] No user ID found in response:', data);
    return null;
  } catch (error) {
    console.error('[AUTH] Error getting current user ID:', error);
    return null;
  }
}

/**
 * Verifica se l'utente è autenticato
 */
export async function isAuthenticated(): Promise<boolean> {
  try {
    const response = await fetch('/api/auth/me');
    const data = await response.json();
    
    
    return !!data?.userId;
  } catch (error) {
    console.error('[AUTH] Error checking authentication:', error);
    return false;
  }
}

/**
 * Recupera un ID utente valido o restituisce un fallback
 * @param {string} fallback - ID fallback da usare se l'utente non è autenticato
 * @param {boolean} enforceAuthentication - Se true, restituirà null invece del fallback se non autenticato
 */
export async function getUserIdOrFallback(fallback: string = "anonymous", enforceAuthentication: boolean = false): Promise<string | null> {
  const userId = await getCurrentUserId();
  
  if (!userId && enforceAuthentication) {
    return null; // Richiede autenticazione
  }
  
  return userId || fallback;
}

/**
 * Invalida la cache dell'ID utente
 * Utile dopo un login o logout
 */
export function invalidateUserCache(): void {
  cachedUserId = null;
  cacheExpiry = 0;
} 