import { Tracing } from '@map-colonies/tracing';
import { SpanContext, SpanKind, SpanOptions } from '@opentelemetry/api';
import { IGNORED_INCOMING_TRACE_ROUTES, IGNORED_OUTGOING_TRACE_ROUTES } from './constants';

let tracing: Tracing | undefined;

export function tracingFactory(options: ConstructorParameters<typeof Tracing>[0]): Tracing {
  tracing = new Tracing({
    ...options,
    autoInstrumentationsConfigMap: {
      '@opentelemetry/instrumentation-http': {
        ignoreIncomingRequestHook: (request): boolean =>
          IGNORED_INCOMING_TRACE_ROUTES.some((route) => request.url !== undefined && route.test(request.url)),
        ignoreOutgoingRequestHook: (request): boolean =>
          IGNORED_OUTGOING_TRACE_ROUTES.some((route) => typeof request.path === 'string' && route.test(request.path)),
      },
      '@opentelemetry/instrumentation-fs': {
        requireParentSpan: true,
      },
    },
  });

  return tracing;
}

export function getTracing(): Tracing {
  if (!tracing) {
    throw new Error('tracing not initialized');
  }
  return tracing;
}

export { tracing };

export const FLAG_SAMPLED = 1; // 00000001

export function createSpanMetadata(
  functionName?: string,
  spanKind?: SpanKind,
  context?: { traceId: string; spanId: string }
): { traceContext: SpanContext | undefined; spanOptions: SpanOptions | undefined } {
  const traceContext = context ? { ...context, traceFlags: FLAG_SAMPLED } : undefined;

  const spanOptions: SpanOptions = {
    kind: spanKind,
    ...(traceContext && { links: [{ context: traceContext }] }),
    attributes: {
      'code.function': functionName,
    },
  };

  return { traceContext, spanOptions };
}
