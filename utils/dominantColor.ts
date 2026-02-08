import ColorThief from 'color-thief-browser';
import { rgbToHex, hexToRgb, colorDistance } from './colorUtils';

/**
 * Extracts the dominant color from an image element
 * 
 * @param imageEl - The HTML Image element to analyze
 * @returns Promise resolving to the dominant color as a HEX string
 */
export async function extractDominantColor(imageEl: HTMLImageElement): Promise<string> {
  const colorThief = new ColorThief();

  return new Promise((resolve, reject) => {
    try {
      if (!imageEl.complete) {
        imageEl.onload = () => {
          try {
            const rgb = colorThief.getColor(imageEl) as [number, number, number];
            resolve(rgbToHex(rgb[0], rgb[1], rgb[2]));
          } catch (error) {
            console.error('Error extracting color from loaded image:', error);
            // Fallback to a default color if extraction fails
            resolve('#CCCCCC');
          }
        };
        imageEl.onerror = (e) => {
          console.error('Error loading image for color extraction:', e);
          reject(new Error('Failed to load image for color extraction'));
        };
      } else {
        try {
          const rgb = colorThief.getColor(imageEl) as [number, number, number];
          resolve(rgbToHex(rgb[0], rgb[1], rgb[2]));
        } catch (error) {
          console.error('Error extracting color from complete image:', error);
          // Fallback to a default color if extraction fails
          resolve('#CCCCCC');
        }
      }
    } catch (error) {
      console.error('Unexpected error in extractDominantColor:', error);
      // Fallback to a default color
      resolve('#CCCCCC');
    }
  });
}

/**
 * Calculates the brightness of a color (0-255)
 * Higher values mean lighter colors
 */
function getColorBrightness(hexColor: string): number {
  const [r, g, b] = hexToRgb(hexColor);
  // This is a common formula for perceived brightness
  return (r * 299 + g * 587 + b * 114) / 1000;
}

/**
 * Checks if a color is too close to black
 */
function isNearlyBlack(hexColor: string): boolean {
  const brightness = getColorBrightness(hexColor);
  return brightness < 60; // Less than ~23% brightness
}

/**
 * Checks if a color is too close to white
 */
function isNearlyWhite(hexColor: string): boolean {
  const brightness = getColorBrightness(hexColor);
  return brightness > 230; // More than ~90% brightness
}

/**
 * Groups similar colors together and returns a representative color for each group
 * 
 * @param colors - Array of HEX color strings
 * @param threshold - Distance threshold for considering colors similar (lower = more groups)
 * @param maxGroups - Maximum number of color groups to return
 * @returns Array of representative colors
 */
export function clusterSimilarColors(colors: string[], threshold: number = 40, maxGroups: number = 5): string[] {
  if (colors.length === 0) return [];
  if (colors.length === 1) return colors;
  
  // Sort colors by brightness to prioritize more vibrant colors
  const sortedColors = [...colors].sort((a, b) => {
    const [r1, g1, b1] = hexToRgb(a);
    const [r2, g2, b2] = hexToRgb(b);
    
    // Simple brightness calculation (higher values = brighter colors)
    const brightness1 = (r1 * 299 + g1 * 587 + b1 * 114) / 1000;
    const brightness2 = (r2 * 299 + g2 * 587 + b2 * 114) / 1000;
    
    // Sort by highest brightness difference from gray (more vibrant first)
    const grayDist1 = Math.abs(brightness1 - 128);
    const grayDist2 = Math.abs(brightness2 - 128);
    
    return grayDist2 - grayDist1;
  });
  
  // Initialize clusters with the first color
  const clusters: { representative: string; members: string[] }[] = [{
    representative: sortedColors[0],
    members: [sortedColors[0]]
  }];
  
  // Assign each color to an existing cluster or create a new one
  for (let i = 1; i < sortedColors.length; i++) {
    const color = sortedColors[i];
    let minDistance = Infinity;
    let closestClusterIndex = -1;
    
    // Find the closest cluster
    for (let j = 0; j < clusters.length; j++) {
      const distance = colorDistance(color, clusters[j].representative);
      if (distance < minDistance) {
        minDistance = distance;
        closestClusterIndex = j;
      }
    }
    
    // If close enough to an existing cluster, add to it
    if (minDistance < threshold && closestClusterIndex !== -1) {
      clusters[closestClusterIndex].members.push(color);
    } else if (clusters.length < maxGroups) {
      // Otherwise create a new cluster (if we haven't hit max)
      clusters.push({
        representative: color,
        members: [color]
      });
    }
  }
  
  // For each cluster, select the most vibrant color as representative
  return clusters.map(cluster => {
    if (cluster.members.length === 1) return cluster.representative;
    
    // Use the first color (already sorted by vibrancy)
    return cluster.members[0];
  });
}

