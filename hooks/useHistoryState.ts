import { useState, useCallback, SetStateAction } from 'react';

interface HistoryState<T> {
  past: T[];
  present: T;
  future: T[];
}

interface UseHistoryStateReturn<T> {
  state: T;
  setState: (newState: SetStateAction<T>) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export function useHistoryState<T>(initialState: T): UseHistoryStateReturn<T> {
  const [history, setHistory] = useState<HistoryState<T>>({
    past: [],
    present: initialState,
    future: [],
  });

  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const setState = useCallback((action: SetStateAction<T>) => {
    setHistory(currentHistory => {
      const newPresent = action instanceof Function ? action(currentHistory.present) : action;
      
      if (JSON.stringify(newPresent) === JSON.stringify(currentHistory.present)) {
        return currentHistory;
      }
      return {
        past: [...currentHistory.past, currentHistory.present],
        present: newPresent,
        future: [],
      };
    });
  }, []);

  const undo = useCallback(() => {
    if (canUndo) {
      setHistory(currentHistory => {
        const previous = currentHistory.past[currentHistory.past.length - 1];
        const newPast = currentHistory.past.slice(0, currentHistory.past.length - 1);
        return {
          past: newPast,
          present: previous,
          future: [currentHistory.present, ...currentHistory.future],
        };
      });
    }
  }, [canUndo]);

  const redo = useCallback(() => {
    if (canRedo) {
      setHistory(currentHistory => {
        const next = currentHistory.future[0];
        const newFuture = currentHistory.future.slice(1);
        return {
          past: [...currentHistory.past, currentHistory.present],
          present: next,
          future: newFuture,
        };
      });
    }
  }, [canRedo]);

  return {
    state: history.present,
    setState,
    undo,
    redo,
    canUndo,
    canRedo,
  };
}
