export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  SILENT = 4,
}

interface LogEntry {
  timestamp: string;
  level: string;
  context?: string;
  message: string;
  data?: unknown;
}

class Logger {
  private level: LogLevel;
  private context?: string;
  private enableFileLogging: boolean;
  private logFile?: string;

  constructor(options?: { level?: LogLevel; context?: string; enableFileLogging?: boolean; logFile?: string }) {
    this.level = options?.level ?? this.getLevelFromEnv();
    this.context = options?.context;
    this.enableFileLogging = options?.enableFileLogging ?? this.getBooleanFromEnv('LOG_FILE_ENABLED', false);
    this.logFile = options?.logFile ?? process.env.LOG_FILE_PATH;
  }

  private getLevelFromEnv(): LogLevel {
    const envLevel = process.env.LOG_LEVEL?.toUpperCase();
    switch (envLevel) {
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      case 'SILENT': return LogLevel.SILENT;
      default: return LogLevel.INFO;
    }
  }

  private getBooleanFromEnv(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (!value) return defaultValue;
    return value === 'true' || value === '1';
  }

  private shouldLog(level: LogLevel): boolean {
    return level >= this.level;
  }

  private formatMessage(level: string, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const context = this.context ? `[${this.context}]` : '';
    const dataStr = data ? ` ${JSON.stringify(data, null, 2)}` : '';
    return `${timestamp} ${level} ${context} ${message}${dataStr}`;
  }

  private async writeToFile(entry: LogEntry): Promise<void> {
    if (!this.enableFileLogging || !this.logFile) return;

    try {
      const fs = await import('node:fs');
      const path = await import('node:path');
      
      const logDir = path.dirname(this.logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const logLine = JSON.stringify(entry) + '\n';
      fs.appendFileSync(this.logFile, logLine);
    } catch (error) {
      console.error('[Logger] Failed to write to file:', error);
    }
  }

  private async log(level: LogLevel, levelName: string, message: string, data?: unknown): Promise<void> {
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: levelName,
      context: this.context,
      message,
      data,
    };

    const formattedMessage = this.formatMessage(levelName, message, data);

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(formattedMessage);
        break;
      case LogLevel.INFO:
        console.info(formattedMessage);
        break;
      case LogLevel.WARN:
        console.warn(formattedMessage);
        break;
      case LogLevel.ERROR:
        console.error(formattedMessage);
        break;
    }

    await this.writeToFile(entry);
  }

  debug(message: string, data?: unknown): void {
    this.log(LogLevel.DEBUG, 'DEBUG', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log(LogLevel.INFO, 'INFO', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log(LogLevel.WARN, 'WARN', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log(LogLevel.ERROR, 'ERROR', message, data);
  }

  child(context: string): Logger {
    return new Logger({
      level: this.level,
      context: this.context ? `${this.context}:${context}` : context,
      enableFileLogging: this.enableFileLogging,
      logFile: this.logFile,
    });
  }
}

const rootLogger = new Logger();

export function createLogger(context?: string): Logger {
  return context ? rootLogger.child(context) : rootLogger;
}

export const logger = rootLogger;