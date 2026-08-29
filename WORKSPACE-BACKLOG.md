# Execution workspace — deferred, with reasons

Things found while building the workspace that were deliberately **not** fixed at the time, and
why. Each says what would go wrong if it is never done, so a later reader can judge the priority
rather than inherit a list of chores.

This exists because the alternative was comments scattered across five files. A deferral nobody
can find is indistinguishable from an oversight.

---

## 1. A project whose prospect no longer exists is silently fine

**What.** `ProjectData` snapshots `{prospect_id, name, lat, lng, source, development_stage}` at
promotion, and the project deliberately outlives its prospect — a ledger should not evaporate
because a research record was tidied up. But nothing surfaces the dangling reference. A project
whose `prospect.prospect_id` resolves to nothing locally looks exactly like one whose prospect is
present.

**Why it is not a bug today.** The snapshot carries everything the workspace needs to render, so
nothing breaks. It is invisible rather than broken.

**Why it matters later.** Two ways to get here and both are ordinary: the prospect was deleted
after the project was cancelled, or the catalogue was rebuilt and the id churned
(`map-sourcing.js:4191` — "prospect ids change when a catalog is rebuilt"). The second is silent
and can point the id at a *different* landfill. Someone will eventually wonder why a project has
no linked prospect, and the answer will be a year old by then.

**What to build.** A resolve-on-read check that records `unresolved_since` rather than repairing
anything — the sites document may simply be the stale one, so auto-repair would be guessing.
Surface unresolved projects as a list the user clears by hand.

---

## 2. The delete refusal is advisory across devices

**What.** `SiteData.remove()` refuses a prospect with a live project. `sites` and `projects` are
two independent last-write-wins Firestore documents, so a device that has not pulled the projects
document does not see the project and allows the delete.

**Why it is not fixable in `remove()`.** The function cannot promise a cross-device guarantee it
has no transport for. Pretending otherwise would be worse than the gap.

**What to build.** Reconciliation in the workspace, sharing the mechanism with item 1: on read,
check each project against `SiteData` and flag rather than repair.

---

## 3. `site-capex.stack()` prices no gas collection component

**What.** There is a `collectionPerKw` rate on the card (unified there from
`site-infrastructure.js`), but no `collection` component in the stack at any stage. A greenfield
landfill is therefore never charged for the wellfield it would have to drill.

**CLOSED, and the deferral's own reasoning was wrong.**

**The blast radius was assumed, not measured, and it was out by three orders of magnitude.**
"Closing it moves every all-in figure in the app" — measured against the real catalogue, it moves
**15 of 11,823**, or 0.1%, and the catalogue median is unchanged at $1,650/kW. The reason is the
thing that makes the component correct: it asks `site-infrastructure.js` whether a field is
already in the ground rather than charging every landfill. 11,767 candidates already have
collection or are under a statutory mandate.

**The digest.** On the 15 rows that moved: median $2,606 -> $3,156/kW, +21%, $3.45M of capital
now charged that was not before. Zero rows moved down. Largest single: `lmop_180904-0`, 2,246 kW,
+$1,235,300.

**The mandate is not charged, and that is the whole point.** 37 landfills sit under a statutory
deadline where the OPERATOR must install collection whether or not you appear — $17.0M of
somebody else's capital. Charging it would have priced away the single best reason to be early
on those sites, which is the opening argument of `site-infrastructure.js`.

**Three states refuse to price rather than guess.** A shut wellfield does not borrow
`REFURB_RETAINED`, which was fitted to gas engines — pipe in the ground decays differently and
giving it an engine's curve is the same category error the balance-of-plant floor exists to
avoid. A site with no published status is unknown. And `absent` on a plant recorded as built is a
contradiction — three real rows — reported as unknown naming both sources, because charging would
bill a plant for a field it must already have and calling it avoided would trust a stage over a
published field.

