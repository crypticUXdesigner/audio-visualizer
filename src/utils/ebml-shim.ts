// Shim module to make ebml available for ts-ebml
// ts-ebml expects: const { tools: _tools } = require("ebml");
// So we need to export an object with a tools property

// We need to import from the actual ebml package, not through our alias
// Use a special import path that Vite will resolve from node_modules
// The alias only applies to imports of 'ebml', not 'ebml/lib/...'
import { tools } from 'ebml/lib/ebml.esm.js';

// Export as an object with tools property for CommonJS destructuring
// This matches what ts-ebml expects when it does: const { tools } = require("ebml")
const ebmlModule = { tools };

export default ebmlModule;
export { tools };
export { ebmlModule };