/**
 * Extracts the top two dominant colors from an image that aren't black or white.
 * Processes a large palette (100 colors) for better accuracy.
 * 
 * @param imageEl - The HTML Image element to analyze
 * @returns Promise resolving to an array of dominant colors (max 2) as HEX strings
 */
export async function extractTopDominantColors(imageEl: HTMLImageElement): Promise<string[]> {
  const colorThief = new ColorThief();

  return new Promise((resolve, reject) => {
    try {
      if (!imageEl.complete) {
        imageEl.onload = () => {
          try {
            // Extract up to 100 colors for a detailed palette
            const allPalette = colorThief.getPalette(imageEl, 100) as [number, number, number][];
            
            // Process palette to get dominant colors
            const result = processColorPalette(allPalette);
            resolve(result);
          } catch (error) {
            console.error('Error extracting colors from loaded image:', error);
            // Fallback to a default color palette if extraction fails
            resolve(['#3366CC', '#FF9900']);
          }
        };
        imageEl.onerror = (e) => {
          console.error('Error loading image for color extraction:', e);
          reject(new Error('Failed to load image for color extraction'));
        };
      } else {
        try {
          // Extract up to 100 colors for a detailed palette
          const allPalette = colorThief.getPalette(imageEl, 100) as [number, number, number][];
          
          // Process palette to get dominant colors
          const result = processColorPalette(allPalette);
          resolve(result);
        } catch (error) {
          console.error('Error extracting colors from complete image:', error);
          // Fallback to a default color palette if extraction fails
          resolve(['#3366CC', '#FF9900']);
        }
      }
    } catch (error) {
      console.error('Unexpected error in extractTopDominantColors:', error);
      // Fallback to a default color palette
      resolve(['#3366CC', '#FF9900']);
    }
  });
}

/**
 * Process a full color palette to get the top 2 dominant colors that aren't black or white
 */
function processColorPalette(palette: [number, number, number][]): string[] {
  // Convert to hex
  const hexColors = palette.map(rgb => rgbToHex(rgb[0], rgb[1], rgb[2]));
  
  
  // Log a sample of raw colors before filtering
  hexColors.slice(0, 10).forEach((color, i) => {
    const [r, g, b] = hexToRgb(color);
    const brightness = getColorBrightness(color);
  });
  
  // Filter out colors that are too close to black or white
  // Use less strict filtering to ensure we don't lose too many colors
  const filteredColors = hexColors.filter(color => {
    const brightness = getColorBrightness(color);
    
    // Adjust thresholds to be less strict
    const tooBlack = brightness < 40;  // Was 60
    const tooWhite = brightness > 240; // Was 230
    
    return !tooBlack && !tooWhite;
  });
  
  
  // If filtered results are too small, use less strict filters
  if (filteredColors.length < 3) {
    // Try with even more relaxed thresholds
    const lessStrictFiltered = hexColors.filter(color => {
      const brightness = getColorBrightness(color);
      return brightness > 20 && brightness < 250; 
    });
    
    if (lessStrictFiltered.length > 0) {
      // Use these if we found any
      return lessStrictFiltered.slice(0, 2);
    }
  }
  
  // If no valid colors remain after filtering, return a variety of defaults instead of the same ones
  if (filteredColors.length === 0) {
    // Generate a semi-random default based on the image data to avoid always the same defaults
    // Use the first RGB values in the palette to influence which defaults we return
    if (palette.length > 0) {
      const firstRgb = palette[0];
      const sum = firstRgb[0] + firstRgb[1] + firstRgb[2];
      
      // Choose from multiple default pairs based on the sum
      const defaultPairs = [
        ['#3366CC', '#FF9900'],  // Blue and orange
        ['#CC3366', '#99FF00'],  // Pink and lime
        ['#66CC33', '#9900FF'],  // Green and purple
        ['#FF6633', '#33CCFF'],  // Orange-red and light blue
        ['#FFCC33', '#6633FF'],  // Gold and indigo
      ];
      
      return defaultPairs[sum % defaultPairs.length];
    }
    
    return ['#3366CC', '#FF9900']; // Standard default if no palette at all
  }
  
  // Return top 2 colors (or fewer if not enough available)
  const result = filteredColors.slice(0, 2);
  return result;
}

