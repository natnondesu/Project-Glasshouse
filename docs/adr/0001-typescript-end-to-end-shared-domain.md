---
status: accepted
---

# TypeScript end to end with a shared domain package

Production requires the server to re-run every planning rule (U occupancy, rotated-footprint overlap, slot containment, power, revision lifecycle). We build Glasshouse in TypeScript throughout — React + Vite + react-three-fiber on the client, a pure TypeScript domain package with no DOM dependency, and (from P1) a Node backend on Postgres that imports that same package — so the rules exist exactly once and client and server can never disagree.

## Considered Options

- **Vue client + Python/Go backend** — matches the team's usual backend languages, but forces a second implementation of the geometry and occupancy rules, kept in step only by a shared test-case suite. Rejected: drift between two rule engines is the most likely source of silent planning errors.
- **Vue + TresJS + shared TypeScript domain** — keeps rules shared, but the Vue 3D ecosystem is materially less mature than react-three-fiber/drei, and two 3D views are the product's hardest surface.

## Consequences

- The P1 backend is Node, not the team's default Python/Go.
- The domain package must stay free of browser APIs so it runs unchanged on the server.
- Storage sits behind one repository interface; P1 swaps browser storage for the API without changing domain or UI code.
