# Contributing to roguelite-core

Thanks for your interest in contributing! This project aims to be a small,
well-tested, dependency-free game engine, so contributions that keep it focused
and deterministic are especially welcome.

## Getting started

Requirements: Node ≥ 20.

```bash
npm install
npm test        # run the test suite (Vitest)
npm run lint    # ESLint
npm run build   # typecheck + build
npm run sim     # balance simulation across many seeded runs
```

## Ground rules

- **Keep it isomorphic.** No browser or Node-only APIs in the engine. It must run
  anywhere. This is enforced by lint; please don't disable that rule.
- **Keep it deterministic.** All randomness must flow through the seeded PRNG.
  Never call `Math.random()` in engine code.
- **Content stays out.** The engine defines contracts, not creatures. No game
  data, names, or art in this repository.
- **Tests required.** New mechanics need unit tests. Prefer pure functions and
  test with fixtures rather than real datasets.

## Workflow

1. Open an issue describing the change (bug or proposal) before large PRs.
2. Use [Conventional Commits](https://www.conventionalcommits.org/)
   (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`).
3. Make sure `npm test`, `npm run lint`, and `npm run build` pass.
4. Open a PR with a clear description and, where relevant, before/after balance
   numbers from `npm run sim`.

## Good first contributions

- Additional unit tests for battle math edge cases.
- Documentation and usage examples.
- New optional map node types or status conditions (behind clear interfaces).

By contributing, you agree that your contributions are licensed under the
project's [MIT License](LICENSE).
