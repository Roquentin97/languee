import { LoggerService, LogLevel } from '@nestjs/common';

export class AppLogger implements LoggerService {
  private readonly context: string;
  private readonly levels: Set<LogLevel>;

  constructor(context = 'App') {
    this.context = context;

    // process.env is read directly here instead of ConfigService because this
    // logger is instantiated before NestFactory.create() finishes — the DI
    // container does not exist yet, so ConfigService is not available.
    const enabled: LogLevel[] = ['log', 'warn', 'error', 'fatal'];
    if (process.env['PRINT_DEBUG_LOGS'] === 'true') {
      enabled.push('debug', 'verbose');
    }
    this.levels = new Set(enabled);
  }

  log(message: unknown, context?: string): void {
    if (!this.levels.has('log')) return;
    this.emit('info', message, context);
  }

  error(message: unknown, context?: string): void {
    if (!this.levels.has('error')) return;
    this.emit('error', message, context);
  }

  warn(message: unknown, context?: string): void {
    if (!this.levels.has('warn')) return;
    this.emit('warn', message, context);
  }

  debug(message: unknown, context?: string): void {
    if (!this.levels.has('debug')) return;
    this.emit('debug', message, context);
  }

  verbose(message: unknown, context?: string): void {
    if (!this.levels.has('verbose')) return;
    this.emit('verbose', message, context);
  }

  fatal(message: unknown, context?: string): void {
    if (!this.levels.has('fatal')) return;
    this.emit('fatal', message, context);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setLogLevels(_levels: LogLevel[]): void {
    // Levels are controlled by env var at construction time; this is a no-op
    // to satisfy the LoggerService interface.
  }

  private emit(level: string, message: unknown, context?: string): void {
    const resolvedContext = context ?? this.context;

    const payload: Record<string, unknown> = {};

    if (typeof message === 'string') {
      payload['message'] = message;
    } else if (message !== null && typeof message === 'object') {
      const msgObj = message as Record<string, unknown>;
      Object.assign(payload, msgObj);
      if ('message' in msgObj) {
        payload['message'] = msgObj['message'];
      } else {
        payload['message'] = 'Log event';
      }
    } else {
      payload['message'] = String(message);
    }

    if (level === 'error' || level === 'fatal') {
      if (message instanceof Error) {
        payload['message'] = message.message;
        payload['error'] = {
          message: message.message,
          stack: message.stack,
        };
      } else if (
        message !== null &&
        typeof message === 'object' &&
        !('error' in (message as Record<string, unknown>)) &&
        'stack' in (message as Record<string, unknown>)
      ) {
        const msgObj = message as Record<string, unknown>;
        payload['error'] = {
          message: msgObj['message'],
          stack: msgObj['stack'],
        };
      }
    }

    // Top-level fields always win over spread object fields.
    // process.env is read directly — see constructor comment.
    payload['timestamp'] = new Date().toISOString();
    payload['level'] = level;
    payload['service'] = process.env['SERVICE_NAME'] ?? 'languee-back';
    payload['context'] = resolvedContext;
    payload['pid'] = process.pid;
    payload['environment'] = process.env['NODE_ENV'] ?? 'development';

    const line = JSON.stringify(payload) + '\n';

    if (level === 'error' || level === 'fatal') {
      process.stderr.write(line);
    } else {
      process.stdout.write(line);
    }
  }
}
