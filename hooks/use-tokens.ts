"use client";

import { useState, useCallback } from "react";
import { api } from "@/convex/_generated/api";
import { useQuery, useMutation } from "convex/react";
import { tokenIdsToNames, tokenNamesToIds } from "@/lib/token-utils";

export interface Token {
  _id?: string;
  name: string;
  normalizedName: string;
  category: string;
  usageCount: number;
  createdAt: string;
}

export interface UseTokensOptions {
  useIds?: boolean; // Se true, l'hook gestisce gli ID dei token, altrimenti nomi
}

export const useTokens = (options: UseTokensOptions = {}) => {
  const { useIds = true } = options;
  const [selectedTokens, setSelectedTokens] = useState<string[]>([]);
  
  // Ottiene tutti i token disponibili
  const allTokens = useQuery(api.tokens.getAll) || [];
  
  // Mutation per creare un nuovo token
  const createToken = useMutation(api.tokens.create);
  
  // Ottieni i token selezionati come nomi (per visualizzazione)
  const selectedTokenNames = useCallback(() => {
    return useIds ? tokenIdsToNames(selectedTokens, allTokens) : selectedTokens;
  }, [selectedTokens, allTokens, useIds]);
  
  // Ottieni i token selezionati come ID (per salvataggio)
  const selectedTokenIds = useCallback(() => {
    return useIds ? selectedTokens : tokenNamesToIds(selectedTokens, allTokens);
  }, [selectedTokens, allTokens, useIds]);
  
  // Aggiunge un token alla selezione
  const addToken = useCallback((token: string) => {
    setSelectedTokens((prev) => {
      // Se il token è ID e useIds=true o se è nome e useIds=false
      if (prev.includes(token)) return prev;
      
      // Converti in ID se necessario
      let tokenToAdd = token;
      if (!useIds) {
        // Cerchiamo l'ID corrispondente al nome
        const foundToken = allTokens.find(t => t.name === token);
        if (foundToken && useIds) {
          tokenToAdd = foundToken._id;
        }
      }
      
      return [...prev, tokenToAdd];
    });
  }, [allTokens, useIds]);
  
  // Rimuove un token dalla selezione
  const removeToken = useCallback((token: string) => {
    setSelectedTokens((prev) => prev.filter((t) => t !== token));
  }, []);
  
  // Crea un nuovo token personalizzato
  const addCustomToken = useCallback(async (tokenName: string) => {
    if (!tokenName.trim()) return;
    
    tokenName = tokenName.trim();
    
    // Verifica se il token esiste già
    const existingToken = allTokens.find(
      t => t.name.toLowerCase() === tokenName.toLowerCase()
    );
    
    if (existingToken) {
      // Se esiste già, aggiungilo alla selezione
      addToken(useIds ? existingToken._id : existingToken.name);
      return;
    }
    
    // Altrimenti, crea un nuovo token
    const result = await createToken({ 
      name: tokenName, 
      category: "Custom"
    });
    
    // Aggiungi il token alla selezione (come ID o nome in base a useIds)
    if (result && result._id) {
      addToken(useIds ? result._id : result.name);
    }
  }, [allTokens, addToken, createToken, useIds]);
  
  // Reset dei token selezionati
  const resetTokens = useCallback(() => {
    setSelectedTokens([]);
  }, []);
  
  return {
    tokens: allTokens,
    selectedTokens,
    selectedTokenNames: selectedTokenNames(),
    selectedTokenIds: selectedTokenIds(),
    addToken,
    removeToken,
    addCustomToken,
    resetTokens,
  };
}; 