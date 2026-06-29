# Architecture And Engineering Decisions

> **Purpose**: Capture long-lived architectural choices, engineering conventions,
> and the reasoning behind trade-offs.
> **Owners**: Architect / tech lead / module owner
> **Recommended format**: ADR (Architecture Decision Record)

## ADR-001: <Decision Title>

- **Status**: Proposed / Accepted / Deprecated / Replaced
- **Date**: YYYY-MM-DD
- **Context**: Why this decision is needed.
- **Decision**: The selected approach.
- **Alternatives**:
  - Option A: benefits and costs.
  - Option B: benefits and costs.
- **Impact**: Repositories, modules, tables, APIs, jobs, or deployment paths.
- **Consequences**: Benefits, costs, risks, and future constraints.
- **Verification**: How to prove the decision is implemented correctly.

## 1. Project Structure

| Topic | Current Convention | Source Of Truth | Notes |
|-------|--------------------|-----------------|-------|
| Module boundaries | `<Description>` | `<Directory/doc/config>` | `<Notes>` |
| Layering | `<Description>` | `<Entrypoint>` | `<Notes>` |
| Naming | `<Description>` | `<README/code example>` | `<Notes>` |
| Configuration | `<Description>` | `<env/config/secret source>` | `<Notes>` |

## 2. Database And Persistence

| Topic | Current Convention | Required Gate |
|-------|--------------------|---------------|
| Schema source of truth | `<SQL/migration/live schema>` | Verify before edits |
| Release SQL / migration | `<Rule>` | Required fields must ship |
| Shared table consumers | `<Repo/module list>` | Reverse-scan all consumers |
| Soft delete / multi-tenancy | `<Rule>` | Mapper/XML queries must align |

## 3. API And Integration

| Topic | Current Convention | Verification |
|-------|--------------------|--------------|
| API style | `<REST/RPC/GraphQL/message>` | `<Contract/integration test>` |
| Authentication | `<Method>` | `<Test account/permission matrix>` |
| Error codes | `<Rule>` | `<API doc/test>` |
| External calls | `<Rule>` | `<Sandbox/real env/simulator>` |

## 4. Testing And Delivery

- Unit tests prove local logic; they do not prove a real delivery path.
- External entry points require real request, message, log, or state evidence.
- Database-backed changes require schema and data evidence.
- Async flows require message, log, state transition, retry, or compensation
  evidence.
- Before claiming completion, run the relevant Superflow guard and project
  verification command.

## 5. Superflow Usage Decisions

- OpenSpec/SDD owns WHAT and contracts.
- Superpowers owns source-level HOW, TDD order, review, and verification
  discipline.
- `.sdd/state.yaml` and `.sdd/handoff/` are the state source of truth for
  preventing context drift.
- Parallel workers must state which docs and code paths they may edit.
- Refresh the handoff hash when docs, code, prompts, or test reports change.

## 6. Deprecated Decisions

| Old Decision | Why Deprecated | Replacement | Date |
|--------------|----------------|-------------|------|
| `<ADR ID>` | `<Reason>` | `<ADR ID>` | `YYYY-MM-DD` |
