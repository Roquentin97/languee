# Cross-Service Boundary Rules

If a feature crosses service boundaries, the spec must explicitly describe the contract
between services. The Architect must halt with `pending_more_info` when the service
contract, ownership boundary, request shape, response shape, timeout behavior, or error
mapping is unspecified.

Keep non-target service rules thin. Use them only to define or verify contracts, not to
apply unrelated implementation conventions to the target service.
