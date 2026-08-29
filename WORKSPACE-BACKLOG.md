# Execution workspace — deferred, with reasons

Things found while building the workspace that were deliberately **not** fixed at the time, and
why. Each says what would go wrong if it is never done, so a later reader can judge the priority
rather than inherit a list of chores.

This exists because the alternative was comments scattered across five files. A deferral nobody
can find is indistinguishable from an oversight.

---

## 1 & 2. ~~Dangling prospect references, and the advisory delete~~ — CLOSED TOGETHER

**Built as `project-link-audit.js` / `project-link-audit-ui.js`.** One mechanism, as the backlog
said it would be: resolve every project's `prospect_id` against `SiteData` on read, flag, and
repair nothing.

**Seven states, and three of them exist to avoid crying wolf about the system working as
designed.** `retired` — a cancelled project whose prospect was deliberately deleted, which
`site-model.js` allows on purpose so the prospect is reclaimable and `tests/project-model.test.js`
pins as intended. Without it every tidied-up project reports with the same count and sentence as
a live project whose id now names a different landfill. `linked_unverified` — the check could not
conclude; it never merges into `linked` or `repointed` and carries no control, because offering a
clear would invite clearing something never established. And a device that has never pulled the
prospect list says so **once** and classifies nothing, rather than reporting every project as
broken: that is an alarm about the sync state wearing the costume of an alarm about the ledger,
and it would fire on every fresh install. `SiteData.storeState()` exists so the two can be told
apart — `list()` returns `[]` for never-written, unreadable and genuinely-empty alike.

**`development_stage` is deliberately NOT a discriminator.** `ProjectGates.syncDevelopmentStage()`
writes it onto the prospect whenever a gate move earns it, while the snapshot is frozen so a later
edit cannot reprice a sanctioned budget. Comparing them would flag every project that ever
advanced a gate.

**Coordinates are the only real discriminator, and the bounds are measured.** `data/landfills.json`
has 407 LMOP ids carrying more than one row — 1,382 pairs that are the same physical landfill,
**maximum separation 0.0000 km, zero name differences**. So 150 m is a coordinate-rounding
tolerance, not an identity radius. 5 km is reasoned, not measured, and is explicitly not an
identity radius either: **83 rows have a genuinely different landfill within 1 km** and 263 within
5 km. Anything between the two bounds is unknown and says so.

**The backlog's own framing of item 1 was wrong.** A catalogue rebuild never touches
`protonMiningSites`; it replaces `ProspectStore` candidates. Every `SiteData.update()` call site
was checked and not one writes `id`, `name`, `latitude` or `longitude`. So a snapshot can only
disagree with `SiteData` when the sites array was replaced wholesale — a sync pull, a restore, an
import. That is what `repointed` and `ambiguous` catch, and the module claims nothing more.

**Item 2 is covered by the same read.** `remove()` cannot promise a cross-device guarantee it has
no transport for; the audit surfaces the result afterwards. `remove()` also stopped re-deriving
`liveFor()` — it guarded on `hasLive` and then called `forProspect` unguarded and read `live.id`
off whatever came back, so the guard named a different function from the one the next line called.

97 assertions; 19 mutations, 17 caught. Surfaced on **Today**, because a project whose prospect is gone has
no prospect page to be drawn on.

---

## 10. The map merges a rebuilt candidate onto the old saved record

**What.** `map-sourcing.js:5593`: `var existing = findSavedSite(c.id); if (existing)
SiteData.update(existing.id, changes)`. After a catalogue rebuild an id can name a **different**
landfill, and saving the prospect form then writes the new candidate's contacts, stage, operator,
rates and distress signals onto the old record. `update()` never touches `id`, `name`, `latitude`
or `longitude`, so the record keeps the old landfill's identity and acquires the new one's
research.

**Why the link audit does not catch it.** Every field the audit can compare still agrees — the
snapshot and the saved record have the same id, name and coordinates — so it correctly reports
`linked`. The hybrid is invisible to it by construction. Found while writing that module; it is
the real churn hazard, and it is a different bug from the one the audit was built for.

**What to build.** `findSavedSite()` should confirm identity before merging, not just match an id:
compare the candidate's coordinates against the saved record's with the same bounds the link audit
uses, and refuse the merge — surfacing it — when they disagree. The bounds are already measured
and already exported.

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

**CLOSED, and generally rather than for `projects` alone.**

`pullVerdict(key, localRaw, remoteData)` is a pure function — no firebase, no signed-in user, no
network — and `pullAll()` is now transport around it. Nine stores declare a record container
(`projects`, `sites`, `crmLog`, `crmFollowups`, `contacts`, `crmDocuments`, `crmEnrichment`,
`fleet`, `prospectSearches`); a key with none is pulled unguarded and the verdict SAYS SO rather
than reporting itself safe.

**It compares ids, not counts.** "Fewer records" misses the case that matters most: two devices
each add a project offline, then one signs in. Three and three — a length check writes, and one
project is gone. That case is the assertion the design turns on.

**It refuses rather than merging.** Merging means deciding which copy of a record present in
BOTH wins, and nothing here can answer that yet — item 5 below. Refusing keeps both copies, and
the next ordinary save pushes local up under `merge:true`, which set-unions the maps.

**The two directions are not symmetric**, which the first version got wrong. An unreadable LOCAL
copy blocks nothing — the store's own `read()` would reject it anyway. An unreadable REMOTE
written over readable local records destroys them twice: the bytes replace real data, then
`read()` rejects the shape and falls back to empty. That is refused whenever there is anything
to lose.

**The user is told before the reload.** A refusal nobody sees is the same silence the guard was
added to end.

`tests/sync-pull.test.js`, 58 assertions, 10 mutations all caught. `sync.js` also gained
`module.exports`, which every other module in the repo has and it did not — which is why the
pull path had never had a unit test of any kind. The container names are checked against the
modules that own the data, by creating a record through each store's own writer: a name invented
in sync.js and never checked would make `idsIn()` return null forever and the guard would be
decoration.

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

### The original entry, kept because it is why the census exists

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
