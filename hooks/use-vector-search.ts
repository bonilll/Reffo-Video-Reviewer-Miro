import { useState, useCallback, useMemo, useEffect } from 'react';
import { useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';

interface VectorSearchOptions {
  threshold?: number;
  limit?: number;
  excludeUserId?: string;
}

interface SearchBreakdown {
  vector: number;
  tags: number;
  ai: number;
  color: number;
}

interface VectorSearchResult {
  isLoading: boolean;
  results: any[];
  breakdown?: SearchBreakdown;
  error: string | null;
  searchSimilar: (assetId: Id<"assets">, options?: VectorSearchOptions) => void;
  clearResults: () => void;
  hasVectorMatches: boolean;
  hasTagMatches: boolean;
}

export function useVectorSearch(): VectorSearchResult {
  const [searchParams, setSearchParams] = useState<{
    assetId: Id<"assets"> | null;
    threshold: number;
    limit: number;
    excludeUserId?: string;
  }>({
    assetId: null,
    threshold: 0.6,
    limit: 20,
  });

  const [error, setError] = useState<string | null>(null);

  // Query per la ricerca vettoriale usando la query funzionante
  const similarAssets = useQuery(
    api.assets.getSimilarReferences,
    searchParams.assetId ? {
      referenceId: searchParams.assetId,
      useVectorSimilarity: true,
      similarityThreshold: searchParams.threshold,
      limit: searchParams.limit,
    } : "skip"
  );

  const searchSimilar = useCallback((
    assetId: Id<"assets">, 
    options: VectorSearchOptions = {}
  ) => {
    setError(null);
    setSearchParams({
      assetId,
      threshold: options.threshold ?? 0.6,
      limit: options.limit ?? 20,
      excludeUserId: options.excludeUserId,
    });
  }, []);

  const clearResults = useCallback(() => {
    setSearchParams({
      assetId: null,
      threshold: 0.6,
      limit: 20,
    });
    setError(null);
  }, []);

  return {
    isLoading: searchParams.assetId !== null && similarAssets === undefined,
    results: similarAssets?.references || [],
    error,
    searchSimilar,
    clearResults,
    hasVectorMatches: false,
    hasTagMatches: false
  };
}

/**
 * Hook per la ricerca vettoriale nella library dell'utente con analisi multi-livello
 */
export function useVectorSearchInLibrary(userId: string, orgId?: string): VectorSearchResult {
  const [searchParams, setSearchParams] = useState<{
    similarToAssetId: Id<"assets"> | null;
    threshold: number;
  }>({
    similarToAssetId: null,
    threshold: 0.3, // Lowered to 30% for more permissive results
  });

  const [error, setError] = useState<string | null>(null);

  // Query for advanced similarity search in user library with combined scoring
  const libraryResults = useQuery(
    api.assets.findSimilarInUserLibrary,
    searchParams.similarToAssetId ? {
      userId,
      orgId,
      referenceId: searchParams.similarToAssetId,
      minimumSimilarityThreshold: searchParams.threshold, // Use new parameter name
    } : "skip"
  );


  // Calculate breakdown statistics using useMemo for performance
  const breakdown = useMemo(() => {
    if (!libraryResults || !libraryResults.references) {
      return {
        vector: 0,
        tags: 0,
        ai: 0,
        color: 0
      };
    }

    const results = libraryResults.references;
    // Library now uses vector-only approach like Discover
    return {
      vector: results.length, // All results are vector-based
      tags: 0, // Not used in vector-only approach
      ai: 0, // Not used in vector-only approach
      color: 0, // Not used in library search
    };
  }, [libraryResults]);

  const searchSimilar = useCallback((assetId: Id<"assets">, options?: { threshold?: number }) => {
    
    setError(null);
    setSearchParams({
      similarToAssetId: assetId,
      threshold: options?.threshold ?? 0.6, // Default to 60% like Discover page
    });
  }, []);

  const clearResults = useCallback(() => {
    setSearchParams({
      similarToAssetId: null,
      threshold: 0.6,
    });
    setError(null);
  }, []);

  const isLoading = searchParams.similarToAssetId !== null && libraryResults === undefined;
  const results = libraryResults?.references || [];
  const hasVectorMatches = libraryResults?.hasVectorMatches || false;
  const hasTagMatches = libraryResults?.hasTagMatches || false;


  return {
    isLoading,
    results,
    breakdown,
    searchSimilar,
    clearResults,
    error,
    hasVectorMatches,
    hasTagMatches
  };
}

/**
 * Hook per la ricerca vettoriale nella discover page
 */
export function useVectorSearchInDiscover(): VectorSearchResult {
  const [searchParams, setSearchParams] = useState<{
    similarToAssetId: Id<"assets"> | null;
    threshold: number;
    excludeUserId?: string;
  }>({
    similarToAssetId: null,
    threshold: 0.6,
  });

  const [error, setError] = useState<string | null>(null);

  // Query per la ricerca nella discover page
  const discoverResults = useQuery(
    api.assets.getPublicForDiscover,
    searchParams.similarToAssetId ? {
      similarToAssetId: searchParams.similarToAssetId,
      similarityThreshold: searchParams.threshold,
      excludeUserId: searchParams.excludeUserId,
      limit: 50,
    } : "skip"
  );

  const searchSimilar = useCallback((
    assetId: Id<"assets">, 
    options: VectorSearchOptions = {}
  ) => {
    setError(null);
    setSearchParams({
      similarToAssetId: assetId,
      threshold: options.threshold ?? 0.6,
      excludeUserId: options.excludeUserId,
    });
  }, []);

  const clearResults = useCallback(() => {
    setSearchParams({
      similarToAssetId: null,
      threshold: 0.6,
    });
    setError(null);
  }, []);

  return {
    isLoading: searchParams.similarToAssetId !== null && discoverResults === undefined,
    results: discoverResults || [],
    error,
    searchSimilar,
    clearResults,
    hasVectorMatches: false,
    hasTagMatches: false
  };
} 