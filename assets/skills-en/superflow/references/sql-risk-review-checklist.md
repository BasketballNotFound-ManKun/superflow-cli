# SQL Risk Review Checklist

Use before implementation for any DB, Mapper/XML, migration, seed data, or SQL
script change.

## Blockers

- Dynamic DDL without explicit approved exemption.
- INFORMATION_SCHEMA driven compatibility scripts used where simple versioned SQL
  is required.
- Missing table, column, index, or seed-data owner.
- Missing rollback or recovery note for DML.
- Missing total version SQL alignment.
- Cross-repo shared table not checked in every consumer repo.

## Warnings

- Wide or unused index.
- JSON fallback that changes semantic precision.
- Relationship table guessed from naming instead of code usage.
- Parser compatibility not tested against target environment.

## Required Output

Record table, field/index/data, source reference, total SQL location,
development DB status, test DB status, and final handling decision.
