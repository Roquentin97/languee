# Prisma Rules

## Stack

- Database: PostgreSQL via Prisma
- Schema path: `apps/languee-back/prisma/schema.prisma`

## Persistence Conventions

- We do not use repositories.
- Services are the module boundary for business logic and persistence access.
- Do not create `<Entity>PrismaService` classes.
- Domain services may use Prisma internally, but expose business-oriented methods rather
  than raw persistence operations.
- Prisma calls remain behind module-owned services.
- Never call Prisma directly from controllers.
- Never modify the database directly; always use Prisma migrations.
- Never modify `schema.prisma` without also generating a migration.
- Run `yarn prisma generate` after every schema change before touching service code.
- Model names are PascalCase singular, such as `User`, not `users`.
- Always define `@relation` on both sides of a relation.
- When a task touches the DB, validate migration runs cleanly on a fresh schema.