**The assertion that pinned the gap open never worked.** It read
`stack({ usable_kw: 2000, ... }).components.every(c => c.id !== 'collection')`, and `stack()`
does not read `usable_kw` — it reads `powerPotentialKw`. The fixture failed the capacity check,
returned zero components, and `[].every(...)` is vacuously true. It would have gone on passing
the day the component was added, which is the one event it existed to catch. Both copies of it,
in `tests/site-infrastructure.test.js` and `tests/capex-rate.test.js`, are now real assertions
against a fixture that prices. Two test files also had to expose `SiteInfrastructure` on the
global: they required it into a local binding, invisible to the `typeof` lookup the component
uses.

---

## 4. One Firestore document for all projects

**What.** `sync.js` maps one store to one document; Firestore's ceiling is 1 MiB. A realistic
18-month build measures ~155 KB, so five projects fill three quarters of it.

**Mitigated, not solved.** `ProjectData` refuses writes above 500 KB and notices at 60%, naming
the largest projects and offering archive-or-split. That converts a wall into a signal.

**What to build if it is hit.** One document per project under `users/{uid}/projects/{id}`.
`SYNC_KEYS` is a static one-doc-per-key map and cannot express it, so this changes `sync.js`.
Deliberately kept out of the project-store work.

---

## 5. No conflict tiebreak exists

**What.** `sync.js:79` writes `updatedAt` on every save and **nothing in the repo reads it**.
There is no timestamp comparison, no `_v` check and no record-count check anywhere in the pull
path; `pullAll` does a bare `setItem` from the remote document.

**Why it is survivable now.** The project collections are maps keyed by id, so Firestore's
`merge:true` set-unions concurrent additions instead of clobbering them. The exposure is
concurrent edits to the *same* field of the *same* project.

**What to build.** The field is already being written on every save, so a tiebreak can be added
later against real history rather than starting from nothing.

---

## 6. `pullAll` overwrites local state unconditionally

**What.** On sign-in, `pullAll` writes every remote key into localStorage with no comparison of
version, entry count or timestamp. Firestore persistence is not enabled
(`firebase-config.js` never calls `enablePersistence`), so writes queued offline are memory-only.

**Why it is not addressed here.** It predates the workspace and affects every store, so fixing it
inside the project work would hide a general problem inside a specific change.

**What to build.** For the projects key at least, refuse a pull that would reduce the project
count or drop a project the local store has, and say so rather than doing it silently.

---

## 7. Prospects saved before the derate still hold the gross figure

**What.** `SiteSources.toSite()` used to write `usable_kw: cand.powerPotentialKw` — the gross
resource figure, before the gas cap and before parasitic load. That is fixed going forward, but
every prospect saved to the CRM before the fix still carries the inflated number, and
`map-sourcing.js:301` prefers a saved `usable_kw` over the derived one. So those records keep
showing what they always showed.

**The magnitude, measured.** Across all 30,517 candidates the two figures differ on 30,509,
always downward: -7.0% median, -20.1% on landfill gas because the gas cap binds on 2,056 of
2,064 rows. Coastal Plains RDF: 5,000 kW recorded against 3,607 kW the gas supports.

**Why it was not migrated.** `usable_kw` carries no provenance. site-capacity.js:50 is explicit
that a user-entered figure must beat the model — and a typed measurement and a machine-written
default are indistinguishable in the stored record, so a blind migration would silently overwrite
real measurements with modelled ones. That is a worse failure than the one it would fix, and an
unrecoverable one.

**BUILT, as detection rather than migration.** `capacity-audit.js` and `capacity-audit-ui.js`,
on the map, where the candidate is in hand. A saved `usable_kw` that equals its candidate's
`powerPotentialKw` to the kW while differing from `usableKwFor(c)` is machine-written with very
high confidence — a person typing a capacity does not land exactly on the gross. Those rows are
flagged and recomputed one at a time with both figures on screen, the verdict re-taken at the
moment of writing rather than trusted from when the panel was drawn, and each correction logged
against the prospect. Every record lands in exactly one of five buckets so the counts add up: a
scan that quietly dropped what it could not judge would read as a clean bill of health. The panel
draws nothing when there is nothing to say, except for unmatched records, which ARE something to
say. 49 assertions in `tests/capacity-audit.test.js`.

