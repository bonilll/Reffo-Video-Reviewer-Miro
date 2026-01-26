/**
 * Formatta il nome di un token per la visualizzazione.
 * Rimuove underscore e caratteri speciali, capitalizzione la prima lettera.
 */
export function formatTokenName(token: string): string {
  if (!token) return "";
  
  // Rimuovi eventuali underscore e trattini
  let formatted = token.replace(/[_-]/g, " ");
  
  // Capitalizza la prima lettera
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/**
 * Normalizza un token per la ricerca/archiviazione.
 * Trasforma in minuscolo, rimuove spazi e caratteri speciali.
 */
export function normalizeToken(token: string): string {
  if (!token) return "";
  
  // Rimuovi spazi, converti in minuscolo
  return token.toLowerCase().trim().replace(/\s+/g, "_");
}

/**
 * Estrae token da un testo.
 */
export function extractTokensFromText(text: string): string[] {
  if (!text) return [];
  
  // Dividi il testo per parole, rimuovi parole troppo corte e duplicati
  const words = text.split(/\s+/);
  const tokens = words
    .filter(word => word.length > 2) // Solo parole più lunghe di 2 caratteri
    .map(word => normalizeToken(word))
    .filter((value, index, self) => self.indexOf(value) === index); // Rimuovi duplicati
  
  return tokens;
}

/**
 * Normalizza un array di token
 */
export const normalizeTokensArray = (tokens: string[]): string[] => {
  return tokens.map(token => normalizeToken(token));
};

/**
 * Converte ID token in nomi (per visualizzazione)
 * @param ids Array di ID token
 * @param allTokens Elenco completo dei token disponibili
 */
export const tokenIdsToNames = (ids: string[], allTokens: any[]): string[] => {
  if (!ids || !Array.isArray(ids) || ids.length === 0) return [];
  if (!allTokens || !Array.isArray(allTokens) || allTokens.length === 0) return ids;
  
  return ids.map(id => {
    // Verifica se è un ID valido cercando una corrispondenza diretta
    const token = allTokens.find(t => t._id === id);
    
    // Se trovato, restituisci il nome
    if (token && token.name) {
      return token.name;
    }
    
    // Se non è un ID valido, potrebbe già essere un nome
    // Verifica confrontando i nomi normalizzati
    const tokenByName = allTokens.find(t => 
      normalizeToken(t.name) === normalizeToken(id)
    );
    
    if (tokenByName && tokenByName.name) {
      return tokenByName.name;
    }
    
    // Altrimenti restituisci l'ID originale (potrebbe essere già un nome)
    return id;
  });
};

/**
 * Converte nomi token in ID (per salvataggio)
 * @param names Array di nomi token
 * @param allTokens Elenco completo dei token disponibili
 */
export const tokenNamesToIds = (names: string[], allTokens: any[]): string[] => {
  if (!names || !Array.isArray(names) || names.length === 0) return [];
  if (!allTokens || !Array.isArray(allTokens) || allTokens.length === 0) return names;
  
  return names.map(name => {
    // Verifica prima se è già un ID valido
    const isAlreadyId = allTokens.some(t => t._id === name);
    if (isAlreadyId) return name;
    
    // Cerca un token con nome corrispondente
    const token = allTokens.find(t => normalizeToken(t.name) === normalizeToken(name));
    return token ? token._id : name;
  });
};

/**
 * Raggruppa i token per categoria
 * @param tokens Elenco di token
 */
export const groupTokensByCategory = (tokens: any[]): Record<string, any[]> => {
  const tokensByCategory: Record<string, any[]> = {};
  
  // Raggruppa i token per categoria
  tokens.forEach(token => {
    const category = token.category || 'Custom';
    if (!tokensByCategory[category]) {
      tokensByCategory[category] = [];
    }
    tokensByCategory[category].push(token);
  });
  
  return tokensByCategory;
};

/**
 * Filtra i token in base a una query di ricerca
 * @param tokens Elenco di token da filtrare
 * @param searchQuery Query di ricerca
 */
export const filterTokensBySearchQuery = (tokens: any[], searchQuery: string): any[] => {
  if (!searchQuery.trim()) return tokens;
  
  const normalizedQuery = normalizeToken(searchQuery);
  return tokens.filter(token => 
    normalizeToken(token.name).includes(normalizedQuery) ||
    (token.normalizedName && token.normalizedName.includes(normalizedQuery))
  );
}; 