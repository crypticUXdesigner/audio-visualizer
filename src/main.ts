// Main Application Entry Point
// Wires together all modules and initializes the application

// Import styles (Vite will process and bundle these)
import './styles/app.css';

// Initialize Sentry as early as possible (before other imports)
import './core/monitoring/SentryInit.js';

// Validate environment variables early
import './config/env.js';

import { VisualPlayer } from './core/App.js';
import { TIMING } from './config/constants.js';

// Initialize when DOM is ready
const app = new VisualPlayer();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => app.init(), TIMING.INIT_DELAY);
    });
} else {
    setTimeout(() => app.init(), TIMING.INIT_DELAY);
}

export default app;

