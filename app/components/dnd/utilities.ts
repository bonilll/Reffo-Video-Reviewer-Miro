import { UniqueIdentifier } from "@dnd-kit/core";

const defaultInitializer = (index: number) => index;

export function createRange<T = number>(
  length: number,
  initializer: (index: number) => any = defaultInitializer
): T[] {
  return [...new Array(length)].map((_, index) => initializer(index));
}

export function arrayMove<T>(array: T[], from: number, to: number): T[] {
  const newArray = array.slice();
  newArray.splice(
    to < 0 ? newArray.length + to : to,
    0,
    newArray.splice(from, 1)[0]
  );
  
  return newArray;
}

export interface Position {
  x: number;
  y: number;
}

export function getNextKey(map: Record<string, any>): string {
  const keys = Object.keys(map);
  const lastKey = keys[keys.length - 1];
  
  if (typeof lastKey === "string" && /^[A-Z]$/.test(lastKey)) {
    // Se è una lettera singola maiuscola (A, B, C, ...), restituisci la successiva
    return String.fromCharCode(lastKey.charCodeAt(0) + 1);
  } else if (typeof lastKey === "string" && /^[A-Z]\d+$/.test(lastKey)) {
    // Se è una lettera seguita da numeri (A1, B2, ...), incrementa il numero
    const letter = lastKey.charAt(0);
    const number = parseInt(lastKey.slice(1), 10);
    return `${letter}${number + 1}`;
  } else if (!isNaN(parseInt(lastKey, 10))) {
    // Se è un numero, incrementalo
    return (parseInt(lastKey, 10) + 1).toString();
  } else {
    // Altrimenti, inizia con ID1
    return "ID1";
  }
}

export function findContainer(items: Record<UniqueIdentifier, UniqueIdentifier[]>, id: UniqueIdentifier) {
  if (id in items) {
    return id;
  }

  return Object.keys(items).find((key) => items[key].includes(id));
} 