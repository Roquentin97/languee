import { trace } from '@opentelemetry/api';
import { AppLogger } from '../logger/app-logger';
import { requestContextStorage } from '../context/request-context';
import { RequestFailure, RequestService } from './request.service';

describe('lookup HTTP deadlines and slow telemetry', () => {
  const options = {
    target: 'nlp',
    operation: 'nlp inflections batch',
    timeoutMs: 10000,
  };
  let warn: jest.SpyInstance;
  let event: jest.Mock;
  beforeEach(() => {
    jest.useFakeTimers();
    warn = jest.spyOn(AppLogger.prototype, 'warn').mockImplementation();
    event = jest.fn();
    jest.spyOn(trace, 'getActiveSpan').mockReturnValue({
      addEvent: event,
      setStatus: jest.fn(),
      recordException: jest.fn(),
      spanContext: jest.fn(),
    } as never);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });
  it('warns once while reading a slow body and aborts at the deadline', async () => {
    let signal: AbortSignal | undefined;
    jest.spyOn(global, 'fetch').mockImplementation((_url, init) => {
      signal = init?.signal as AbortSignal;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => new Promise(() => {}),
      } as Response);
    });
    const result = new RequestService().getJson(
      'https://host/path?secret=value',
      options,
    );
    const rejected = expect(result).rejects.toMatchObject({ kind: 'timeout' });
    await jest.advanceTimersByTimeAsync(2999);
    expect(warn).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'http.request_slow',
        target: 'nlp',
        operation: options.operation,
        elapsedMs: 3000,
        timeoutMs: 10000,
        thresholdMs: 3000,
        inFlight: true,
      }),
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('secret');
    expect(event).toHaveBeenCalledWith(
      'http.request_slow',
      expect.objectContaining({ elapsedMs: 3000 }),
    );
    await jest.advanceTimersByTimeAsync(7000);
    await rejected;
    expect(signal?.aborted).toBe(true);
    await jest.advanceTimersByTimeAsync(10000);
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it.each([true, false])(
    'records a slow settled result (success=%s) without another warning',
    async (success) => {
      let finish!: (response: Response) => void;
      jest.spyOn(global, 'fetch').mockReturnValue(
        new Promise((resolve) => {
          finish = resolve;
        }),
      );
      const result = new RequestService().getJson('https://host/path', options);
      const checked = success
        ? expect(result).resolves.toEqual({ ok: true })
        : expect(result).rejects.toBeInstanceOf(RequestFailure);
      await jest.advanceTimersByTimeAsync(3000);
      finish({
        ok: success,
        status: success ? 200 : 404,
        json: async () => ({ ok: true }),
        text: async () => 'missing',
      } as Response);
      await checked;
      await jest.advanceTimersByTimeAsync(10000);
      expect(warn).toHaveBeenCalledTimes(1);
    },
  );
  it('never warns after a fast request completes', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response);
    await new RequestService().getJson('https://host/path', options);
    await jest.advanceTimersByTimeAsync(10000);
    expect(warn).not.toHaveBeenCalled();
  });

  it('propagates request ids to NLP while keeping them off external provider calls', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);

    await requestContextStorage.run(
      {
        requestId: 'lookup-request-123',
        traceId: 'aabbccddeeff00112233445566778899',
        parentSpanId: '0011223344556677',
        traceFlags: '01',
      },
      async () => {
        await new RequestService().postJson(
          'http://languee-nlp:8000/analyze',
          { text: 'running' },
          { target: 'nlp', propagateCorrelation: true },
        );
        expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
          expect.objectContaining({
            'X-Request-ID': 'lookup-request-123',
            traceparent:
              '00-aabbccddeeff00112233445566778899-0011223344556677-01',
          }),
        );

        await new RequestService().getJson('https://dictionary.test/lookup', {
          target: 'dictionary-provider',
        });
        expect(fetchMock.mock.calls[1]?.[1]?.headers).toBeUndefined();
      },
    );
  });

  it('propagates validated W3C context from request context when no span is active', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);
    jest.mocked(trace.getActiveSpan).mockReturnValue(undefined);

    await requestContextStorage.run(
      {
        requestId: 'lookup-request-trace',
        traceId: 'aabbccddeeff00112233445566778899',
        parentSpanId: '0011223344556677',
        traceFlags: '01',
      },
      async () => {
        await new RequestService().postJson(
          'http://languee-nlp:8000/analyze',
          { text: 'running' },
          { target: 'nlp', propagateCorrelation: true },
        );
      },
    );

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({
        'X-Request-ID': 'lookup-request-trace',
        traceparent: '00-aabbccddeeff00112233445566778899-0011223344556677-01',
      }),
    );
  });

  it('uses an active span context when propagating W3C headers to NLP', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response);
    jest.mocked(trace.getActiveSpan).mockReturnValue({
      spanContext: () => ({
        traceId: '12345678901234567890123456789012',
        spanId: '1234567890123456',
        traceFlags: 1,
      }),
    } as never);

    await requestContextStorage.run(
      {
        requestId: 'lookup-request-active-span',
        traceId: 'aabbccddeeff00112233445566778899',
        parentSpanId: '0011223344556677',
        traceFlags: '00',
      },
      async () => {
        await new RequestService().postJson(
          'http://languee-nlp:8000/analyze',
          { text: 'running' },
          { target: 'nlp', propagateCorrelation: true },
        );
      },
    );

    expect(fetchMock.mock.calls[0]?.[1]?.headers).toEqual(
      expect.objectContaining({
        'X-Request-ID': 'lookup-request-active-span',
        traceparent: '00-12345678901234567890123456789012-1234567890123456-01',
      }),
    );
  });

  it('does not read or log a failed upstream response body', async () => {
    const responseText = jest.fn().mockResolvedValue('secret=must-not-log');
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 404,
      text: responseText,
    } as unknown as Response);

    await expect(
      new RequestService().send('http://languee-nlp:8000/missing', {
        target: 'nlp',
      }),
    ).rejects.toMatchObject({ kind: 'http', status: 404 });

    expect(responseText).not.toHaveBeenCalled();
    expect(JSON.stringify(warn.mock.calls)).not.toContain('must-not-log');
  });

  it('enriches the slow warning with request and trace correlation', async () => {
    warn.mockRestore();
    const output = jest
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);
    jest.mocked(trace.getActiveSpan).mockReturnValue({
      addEvent: event,
      spanContext: () => ({
        traceId: '12345678901234567890123456789012',
        spanId: '1234567890123456',
        traceFlags: 1,
      }),
    } as never);
    let finish!: (response: Response) => void;
    jest.spyOn(global, 'fetch').mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    await requestContextStorage.run({ requestId: 'request-123' }, async () => {
      const result = new RequestService().getJson(
        'https://host/path?token=secret',
        options,
      );
      await jest.advanceTimersByTimeAsync(3000);
      finish({ ok: true, json: async () => ({}) } as Response);
      await result;
    });
    const payload = JSON.parse(String(output.mock.calls[0][0])) as Record<
      string,
      unknown
    >;
    expect(payload).toEqual(
      expect.objectContaining({
        event: 'http.request_slow',
        requestId: 'request-123',
        trace_id: '12345678901234567890123456789012',
        span_id: '1234567890123456',
      }),
    );
    expect(JSON.stringify(payload)).not.toContain('secret');
  });
});
