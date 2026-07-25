# Phase 3 Test Plan

## Automated

Vitest covers typed AST parsing, invalid aggregation, field-role/sensitivity rules, circular relationships, cardinality warnings, grain conflicts, duplication risk, metadata prompt-injection redaction, read-only SQL enforcement, permission mapping, state transitions, and immutable snapshot comparison. Existing Phase 1/2 authentication, audit, password, request-origin, data-source permission, and Oracle security tests remain in the same suite.

Verification commands:

```bash
npm run db:migrate
npm run lint
npm run typecheck
npm run test
npm run build
```

## Integration checklist

1. Create a model against a synchronized IFS UAT schema.
2. Map Purchase Order and Purchase Order Line, including columns.
3. Accept one object and one field recommendation; reject another.
4. Approve join fields, create the relationship, and run its bounded Oracle validation.
5. Create Total Purchase Order Amount as a SUM AST; validate and test it.
6. Save expected value/tolerance and confirm test history.
7. Add English and Thai glossary terms and confirm synonym search.
8. Submit, approve, publish, compare versions, and publish a rollback-derived version.
9. Confirm Dashboard Creator sees only published/approved metadata and Viewer sees only KPI descriptions.
10. Confirm audit records for every mutation contain no credential or raw sensitive value.

The repository currently has no browser E2E runner. The workflow above is the release smoke test; adopting Playwright is recommended when the project standardizes browser automation.
