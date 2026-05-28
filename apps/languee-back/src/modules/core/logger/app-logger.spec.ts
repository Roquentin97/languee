import { AppLogger } from './app-logger';

describe('AppLogger', () => {
  let stdoutSpy: jest.SpyInstance;
  let stderrSpy: jest.SpyInstance;

  const originalPrintDebugLogs = process.env['PRINT_DEBUG_LOGS'];

  beforeEach(() => {
    stdoutSpy = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    stderrSpy = jest
      .spyOn(process.stderr, 'write')
      .mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    // Restore PRINT_DEBUG_LOGS to original value
    if (originalPrintDebugLogs === undefined) {
      delete process.env['PRINT_DEBUG_LOGS'];
    } else {
      process.env['PRINT_DEBUG_LOGS'] = originalPrintDebugLogs;
    }
  });

  const firstCallArg = (spy: jest.SpyInstance): string =>
    spy.mock.calls.map((call: unknown[]) => call[0] as string)[0] ?? '';

  const parseStdout = (): Record<string, unknown> => {
    expect(stdoutSpy).toHaveBeenCalled();
    return JSON.parse(firstCallArg(stdoutSpy)) as Record<string, unknown>;
  };

  const parseStderr = (): Record<string, unknown> => {
    expect(stderrSpy).toHaveBeenCalled();
    return JSON.parse(firstCallArg(stderrSpy)) as Record<string, unknown>;
  };

  // Edge case 1: String log message
  it('emits JSON with message field when called with a string', () => {
    const logger = new AppLogger('TestContext');
    logger.log('some string');

    const entry = parseStdout();
    expect(entry['message']).toBe('some string');
    expect(entry['level']).toBe('info');
    expect(entry['context']).toBe('TestContext');
  });

  // Edge case 2: Object log message WITH message property
  it('emits JSON spreading object fields and preserving message when object has message property', () => {
    const logger = new AppLogger('TestContext');
    logger.log({ message: 'hello', requestId: 'abc' });

    const entry = parseStdout();
    expect(entry['message']).toBe('hello');
    expect(entry['requestId']).toBe('abc');
  });

  // Edge case 3: Object log message WITHOUT message property
  it('uses fallback message "Log event" when object has no message property', () => {
    const logger = new AppLogger('TestContext');
    logger.log({ requestId: 'abc' });

    const entry = parseStdout();
    expect(entry['message']).toBe('Log event');
    expect(entry['requestId']).toBe('abc');
  });

  // Edge case 4: Required fields present
  it('always emits timestamp, level, message, service, context, pid, and environment', () => {
    const logger = new AppLogger('TestContext');
    logger.log('required fields check');

    const entry = parseStdout();
    expect(typeof entry['timestamp']).toBe('string');
    expect(entry['level']).toBeDefined();
    expect(entry['message']).toBeDefined();
    expect(entry['service']).toBeDefined();
    expect(entry['context']).toBeDefined();
    expect(entry['pid']).toBeDefined();
    expect(entry['environment']).toBeDefined();
  });

  // Edge case 5: Error logs write to stderr
  it('writes error logs to stderr and not stdout', () => {
    const logger = new AppLogger('TestContext');
    logger.error('fail');

    expect(stderrSpy).toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  // Edge case 6: Non-error logs write to stdout
  it.each([
    ['log', 'info'],
    ['warn', 'warn'],
  ] as const)(
    '%s() writes to stdout and not stderr',
    (method: 'log' | 'warn') => {
      const logger = new AppLogger('TestContext');
      logger[method]('test message');

      expect(stdoutSpy).toHaveBeenCalled();
      expect(stderrSpy).not.toHaveBeenCalled();
    },
  );

  it('verbose() writes to stdout and not stderr when PRINT_DEBUG_LOGS=true', () => {
    process.env['PRINT_DEBUG_LOGS'] = 'true';
    const logger = new AppLogger('TestContext');
    logger.verbose('verbose message');

    expect(stdoutSpy).toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('debug() writes to stdout and not stderr when PRINT_DEBUG_LOGS=true', () => {
    process.env['PRINT_DEBUG_LOGS'] = 'true';
    const logger = new AppLogger('TestContext');
    logger.debug('debug message');

    expect(stdoutSpy).toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  // Edge case 7: Fatal logs write to stderr
  it('writes fatal logs to stderr and not stdout', () => {
    const logger = new AppLogger('TestContext');
    logger.fatal('crash');

    expect(stderrSpy).toHaveBeenCalled();
    expect(stdoutSpy).not.toHaveBeenCalled();
  });

  // Edge case 8: Error instance emits error.message and error.stack
  it('emits error.message and error.stack when called with an Error instance', () => {
    const logger = new AppLogger('TestContext');
    const err = new Error('boom');
    logger.error(err);

    const entry = parseStderr();
    const errorField = entry['error'] as Record<string, unknown>;
    expect(errorField['message']).toBe('boom');
    expect(typeof errorField['stack']).toBe('string');
    expect((errorField['stack'] as string).length).toBeGreaterThan(0);
  });

  // Edge case 9: Debug suppressed by default
  it('suppresses debug logs when PRINT_DEBUG_LOGS is unset', () => {
    delete process.env['PRINT_DEBUG_LOGS'];
    const logger = new AppLogger('TestContext');
    logger.debug('x');

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('suppresses debug logs when PRINT_DEBUG_LOGS=false', () => {
    process.env['PRINT_DEBUG_LOGS'] = 'false';
    const logger = new AppLogger('TestContext');
    logger.debug('x');

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  // Edge case 10: Debug enabled when flag set
  it('emits debug logs on stdout when PRINT_DEBUG_LOGS=true', () => {
    process.env['PRINT_DEBUG_LOGS'] = 'true';
    const logger = new AppLogger('TestContext');
    logger.debug('x');

    const entry = parseStdout();
    expect(entry['level']).toBe('debug');
    expect(entry['message']).toBe('x');
  });

  // Edge case 11: Verbose suppressed by default
  it('suppresses verbose logs when PRINT_DEBUG_LOGS is unset', () => {
    delete process.env['PRINT_DEBUG_LOGS'];
    const logger = new AppLogger('TestContext');
    logger.verbose('x');

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('suppresses verbose logs when PRINT_DEBUG_LOGS=false', () => {
    process.env['PRINT_DEBUG_LOGS'] = 'false';
    const logger = new AppLogger('TestContext');
    logger.verbose('x');

    expect(stdoutSpy).not.toHaveBeenCalled();
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  // Edge case 12: Single JSON object per line
  it('emits exactly one newline-terminated JSON object with no embedded newlines per call', () => {
    const logger = new AppLogger('TestContext');
    logger.log('single line check');

    expect(stdoutSpy).toHaveBeenCalledTimes(1);
    const written = firstCallArg(stdoutSpy);
    // Must end with exactly one newline
    expect(written.endsWith('\n')).toBe(true);
    // Must have no embedded newlines before the trailing one
    const withoutTrailing = written.slice(0, -1);
    expect(withoutTrailing.includes('\n')).toBe(false);
    // Must be valid JSON
    expect(() => JSON.parse(withoutTrailing) as unknown).not.toThrow();
  });

  // Edge case 13: Level mapping
  it.each([
    ['log', 'info'],
    ['warn', 'warn'],
    ['error', 'error'],
    ['fatal', 'fatal'],
  ] as const)(
    '%s() emits level=%s in the JSON payload',
    (method: 'log' | 'warn' | 'error' | 'fatal', expectedLevel: string) => {
      const logger = new AppLogger('TestContext');
      logger[method]('level mapping test');

      const isStderr = method === 'error' || method === 'fatal';
      const entry = isStderr ? parseStderr() : parseStdout();
      expect(entry['level']).toBe(expectedLevel);
    },
  );

  it('debug() emits level=debug in the JSON payload', () => {
    process.env['PRINT_DEBUG_LOGS'] = 'true';
    const logger = new AppLogger('TestContext');
    logger.debug('level debug test');

    const entry = parseStdout();
    expect(entry['level']).toBe('debug');
  });

  it('verbose() emits level=verbose in the JSON payload', () => {
    process.env['PRINT_DEBUG_LOGS'] = 'true';
    const logger = new AppLogger('TestContext');
    logger.verbose('level verbose test');

    const entry = parseStdout();
    expect(entry['level']).toBe('verbose');
  });

  // Edge case 14: Context override via second argument
  it('uses the context argument passed to log() instead of the constructor context', () => {
    const logger = new AppLogger('ConstructorContext');
    logger.log('msg', 'MyService');

    const entry = parseStdout();
    expect(entry['context']).toBe('MyService');
  });

  it('uses the context argument passed to error() instead of the constructor context', () => {
    const logger = new AppLogger('ConstructorContext');
    logger.error('msg', 'MyService');

    const entry = parseStderr();
    expect(entry['context']).toBe('MyService');
  });

  // Edge case 15: Non-string non-object message (number)
  it('converts numeric message to string in the message field', () => {
    const logger = new AppLogger('TestContext');
    logger.log(42);

    const entry = parseStdout();
    expect(entry['message']).toBe('42');
  });
});
