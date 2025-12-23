// BezierSolver - Utility for solving cubic bezier curves
// Used for easing functions and smooth interpolation

/**
 * Cubic-bezier solver: finds y value for a given x using binary search
 * Solves the cubic bezier equation B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
 * where P₀ = (0,0), P₁ = (x1,y1), P₂ = (x2,y2), P₃ = (1,1)
 * Uses binary search to find t such that Bx(t) = x, then returns By(t)
 * @param {number} x - Input x value (0-1)
 * @param {number} x1 - First control point X coordinate (0-1)
 * @param {number} y1 - First control point Y coordinate (0-1)
 * @param {number} x2 - Second control point X coordinate (0-1)
 * @param {number} y2 - Second control point Y coordinate (0-1)
 * @param {number} epsilon - Precision threshold (default: 0.0001)
 * @param {number} maxIterations - Maximum iterations (default: 20)
 * @returns {number} Corresponding y value (0-1)
 * @example
 * // Ease-out cubic bezier: (0.9, 0.0, 0.8, 1.0)
 * const easing = BezierSolver.solve(0.5, 0.9, 0.0, 0.8, 1.0);
 * // Returns ~0.7 (eased value)
 */
export class BezierSolver {
    static solve(x, x1, y1, x2, y2, epsilon = 0.0001, maxIterations = 20) {
        // Cubic bezier formula: B(t) = (1-t)³P₀ + 3(1-t)²tP₁ + 3(1-t)t²P₂ + t³P₃
        // For x-coordinate: we need to find t such that Bx(t) = x
        // P₀ = (0,0), P₁ = (x1,y1), P₂ = (x2,y2), P₃ = (1,1)
        
        // Binary search for t
        let t0 = 0;
        let t1 = 1;
        
        for (let i = 0; i < maxIterations; i++) {
            const t = (t0 + t1) / 2;
            
            // Calculate x-coordinate at t
            const cx = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
            
            if (Math.abs(cx - x) < epsilon) {
                // Calculate y-coordinate at t
                const cy = 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
                return cy;
            }
            
            if (cx < x) {
                t0 = t;
            } else {
                t1 = t;
            }
        }
        
        // Fallback: calculate y at final t
        const t = (t0 + t1) / 2;
        const cy = 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
        return cy;
    }
}

