import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { Resource } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { PrismaInstrumentation } from '@prisma/instrumentation';
import { SanitizingSpanProcessor } from './modules/core/sanitization/sanitize-span.processor';

// Tracing is on by default in dev; set TRACING_ENABLED=false to disable (e.g. in tests).
const tracingEnabled = process.env['TRACING_ENABLED'] !== 'false';

let sdk: NodeSDK | undefined;

if (tracingEnabled) {
  const endpoint =
    process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://alloy:4318';

  const exporter = new OTLPTraceExporter({ url: `${endpoint}/v1/traces` });

  sdk = new NodeSDK({
    resource: new Resource({
      'service.name': process.env['SERVICE_NAME'] ?? 'languee-back',
      'deployment.environment': process.env['NODE_ENV'] ?? 'development',
    }),
    spanProcessor: new SanitizingSpanProcessor(
      new BatchSpanProcessor(exporter),
    ),
    instrumentations: [
      getNodeAutoInstrumentations({
        // Do not capture any request/response headers as span attributes to
        // prevent auth header (Basic, Bearer) and cookie leakage.
        '@opentelemetry/instrumentation-http': {
          headersToSpanAttributes: {
            client: {
              requestHeaders: [],
              responseHeaders: [],
            },
            server: {
              requestHeaders: [],
              responseHeaders: [],
            },
          },
        },
        '@opentelemetry/instrumentation-undici': {
          headersToSpanAttributes: {
            requestHeaders: [],
            responseHeaders: [],
          },
        },
        // Suppress noisy low-value instrumentations.
        '@opentelemetry/instrumentation-fs': { enabled: false },
        '@opentelemetry/instrumentation-dns': { enabled: false },
      }),
      new PrismaInstrumentation(),
    ],
  });

  sdk.start();

  const shutdownSdk = (): void => {
    void sdk?.shutdown();
  };
  process.on('SIGTERM', shutdownSdk);
  process.on('SIGINT', shutdownSdk);
}