**What is still open.** The provenance field itself. The detector infers machine-written from an
exact match on the gross, which is strong evidence and not a record; a catalogue rebuild can move
the gas volume so a correctly-saved record matches neither figure, and it is reported as `typed`
and left alone — a deliberate false negative in the safe direction. A field recording where the
number came from would remove the inference entirely, and is the better fix if the prospect model
is ever opened.

---

## 8. ~~Nine write paths still have no control behind them~~ — CLOSED

**Closed.** All nine now have a control, and `tests/workspace-reach.test.js` prints no
`no caller yet` line. The Budget section is the bulk of it: category rows carrying the variance,
the lines under them with budgeted/committed/spent editable in place and committing on change,
a seed-from-estimate control offered only while the ledger is empty, and change orders with
Revise on the approved ones. The other four are row controls on panels that already existed —
an inline lead time on a procurement item, an inline insurance date and a remove on a
contractor, and Reject beside Certify on a submitted payment application.

`tests/budget-panel.test.js` asserts reachability by rendering the panel and loading
prospecting.js for real rather than reading source, because a control that renders and is never
wired is the failure three stages shipped with. 13 mutations, 13 caught, including a throw
planted above every new handler.

Kept below as written, because the reasoning is why the census exists.

## ~~8. Nine write paths still have no control behind them~~

**What.** `tests/workspace-reach.test.js` asserts that every module writing a per-project
collection has AT LEAST ONE writer something calls, and prints the ones nothing calls. Nine are
currently stranded:

```
ProjectBudget.seedFromEstimate, .addLine, .updateLine, .removeLine, .reviseChangeOrder
ProjectProcurement.updateItem
ProjectContractors.updateContractor, .removeContractor, .rejectPayApp
```

**Why the biggest one is `ProjectBudget`.** Five of the nine are the budget ledger, and four of
those are the ledger itself: there is no way to add, edit or remove a budget line, and no way to
seed the opening budget from the capex estimate. Stage 4 built the categories, the
three-state arithmetic and ninety-three passing assertions, and the only part of it a user can
reach is the change-order form added with the contractors panel. Estimate-versus-actual, which
is the whole reason the categories are SiteCapex's, cannot be produced by anybody.

**Why these are not asserted as failures.** Closing them is building UI, not fixing a defect,
and a suite that goes red for work not yet done stops being read -- which is how a red test
becomes a permanently ignored one. The census asserts the condition that is a genuine bug (a
ledger with NO reachable writer, which is what ProjectBudget was until this pass) and prints
the rest so the number is visible rather than implied.

**What to build.** A Budget section on the project, in the shape the other two now have: the
lines by category with variance, a seed-from-estimate control, and add/edit/remove. The other
four are row-level conveniences on panels that already exist -- an edit control on a procurement
item, edit and remove on a contractor, and a reject button beside Certify.

---

## 9. The reach census does not follow transitive dependencies

**What.** `workspace-reach.test.js` check 3 asserts that a module a RENDERER guards with a soft
`typeof` is loaded on the pages that render it. It deliberately stops there. `project-gates.js`
softly guards `CrmDocuments`, `CrmEnrichment` and `SiteOpportunity`; `contacts.html` and
`map.html` load it -- because `project-model.js` needs it for `setGate` and `SiteData.remove`'s
refusal -- without loading those three.

**Why it is not a bug today.** Neither page can reach `canAdvance()`, so the guarded branches
never run there. All three also fail in the safe direction: `docKinds()` returns `{}` so a
document-backed deliverable reads as NOT satisfied, and `readiness()` returns null rather than a
flattering number. A gate would refuse to advance rather than wrongly advancing.

**Why it is not asserted.** Nothing statically proves the branches are unreachable, and deciding
it needs reachability analysis. The alternative -- an exception list naming these three -- is a
guard that guards nothing, and would go stale the moment a page grew a gate control.

**What to build, if anything.** The cheap version is to stop loading `project-gates.js` on pages
that never advance a gate, which removes the question rather than answering it. Worth checking
that `project-model.js` genuinely tolerates its absence there first: it guards every call, but
that guard has never been exercised on those pages either.
