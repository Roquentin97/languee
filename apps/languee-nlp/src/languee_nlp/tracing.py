from __future__ import annotations

from typing import TYPE_CHECKING

from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

if TYPE_CHECKING:
    from languee_nlp.settings import Settings

_SENSITIVE_ATTR_FRAGMENTS = frozenset(
    [
        "authorization",
        "password",
        "pass",
        "token",
        "accesstoken",
        "refreshtoken",
        "jwt",
        "cookie",
        "set-cookie",
        "secret",
        "apikey",
        "x-api-key",
    ]
)


def sanitize_server_request_span(span: object, scope: object) -> None:
    """Defense-in-depth: strip sensitive attributes from server spans before export."""
    if not (hasattr(span, "is_recording") and span.is_recording()):  # type: ignore[union-attr]
        return
    attrs = getattr(span, "attributes", None) or {}
    for key in list(attrs.keys()):
        if any(fragment in key.lower() for fragment in _SENSITIVE_ATTR_FRAGMENTS):
            span.set_attribute(key, "[REDACTED]")  # type: ignore[union-attr]


def configure_tracing(settings: Settings) -> None:
    if not settings.tracing_enabled:
        return

    resource = Resource.create(
        {
            "service.name": settings.service_name,
            "deployment.environment": settings.environment,
        }
    )

    exporter = OTLPSpanExporter(
        endpoint=f"{settings.otel_exporter_otlp_endpoint}/v1/traces",
    )

    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
