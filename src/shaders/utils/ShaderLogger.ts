// ShaderLogger - Centralized logging utility for shader system
// Provides consistent logging with configurable log levels

export const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
} as const;

// Current log level (can be configured via environment or config)
// In production, set to LogLevel.WARN or LogLevel.ERROR
let currentLogLevel: number = (typeof process !== 'undefined' && process.env?.NODE_ENV === 'production') 
    ? LogLevel.DEBUG 
    : LogLevel.DEBUG;

/**
 * Shader logging utility
 */
export const ShaderLogger = {
    /**
     * Log debug message (only in development)
     * @param message - Log message
     * @param args - Additional arguments
     */
    debug: (message: string, ...args: unknown[]): void => {
        if (currentLogLevel <= LogLevel.DEBUG) {
            console.log(`[Shader Debug] ${message}`, ...args);
        }
    },
    
    /**
     * Log info message
     * @param message - Log message
     * @param args - Additional arguments
     */
    info: (message: string, ...args: unknown[]): void => {
        if (currentLogLevel <= LogLevel.INFO) {
            console.log(`[Shader] ${message}`, ...args);
        }
    },
    
    /**
     * Log warning message
     * @param message - Log message
     * @param args - Additional arguments
     */
    warn: (message: string, ...args: unknown[]): void => {
        if (currentLogLevel <= LogLevel.WARN) {
            console.warn(`[Shader Warning] ${message}`, ...args);
        }
    },
    
    /**
     * Log error message
     * @param message - Log message
     * @param args - Additional arguments
     */
    error: (message: string, ...args: unknown[]): void => {
        if (currentLogLevel <= LogLevel.ERROR) {
            console.error(`[Shader Error] ${message}`, ...args);
        }
    },
    
    /**
     * Set the current log level
     * @param level - Log level (LogLevel.DEBUG, LogLevel.INFO, etc.)
     */
    setLevel: (level: number): void => {
        if (level >= LogLevel.DEBUG && level <= LogLevel.ERROR) {
            currentLogLevel = level;
        }
    },
    
    /**
     * Get the current log level
     * @returns Current log level
     */
    getLevel: (): number => currentLogLevel
};

