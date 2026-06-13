# Cross-Service Boundary Rules

If a feature crosses service boundaries, the spec must explicitly describe the contract
between services. The Architect must halt with `pending_more_info` when the service
contract, ownership boundary, request shape, response shape, timeout behavior, or error
mapping is unspecified.

When a spec refers to endpoints or a service contract is needed, consult the provider
service's generated Swagger/OpenAPI docs before designing or verifying the contract:

- `languee-nlp`: `http://localhost:8000/docs`
- `languee-back`: `http://localhost:3000/api/v1/docs`

These are default local ports. If the service defines a port environment variable in
`forge/services.toml` (for example `LANGUEE_NLP_PORT` or `LANGUEE_BACK_API_PORT`), the
actual docs URL may be environment-dependent. Check the generated service instructions
and prefer the environment-adjusted port when it is available.

If the service is unavailable or the docs endpoint cannot be reached, note that explicitly
in the agent output and fall back to analyzing the provider's routers/controllers, DTOs,
schemas, and tests from source. Do not silently invent request or response shapes.

Keep non-target service rules thin. Use them only to define or verify contracts, not to
apply unrelated implementation conventions to the target service.
