/**
 * Color utility functions for working with color values
 */

/**
 * Converts RGB values to a HEX color code
 * 
 * @param r - Red value (0-255)
 * @param g - Green value (0-255)
 * @param b - Blue value (0-255)
 * @returns HEX color string (e.g., "#FF5500")
 */
export function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map(x => 
    x.toString(16).padStart(2, '0')
  ).join('');
}

/**
 * Converts a HEX color string to RGB values
 * 
 * @param hex - HEX color string (e.g., "#FF5500")
 * @returns Array of [r, g, b] values
 */
export function hexToRgb(hex: string): [number, number, number] {
  // Remove # if present
  const cleanHex = hex.startsWith('#') ? hex.slice(1) : hex;
  
  const bigint = parseInt(cleanHex, 16);
  return [
    (bigint >> 16) & 255,
    (bigint >> 8) & 255,
    bigint & 255
  ];
}

/**
 * Calculates the Euclidean distance between two colors
 * 
 * @param c1 - First color in HEX format
 * @param c2 - Second color in HEX format
 * @returns Distance value (lower means more similar)
 */
export function colorDistance(c1: string, c2: string): number {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  
  return Math.sqrt(
    Math.pow(r1 - r2, 2) +
    Math.pow(g1 - g2, 2) +
    Math.pow(b1 - b2, 2)
  );
} 