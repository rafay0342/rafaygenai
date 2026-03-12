# Dependency audit log

**Date:** 2026-02-26  
**Command:** `npm audit`

## Findings

| Package | Severity | Issue | Remediation |
| --- | --- | --- | --- |
| `ajv` | Moderate | Regular-expression denial of service when using `$data`. | Fix available via `npm audit fix`. |
| `minimatch` | High | ReDoS via repeated wildcards with a non-matching literal. | Fix available via `npm audit fix`. |

## Status
Added an npm `overrides` entry to pin `@typescript-eslint/typescript-estree` → `minimatch@>=9.0.6`. `npm install` now hoists `minimatch@10.2.4`, so no vulnerable 9.0.5 copy should remain.

`npm audit`/`npm audit fix` still fail because `registry.npmjs.org` cannot be resolved from this environment (`getaddrinfo ENOTFOUND`). Once the registry is reachable:

1. Run `npm audit fix`.
2. Verify `package-lock.json` changes (ensure no unexpected files).
3. Rerun `npm run lint`, `npm run build`, and manual smoke tests.
4. Restart `pm2` service (`pm2 restart rafaygen`).

Document the follow-up in this log after the fix is applied.

1. Run `npm audit fix`.
2. Verify `package-lock.json` changes (ensure no unexpected files).
3. Rerun `npm run lint`, `npm run build`, and manual smoke tests.
4. Restart `pm2` service (`pm2 restart rafaygen`).

Document the follow-up in this log after the fix is applied.
