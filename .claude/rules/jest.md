# Jest Rules

## Stack

- Test runner: Jest
- Unit tests: `*.spec.ts` co-located with source files
- E2E tests: `test/` directory, `*.e2e-spec.ts`

## Testing Conventions

- Mock Prisma with `jest.mock`; never hit the real database in unit tests.
- Every service method needs at least one happy path and one edge case test.
- Write e2e tests for every controller endpoint.
- Coverage threshold is 80% per service.
- Check for Prisma calls outside services.
- Check for Prisma calls for another module's models inside a service.
- Check for missing DTO validation decorators.
