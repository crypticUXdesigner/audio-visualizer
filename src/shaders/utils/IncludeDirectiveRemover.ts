// Include Directive Remover
// Efficiently removes already-processed include directives from shader source

import { ShaderLogger } from './ShaderLogger.js';

/**
 * Remove include directive from source code
 * Uses a single, efficient approach instead of multiple fallback strategies
 * @param source - Shader source code
 * @param directive - The include directive to remove (e.g., '#include "common/constants.glsl"')
 * @param includePath - Normalized include path
 * @param originalPath - Original include path as it appeared in source
 * @returns Source code with directive removed
 */
export function removeIncludeDirective(
  source: string,
  directive: string,
  includePath: string,
  originalPath: string
): string {
  // Strategy 1: Try exact directive match (most common case)
  const exactMatch = source.replace(directive, '');
  if (exactMatch !== source) {
    return exactMatch;
  }

  // Strategy 2: Try with normalized path (handles path normalization differences)
  const normalizedDirective = `#include "${includePath}"`;
  const normalizedMatch = source.replace(normalizedDirective, '');
  if (normalizedMatch !== source) {
    return normalizedMatch;
  }

  // Strategy 3: Try with original path (handles original formatting)
  const originalDirective = `#include "${originalPath}"`;
  const originalMatch = source.replace(originalDirective, '');
  if (originalMatch !== source) {
    return originalMatch;
  }

  // Strategy 4: Flexible regex (handles whitespace variations)
  // Escape special regex characters in the path
  const escapedPath = includePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const flexiblePattern = new RegExp(`#include\\s+"${escapedPath}"\\s*\\n?`, 'g');
  const flexibleMatch = source.replace(flexiblePattern, '');
  if (flexibleMatch !== source) {
    return flexibleMatch;
  }

  // Strategy 5: Last resort - match any variation with original path
  const escapedOriginalPath = originalPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const lastResortPattern = new RegExp(`#include[^\\n]*"${escapedOriginalPath}"[^\\n]*\\n?`, 'g');
  const lastResortMatch = source.replace(lastResortPattern, '');
  
  if (lastResortMatch === source) {
    // All strategies failed - log warning but don't throw
    ShaderLogger.warn(
      `[IncludeDirectiveRemover] Failed to remove directive: "${includePath}" (original: "${originalPath}")`
    );
  }
  
  return lastResortMatch;
}