/**
 * Extracts multiple dominant colors from an image element
 * 
 * @param imageEl - The HTML Image element to analyze
 * @param colorCount - Number of colors to extract initially (default: 20)
 * @param maxReturnColors - Maximum number of representative colors to return after clustering
 * @returns Promise resolving to an array of dominant colors as HEX strings
 */
export async function extractDominantColors(
  imageEl: HTMLImageElement, 
  colorCount: number = 20, 
  maxReturnColors: number = 5
): Promise<string[]> {
  const colorThief = new ColorThief();

  return new Promise((resolve, reject) => {
    try {
      if (!imageEl.complete) {
        imageEl.onload = () => {
          try {
            const palette = colorThief.getPalette(imageEl, colorCount) as [number, number, number][];
            const hexColors = palette.map(rgb => rgbToHex(rgb[0], rgb[1], rgb[2]));
            
            // Cluster similar colors to get more diverse and representative colors
            const representativeColors = clusterSimilarColors(hexColors, 40, maxReturnColors);
            
            resolve(representativeColors);
          } catch (error) {
            console.error('Error extracting colors from loaded image:', error);
            // Fallback to a default color palette if extraction fails
            resolve(['#CCCCCC']);
          }
        };
        imageEl.onerror = (e) => {
          console.error('Error loading image for color extraction:', e);
          reject(new Error('Failed to load image for color extraction'));
        };
      } else {
        try {
          const palette = colorThief.getPalette(imageEl, colorCount) as [number, number, number][];
          const hexColors = palette.map(rgb => rgbToHex(rgb[0], rgb[1], rgb[2]));
          
          // Cluster similar colors to get more diverse and representative colors
          const representativeColors = clusterSimilarColors(hexColors, 40, maxReturnColors);
          
          resolve(representativeColors);
        } catch (error) {
          console.error('Error extracting colors from complete image:', error);
          // Fallback to a default color palette if extraction fails
          resolve(['#CCCCCC']);
        }
      }
    } catch (error) {
      console.error('Unexpected error in extractDominantColors:', error);
      // Fallback to a default color palette
      resolve(['#CCCCCC']);
    }
  });
}

/**
 * Extracts the dominant color from an image URL by creating a temporary image element
 * 
 * @param imageUrl - URL of the image to analyze
 * @returns Promise resolving to the dominant color as a HEX string
 */
export async function extractDominantColorFromUrl(imageUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous'; // Handle CORS issues
    img.src = imageUrl;
    
    img.onload = async () => {
      try {
        const color = await extractDominantColor(img);
        resolve(color);
      } catch (error) {
        console.error('Error extracting color:', error);
        resolve('#CCCCCC'); // Fallback color
      }
    };
    
    img.onerror = () => {
      console.error('Failed to load image:', imageUrl);
      resolve('#CCCCCC'); // Fallback color
    };
  });
}

/**
 * Extracts the top two dominant colors (not black/white) from an image URL
 * 
 * @param imageUrl - URL of the image to analyze
 * @returns Promise resolving to an array of up to 2 dominant colors as HEX strings
 */
export async function extractTopDominantColorsFromUrl(imageUrl: string): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous'; // Handle CORS issues
    img.src = imageUrl;
    
    img.onload = async () => {
      try {
        const colors = await extractTopDominantColors(img);
        resolve(colors);
      } catch (error) {
        console.error('Error extracting top colors:', error);
        resolve(['#3366CC', '#FF9900']); // Fallback colors
      }
    };
    
    img.onerror = () => {
      console.error('Failed to load image:', imageUrl);
      resolve(['#3366CC', '#FF9900']); // Fallback colors
    };
  });
}

/**
 * Extracts multiple dominant colors from an image URL by creating a temporary image element
 * 
 * @param imageUrl - URL of the image to analyze
 * @param colorCount - Number of colors to extract initially (default: 20)
 * @param maxReturnColors - Maximum number of representative colors to return after clustering
 * @returns Promise resolving to an array of dominant colors as HEX strings
 */
export async function extractDominantColorsFromUrl(
  imageUrl: string, 
  colorCount: number = 20,
  maxReturnColors: number = 5
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'Anonymous'; // Handle CORS issues
    img.src = imageUrl;
    
    img.onload = async () => {
      try {
        const colors = await extractDominantColors(img, colorCount, maxReturnColors);
        resolve(colors);
      } catch (error) {
        console.error('Error extracting colors:', error);
        resolve(['#CCCCCC']); // Fallback color palette
      }
    };
    
    img.onerror = () => {
      console.error('Failed to load image:', imageUrl);
      resolve(['#CCCCCC']); // Fallback color palette
    };
  });
} 