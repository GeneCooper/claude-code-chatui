/**
 * Centralized Logger Utility
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export interface LogEntry {
  level: LogLevel;
  message: string;
  error?: Error;
  data?: Record<string, unknown>;
  timestamp: Date;
  module?: string;
}

export interface LoggerConfig {
  minLevel: LogLevel;
  includeTimestamp: boolean;
  includeModule: boolean;
  customHandler?: (entry: LogEntry) => void;
}

const defaultConfig: LoggerConfig = {
  minLevel: LogLevel.DEBUG,
  includeTimestamp: false,
  includeModule: true,
};

let globalConfig = { ...defaultConfig };

export function configureLogger(config: Partial<LoggerConfig>): void {
  globalConfig = { ...globalConfig, ...config };
}

export function resetLoggerConfig(): void {
  globalConfig = { ...defaultConfig };
}

function formatMessage(module: string | undefined, message: string): string {
  if (globalConfig.includeModule && module) {
    return `[${module}] ${message}`;
  }
  return message;
}

function log(
  level: LogLevel,
  message: string,
  options?: { error?: Error; data?: Record<string, unknown>; module?: string },
): void {
  if (level < globalConfig.minLevel) return;

  const entry: LogEntry = {
    level,
    message,
    error: options?.error,
    data: options?.data,
    timestamp: new Date(),
    module: options?.module,
  };

  if (globalConfig.customHandler) {
    globalConfig.customHandler(entry);
  }

  const formatted = formatMessage(options?.module, message);
  const extra = options?.error || options?.data;

  switch (level) {
    case LogLevel.DEBUG:
      extra ? console.debug(formatted, extra) : console.debug(formatted);
      break;
    case LogLevel.INFO:
      extra ? console.info(formatted, extra) : console.info(formatted);
      break;
    case LogLevel.WARN:
      extra ? console.warn(formatted, extra) : console.warn(formatted);
      break;
    case LogLevel.ERROR:
      extra ? console.error(formatted, extra) : console.error(formatted);
      break;
  }
}

export const logger = {
  debug: (message: string, options?: { data?: Record<string, unknown>; module?: string }): void => {
    log(LogLevel.DEBUG, message, options);
  },
  info: (message: string, options?: { data?: Record<string, unknown>; module?: string }): void => {
    log(LogLevel.INFO, message, options);
  },
  warn: (message: string, options?: { error?: Error; data?: Record<string, unknown>; module?: string }): void => {
    log(LogLevel.WARN, message, options);
  },
  error: (message: string, errorOrOptions?: Error | { error?: Error; data?: Record<string, unknown>; module?: string }): void => {
    if (errorOrOptions instanceof Error) {
      log(LogLevel.ERROR, message, { error: errorOrOptions });
    } else {
      log(LogLevel.ERROR, message, errorOrOptions);
    }
  },
};

export function createModuleLogger(module: string) {
  return {
    debug: (message: string, data?: Record<string, unknown>): void => {
      log(LogLevel.DEBUG, message, { module, data });
    },
    info: (message: string, data?: Record<string, unknown>): void => {
      log(LogLevel.INFO, message, { module, data });
    },
    warn: (message: string, errorOrData?: Error | Record<string, unknown>): void => {
      if (errorOrData instanceof Error) {
        log(LogLevel.WARN, message, { module, error: errorOrData });
      } else {
        log(LogLevel.WARN, message, { module, data: errorOrData });
      }
    },
    error: (message: string, errorOrData?: Error | Record<string, unknown>): void => {
      if (errorOrData instanceof Error) {
        log(LogLevel.ERROR, message, { module, error: errorOrData });
      } else {
        log(LogLevel.ERROR, message, { module, data: errorOrData });
      }
    },
  };
}
