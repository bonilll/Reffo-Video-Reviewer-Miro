"use client";

import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useUser } from "@clerk/nextjs";
import Fuse from 'fuse.js';

export enum ReferenceFilterType {
  ALL = "all",
  PROJECT = "project",
  FAVORITES = "favorites"
}

export interface ReferenceFilter {
  type: ReferenceFilterType;
  projectId?: string;
}

// Interfaccia per un documento di riferimento
interface ReferenceDocument {
  title: string;
  author: string;
  tokens: string[];
  externalLink?: string;
}

interface Reference {
  _id: Id<"assets">;
  _creationTime: number;
  orgId?: string;
  externalLink?: string;
  tokens: string[];
  title: string;
  type: string;
  userId: string;
  createdAt: string;
  author: string;
  fileUrl: string;
  fileName: string;
  metadata?: {
    projectName?: string;
  };
}

export const useReferences = () => {
  const { user } = useUser();
  const userId = user?.id;

  // Stato del filtro
  const [filter, setFilter] = useState<ReferenceFilter>({
    type: ReferenceFilterType.ALL
  });

  // Stato per token di ricerca
  const [searchTokens, setSearchTokens] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Ottieni tutte le reference in base ai filtri
  const references = useQuery(
    api.assets.getAllReferences,
    userId ? {
      userId,
      projectId: filter.type === ReferenceFilterType.PROJECT ? filter.projectId : undefined,
      favouritesOnly: filter.type === ReferenceFilterType.FAVORITES
    } : "skip"
  ) as Reference[];

  // Ottieni tutti gli ID dei preferiti
  const favouriteIds = useQuery(api.favourites.getFavouriteIds);

  // Mutations per gestire i preferiti
  const addToFavourites = useMutation(api.favourites.addToFavourites);
  const removeFromFavourites = useMutation(api.favourites.removeFromFavourites);

  // Funzione per impostare il filtro su "tutte le reference"
  const showAllReferences = useCallback(() => {
    setFilter({ type: ReferenceFilterType.ALL });
  }, []);

  // Funzione per impostare il filtro su un progetto specifico
  const filterByProject = useCallback((projectId: string) => {
    setFilter({ 
      type: ReferenceFilterType.PROJECT,
      projectId
    });
  }, []);

  // Funzione per impostare il filtro sui preferiti
  const showFavorites = useCallback(() => {
    setFilter({ type: ReferenceFilterType.FAVORITES });
  }, []);

  // Funzione per aggiungere/rimuovere dai preferiti
  const toggleFavorite = useCallback(
    async (referenceId: Id<"assets">) => {
      if (!favouriteIds) return;

      const isFavourite = favouriteIds.some(id => id === referenceId);
      
      if (isFavourite) {
        await removeFromFavourites({ referenceId });
      } else {
        await addToFavourites({ referenceId });
      }
    },
    [favouriteIds, addToFavourites, removeFromFavourites]
  );

  // Funzione per verificare se una reference è preferita
  const isFavourite = useCallback(
    (referenceId: Id<"assets">) => {
      if (!favouriteIds) return false;
      return favouriteIds.some(id => id === referenceId);
    },
    [favouriteIds]
  );

  // Aggiungi un token alla ricerca
  const addSearchToken = useCallback((token: string) => {
    setSearchTokens(prev => {
      if (prev.includes(token)) return prev;
      return [...prev, token];
    });
  }, []);

  // Rimuovi un token dalla ricerca
  const removeSearchToken = useCallback((token: string) => {
    setSearchTokens(prev => prev.filter(t => t !== token));
  }, []);

  // Imposta la query di ricerca testuale
  const updateSearchQuery = useCallback((query: string) => {
    setSearchQuery(query);
  }, []);

  // Configurazione di Fuse.js per la ricerca fuzzy
  const fuseOptions = {
    includeScore: true,
    threshold: 0.4, // valore più basso = match più precisi
    distance: 100, // distanza massima per le corrispondenze
    ignoreLocation: true, // ignora la posizione del termine nel testo
    keys: [
      { name: 'title', weight: 2 },   // diamo più peso al titolo
      { name: 'author', weight: 1.5 }, // poi all'autore
      { name: 'externalLink', weight: 0.8 },
      // cerchiamo anche nei token ma con peso inferiore
      { 
        name: 'tokens',
        weight: 1,
        getFn: (obj: ReferenceDocument) => obj.tokens.join(' ') // concatena i token per la ricerca
      }
    ]
  };

  // Analizza la query di ricerca per filtri avanzati
  const parseSearchQuery = (query: string) => {
    // Gestisce filtri con sintassi "exact:"
    if (query.startsWith('exact:')) {
      return {
        text: query.substring(6).trim(),
        isExact: true,
        isStartsWith: false
      };
    }
    // Gestisce filtri con sintassi "startswith:"
    else if (query.startsWith('startswith:')) {
      return {
        text: query.substring(11).trim(),
        isExact: false,
        isStartsWith: true
      };
    }
    // Ricerca normale (fuzzy)
    else {
      return {
        text: query,
        isExact: false,
        isStartsWith: false
      };
    }
  };

  // Filtra le reference in base ai token di ricerca e alla query testuale
  const filteredReferences = useMemo(() => {
    if (!references) return [];
    
    // Prima filtra per token (devono essere presenti tutti i token di ricerca)
    let results = references;
    
    if (searchTokens.length > 0) {
      results = results.filter(ref => 
        searchTokens.every(token => ref.tokens.includes(token))
      );
    }
    
    // Se c'è una query di ricerca, applica i filtri appropriati
    if (searchQuery) {
      const { text, isExact, isStartsWith } = parseSearchQuery(searchQuery);
      
      // Se la query è vuota dopo il parsing, salta il filtraggio
      if (!text) return results;
      
      // Per ricerca esatta
      if (isExact) {
        return results.filter(ref => 
          ref.title.toLowerCase().includes(text.toLowerCase()) ||
          ref.author.toLowerCase().includes(text.toLowerCase()) ||
          (ref.externalLink && ref.externalLink.toLowerCase().includes(text.toLowerCase())) ||
          ref.tokens.some(token => token.toLowerCase().includes(text.toLowerCase()))
        );
      }
      // Per ricerca con inizio parola
      else if (isStartsWith) {
        return results.filter(ref =>
          ref.title.toLowerCase().startsWith(text.toLowerCase()) ||
          ref.author.toLowerCase().startsWith(text.toLowerCase()) ||
          (ref.externalLink && ref.externalLink.toLowerCase().startsWith(text.toLowerCase())) ||
          ref.tokens.some(token => token.toLowerCase().startsWith(text.toLowerCase()))
        );
      }
      // Per ricerca fuzzy standard
      else {
        const fuse = new Fuse(results, fuseOptions);
        const searchResults = fuse.search(text);
        return searchResults.map(result => result.item);
      }
    }
    
    return results;
  }, [references, searchTokens, searchQuery]);

  // Ottieni progetti unici dalle reference (token che iniziano con "project-")
  const projects = useMemo(() => {
    if (!references) return [];

    const projectsSet = new Set<string>();
    
    references.forEach(ref => {
      ref.tokens.forEach(token => {
        if (token.startsWith("project-")) {
          projectsSet.add(token);
        }
      });
    });

    return Array.from(projectsSet).map(projectToken => {
      // Estrai l'ID del progetto dal token (rimuovi il prefisso "project-")
      const projectId = projectToken.substring(8);
      // Conta quante reference hanno questo token
      const count = references.filter(ref => 
        ref.tokens.includes(projectToken)
      ).length;

      return {
        id: projectId,
        token: projectToken,
        count
      };
    });
  }, [references]);

  const getProjectTokens = useCallback(() => {
    if (!references) return [];
    
    const projectCounts = new Map<string, number>();
    
    references.forEach(reference => {
      if (reference.metadata?.projectName) {
        const count = projectCounts.get(reference.metadata.projectName) || 0;
        projectCounts.set(reference.metadata.projectName, count + 1);
      }
    });
    
    return Array.from(projectCounts.entries()).map(([name, count]) => ({
      name,
      count
    }));
  }, [references]);

  return {
    references: filteredReferences,
    loading: references === undefined,
    projects,
    filter,
    showAllReferences,
    filterByProject,
    showFavorites,
    toggleFavorite,
    isFavourite,
    searchTokens,
    searchQuery,
    addSearchToken,
    removeSearchToken,
    updateSearchQuery,
    favouriteIds,
    getProjectTokens
  };
}; 