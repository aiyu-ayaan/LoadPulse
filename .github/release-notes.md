# Release Notes Addendum

Generated from commits on `master` between 2026-03-31 and 2026-04-04.
No previous git tags were found, so this summarizes the initial release window.

## Release Type Signal

- Contains `feat` and `fix` commits
- No `feat!` or `BREAKING CHANGE` commits detected
- Suggested semantic bump: **minor**

## Highlights

- Added project-scoped routing and a project-aware, collapsible sidebar layout.
- Delivered full Integrations capabilities with cron jobs, API triggers, and project token management.
- Introduced admin console flows for account lifecycle, queue visibility, settings, and about metadata.
- Strengthened authentication with GitHub OAuth, TOTP-based 2FA, and secure cookie-backed sessions.
- Added stop controls for active runs and improved run history/report interactions.
- Improved backend responsiveness with Redis caching and Mongo index optimization.

## Features

- Project management improvements and project-level access handling.
- New test, integrations, reports, settings, and test history page enhancements.
- Script editor and contextual helper notes in dashboard/new test/reports experiences.
- Admin sign-in flow hardening and legacy admin ownership safeguards.
- Docker environment flexibility with configurable `MONGO_PORT`.

## Fixes

- Integrations flow fixes for trigger mode separation and script editor dialog containment.
- Route and sign-in fixes across integrations and admin account switching flows.
- UI cleanup fixes for conditional class names, caret rendering, and message rendering formatting.

## Refactors And Maintenance

- Settings and workspace UI refactors for cleaner navigation and responsive behavior.
- Dockerfile simplification via multi-stage builds and cleanup of outdated repository content.
- Repository metadata improvements including license and documentation updates.

## Migration Notes

- Integrations now support both cron and API trigger modes with project token controls.
- Access management payload handling was tightened to better support partial API responses.
- Admin routes now enforce sign-in and owner/admin constraints more explicitly.

## Known Issues

- No user-facing breaking changes identified from commit messages.
- Follow-up recommended: resolve current lint findings before enforcing strict PR checks.
