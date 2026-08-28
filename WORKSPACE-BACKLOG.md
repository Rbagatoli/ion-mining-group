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

**Why it is deferred.** Closing it moves every all-in figure in the app, including the ranked
table's All-in $/kW column and every capital-avoided comparison. That is a re-baselining, not a
fix, and it wants its own change with its own before/after digest.

**Where it is already recorded.** `site-capex.js:80` and an assertion in
`tests/site-infrastructure.test.js` that holds the gap open so the rate move is not mistaken for
having closed it.

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

**Why it is not addressed here.** `usable_kw` carries no provenance. site-capacity.js:50 is
explicit that a user-entered figure must beat the model — and a typed measurement and a
machine-written default are indistinguishable in the stored record, so a blind migration would
silently overwrite real measurements with modelled ones. That is a worse failure than the one it
would fix.

**What to build.** Detection rather than migration, on the map where the candidate is in hand: a
saved `usable_kw` that exactly equals its candidate's `powerPotentialKw` while differing from
`usableKwFor(c)` is almost certainly machine-written, since a person typing 3,607 by hand and
landing exactly on the gross is implausible. Flag those rows and offer to recompute one at a
time, with the old and new figures both on screen. A field recording where the number came from
would remove the guesswork entirely and is the better fix if the prospect model is ever opened.
