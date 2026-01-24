/**
 * Environment-aware logging utility
 * Only logs in development mode unless explicitly enabled
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  enabled: boolean;
  level: LogLevel;
  prefix: string;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const isDevelopment = import.meta.env.DEV;
const isProduction = import.meta.env.PROD;

const defaultConfig: LoggerConfig = {
  enabled: isDevelopment,
  level: isDevelopment ? 'debug' : 'error',
  prefix: '[SongAnalyzer]',
};

let config: LoggerConfig = { ...defaultConfig };

const shouldLog = (level: LogLevel): boolean => {
  if (!config.enabled) return false;
  return LOG_LEVELS[level] >= LOG_LEVELS[config.level];
};

const formatMessage = (level: LogLevel, message: string): string => {
  const timestamp = new Date().toISOString();
  return `${config.prefix} [${timestamp}] [${level.toUpperCase()}] ${message}`;
};

export const logger = {
  /**
   * Configure the logger
   */
  configure: (newConfig: Partial<LoggerConfig>) => {
    config = { ...config, ...newConfig };
  },

  /**
   * Enable logging (useful for debugging in production)
   */
  enable: () => {
    config.enabled = true;
  },

  /**
   * Disable logging
   */
  disable: () => {
    config.enabled = false;
  },

  /**
   * Set log level
   */
  setLevel: (level: LogLevel) => {
    config.level = level;
  },

  /**
   * Debug level logging - only in development
   */
  debug: (message: string, ...args: unknown[]) => {
    if (shouldLog('debug')) {
      console.debug(formatMessage('debug', message), ...args);
    }
  },

  /**
   * Info level logging
   */
  info: (message: string, ...args: unknown[]) => {
    if (shouldLog('info')) {
      console.info(formatMessage('info', message), ...args);
    }
  },

  /**
   * Warning level logging
   */
  warn: (message: string, ...args: unknown[]) => {
    if (shouldLog('warn')) {
      console.warn(formatMessage('warn', message), ...args);
    }
  },

  /**
   * Error level logging - always logs in production
   */
  error: (message: string, error?: unknown, ...args: unknown[]) => {
    // Always log errors
    const formattedMessage = formatMessage('error', message);
    if (error instanceof Error) {
      console.error(formattedMessage, error.message, error.stack, ...args);
    } else {
      console.error(formattedMessage, error, ...args);
    }
  },

  /**
   * Log with custom level
   */
  log: (level: LogLevel, message: string, ...args: unknown[]) => {
    if (shouldLog(level)) {
      const method = level === 'debug' ? 'debug' : level === 'info' ? 'info' : level === 'warn' ? 'warn' : 'error';
      console[method](formatMessage(level, message), ...args);
    }
  },

  /**
   * Create a scoped logger with a custom prefix
   */
  scope: (scopeName: string) => {
    const scopedPrefix = `${config.prefix}[${scopeName}]`;
    return {
      debug: (message: string, ...args: unknown[]) => {
        if (shouldLog('debug')) {
          console.debug(`${scopedPrefix} ${message}`, ...args);
        }
      },
      info: (message: string, ...args: unknown[]) => {
        if (shouldLog('info')) {
          console.info(`${scopedPrefix} ${message}`, ...args);
        }
      },
      warn: (message: string, ...args: unknown[]) => {
        if (shouldLog('warn')) {
          console.warn(`${scopedPrefix} ${message}`, ...args);
        }
      },
      error: (message: string, error?: unknown, ...args: unknown[]) => {
        if (error instanceof Error) {
          console.error(`${scopedPrefix} ${message}`, error.message, ...args);
        } else {
          console.error(`${scopedPrefix} ${message}`, error, ...args);
        }
      },
    };
  },

  /**
   * Performance timing helper
   */
  time: (label: string) => {
    if (shouldLog('debug')) {
      console.time(`${config.prefix} ${label}`);
    }
    return {
      end: () => {
        if (shouldLog('debug')) {
          console.timeEnd(`${config.prefix} ${label}`);
        }
      },
    };
  },

  /**
   * Group logs together
   */
  group: (label: string, collapsed = false) => {
    if (shouldLog('debug')) {
      if (collapsed) {
        console.groupCollapsed(`${config.prefix} ${label}`);
      } else {
        console.group(`${config.prefix} ${label}`);
      }
    }
    return {
      end: () => {
        if (shouldLog('debug')) {
          console.groupEnd();
        }
      },
    };
  },

  /**
   * Table logging for arrays/objects
   */
  table: (data: unknown, columns?: string[]) => {
    if (shouldLog('debug')) {
      console.table(data, columns);
    }
  },
};

// Export individual methods for convenience
export const { debug, info, warn, error } = logger;

export default logger;
