import { Tracing } from '@map-colonies/tracing';
import { SpanContext, SpanKind, SpanOptions } from '@opentelemetry/api';

let tracing: Tracing | undefined;

export const getTracing = (): Tracing => {
  if (tracing === undefined) {
    tracing = new Tracing();
    tracing.start();
  }
  return tracing;
};

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
      // eslint-disable-next-line @typescript-eslint/naming-convention
      'code.function': functionName,
    },
  };

  return { traceContext, spanOptions };
}
