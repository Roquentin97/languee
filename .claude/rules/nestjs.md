# NestJS Rules

## Stack

- Runtime: Node.js, TypeScript strict mode
- Framework: NestJS 11
- Cache: Redis
- Package manager: Yarn

## TypeScript Rules

- Never use `any`; use `unknown` and narrow it.
- Always handle null and undefined explicitly.
- No const enums or namespace merging.
- `emitDecoratorMetadata` and `experimentalDecorators` are required for NestJS DI.

## Linting and Formatting

- ESLint 9 flat config with `typescript-eslint` recommended type-checked rules.
- Prettier with single quotes and trailing commas.
- `yarn lint` auto-fixes on run and must pass with zero errors before completion.
- `yarn format` handles formatting.

## NestJS Conventions

- One module per domain; never put feature logic directly in `AppModule`.
- Modules live at `src/modules/<module>/`.
- Use constructor injection, never property injection.
- DTOs live in `dto/` inside their module folder and use `class-validator`.
- Controllers handle HTTP only and never contain business logic.
- Controllers call services, not Prisma, use cases, or persistence directly.
- Controllers call serializers for response shaping.
- Services own business logic and coordinate persistence.
- For simple CRUD, controllers should call service methods directly.
- Avoid heavy Clean Architecture layers unless module complexity justifies them.
- If a service grows beyond three public orchestration methods, Architect may suggest
  extracting orchestration into use cases.

## Module Boundaries

- Never import across domain modules directly for data access; use shared modules,
  events, or the owning module's service.
- Services never call Prisma models belonging to another module.
- Cross-module data access must go through that module's service.

## Service Structure

Default feature structure:

```text
apps/languee-back/src/modules/<module>/
  <module>.module.ts
  <module>.service.ts
  <module>.controller.ts
  dto/
    create-<module>.dto.ts
    update-<module>.dto.ts
```

Implement in this order when applicable: module, service, controller, DTO, serializer.

## core/ Conventions

`core/` is for infrastructure with zero domain coupling. If removing any domain module
would break something in `core/`, it does not belong there.

- `pipes/` contains ValidationPipe configuration and generic transformation pipes.
- `decorators/` contains generic cross-cutting decorators such as `@Public()` or
  `@Roles()`.

## Auth Module Conventions

Domain-specific auth infrastructure lives inside the auth module:

- `auth/guards/` for `JwtAuthGuard` and other auth guards.
- `auth/decorators/` for `@CurrentUser()` and auth-specific parameter decorators.
- `auth/strategies/` for Passport strategies.

Other modules apply auth guards by importing from `auth/guards/`; they never reimplement
auth logic.

## API Documentation

Always update the Bruno collection in `apps/languee-back/bruno/` when adding or changing
NestJS API requests.
