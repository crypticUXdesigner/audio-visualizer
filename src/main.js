// Main Application Entry Point
// Wires together all modules and initializes the application

// Import styles (Vite will process and bundle these)
import './styles/app.css';

// Initialize Sentry as early as possible (before other imports)
import './core/monitoring/SentryInit.js';

import { VisualPlayer } from './core/App.js';

// Initialize when DOM is ready
const app = new VisualPlayer();

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => app.init(), 100);
    });
} else {
    setTimeout(() => app.init(), 100);
}

export default app;
