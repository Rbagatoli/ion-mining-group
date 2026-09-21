# Quality-review field clarity

Reviewed locally against published commit `f85874962ca47f979e9755e55f01c11971eaeef8`. Publication of this exact reviewed patch was subsequently authorized. No live CRM records, native actions, schedules, or outreach were used in implementation or verification.

The coordinator form's generic check labels could be mistaken for a second decision on the source finding. For `task.role === 'review'`, the form now labels them **Quality review: evidence reasoning**, **Quality review: arithmetic reasoning**, and **Quality review: commercial-fit reasoning**. Its helper says Pass means the review's reasoning is supported and complete, and Needs revision means this review needs correction. It retains the distinction between accepting an accurate REVISE/HOLD finding and approving its source.

Each Quality-only control references that helper through `aria-describedby`. Quality-only option text repeats the distinction when choosing a value. Non-Quality wording remains unchanged. Field names, all five option values, unchecked defaults, blank decision, coordinator default, submission code, validation, versions, source verdicts, authority and sending guards remain unchanged. The previously published focused visible-error fix is retained.

## Patch scope

- `crm/crm.js`: optional escaped description ID for the existing select helper; role-specific text/description only in the standard coordinator review form.
- `tests/crm-task-route.test.js`: two synthetic render cases for Quality versus non-Quality, including unchanged values/defaults and zero writes.
- `tests/crm-review-error-browser.cjs`: both form variants at desktop and mobile sizes, meaningful accessible labels/descriptions, unchanged defaults, horizontal fit, and rejected acceptance without mutation.

`review.patch` contains the three-file diff. Browser results are in `browser/fixed/checks.json`; `desktop-qa-guidance.png` and `mobile-qa-guidance.png` show the wording together with all three controls. The rejection screenshots preserve the existing alert verification. Earlier published reports were not overwritten.

## Verification

- Syntax check for `crm/crm.js`: passed.
- `node --test tests/crm-grok-team.test.js tests/completed-team-review.test.js tests/crm-task-route.test.js`: **56/56 passed**.
- `node tests/crm-review-error-browser.cjs`: passed at **1440x900** and **390x740**, using only a loopback server and synthetic local data. No page errors, missing assets, external access, or write requests. Both forms retain their original keys/values/defaults. Quality acceptance with fit=revise is rejected before dispatch, with every draft field preserved, unchanged in-memory register, and byte-identical persisted register. The exact error remains focused and visible.
- Independent code review: no blocking concerns; scope confirmed copy/accessibility only, with no changes to submission or authorization behavior.
- `git diff --check`: passed.

Reviewed production SHA256: `578c3101ccf248cebd854a7e15001207d87ee11d60450af36098b7e271fc78ea` (`crm/crm.js`).

Deployment verification is recorded separately in `live-checks.json` after successful publication. The pending owner/native handoff remains outside this follow-up.
