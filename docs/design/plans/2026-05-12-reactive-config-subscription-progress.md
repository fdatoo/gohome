# Reactive config subscription — execution progress log

Durable progress + blocker log for the implementation plan at
`docs/design/plans/2026-05-12-reactive-config-subscription.md`. Updated
by the controller after each task / wave.

Branch: `feat/reactive-config` (off main).

## Wave plan

| Wave | Task IDs | Notes |
|------|----------|-------|
| 0 | 1 | Proto + regen — gates everything |
| 1 | 2, 3 | Pubsub + Reloader — disjoint files |
| 2 | 4 | Wire reloader into daemon (depends on 2 + 3) |
| 3 | 5, 6 | Form trigger + watcher trigger — disjoint |
| 4 | 7 | Reload-RPC routing |
| 5 | 8 | Subscribe handler |
| 6 | 9 | Daemon E2E |
| 7 | 10, 11 | TS client + store (proto gated) |
| 8 | 12, 14 | AppLayout + ConnectionMenu — disjoint |
| 9 | 13, 15 | View hooks + topbar integration — disjoint |
| 10 | 16 or 17 | Validation |

## Task status

| ID | Title | Model | Status | Notes |
|----|-------|-------|--------|-------|
| 1 | Proto + regen | haiku | ⏳ | |
| 2 | Pubsub | haiku | ⏳ | |
| 3 | Reloader | haiku | ⏳ | |
| 4 | Wire reloader into daemon | sonnet | ⏳ | |
| 5 | Form trigger | sonnet | ⏳ | |
| 6 | Watcher trigger | haiku | ⏳ | |
| 7 | Reload RPC routing | sonnet | ⏳ | |
| 8 | Subscribe handler | sonnet | ⏳ | |
| 9 | Daemon E2E | sonnet | ⏳ | |
| 10 | TS subscribeConfig client | haiku | ⏳ | |
| 11 | configStore | haiku | ⏳ | |
| 12 | AppLayout wiring | haiku | ⏳ | |
| 13 | View re-fetch hooks | haiku | ⏳ | |
| 14 | SyConnectionMenu | haiku | ⏳ | |
| 15 | SyTopBar integration | sonnet | ⏳ | |
| 16 | Playwright E2E | controller | ⏳ | If Playwright is set up; else 17. |
| 17 | Manual validation | controller | ⏳ | Fallback for 16. |

Legend: ⏳ pending · 🟢 in progress · ✅ done · ❌ blocked

## Retry policy

API/transport errors (5xx, rate-limit) retry with exponential backoff
30s → 60s → 120s, then escalate to next-tier model (haiku → sonnet → opus).
Substantive failures (real blockers) go to the Blockers section.

## Blockers + resolutions

_None yet._

## Decision log

- **RC-1:** Implementer disabled `protoc-gen-go-grpc` in `buf.gen.yaml`
  because the binary wasn't in PATH. Controller restored it by
  `go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest` and
  re-enabling the plugin; amended the commit to include the updated
  `config_grpc.pb.go`. Reason: disabling the plugin globally would
  silently halt grpc binding regeneration for all services (driverkit +
  carport use raw gRPC, not Connect).
- **RC-1:** Implementer added a `CodeUnimplemented` stub for `Subscribe`
  instead of commenting out the interface-conformance assertion. Cleaner
  than the plan's approach; Task 8 replaces the stub anyway. Accepted.
- **RC-2:** Implementer increased TestPubsub_ConcurrentPublishSafe buffer
  from 64 to 128. Original test was buggy: 100 publishers fire before
  any receiver starts → 64-buffer drops 36 events → assertion that all
  100 arrive fails. Drop-oldest behavior is still verified in the
  sequential TestPubsub_DropsOldestOnFullBuffer; concurrent test now
  verifies only safety. Accepted.
- **RC-6:** Plan assumed an existing `config.Watcher` instance in the
  daemon startup that we could `Subscribe` to. There isn't one —
  editsession has its own `editsession.NewFileWatcher` (different type).
  Implementer correctly instantiated a fresh `config.NewWatcher` for
  the daemon's config-reload purposes, registers `main.pkl`,
  `entity-areas.pkl`, and walks `automations|areas|scenes/*.pkl`.
