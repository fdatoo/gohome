package config

import "time"

// LifecycleOverride mirrors the Pkl `switchyard.carport.LifecycleOverride`
// class. Used at every override layer (driver manifest defaults and
// per-instance overrides). Nil pointer means "not set; inherit the next layer
// down."
type LifecycleOverride struct {
	HandshakeDeadline       *time.Duration
	HealthProbeInterval     *time.Duration
	HealthProbeTimeout      *time.Duration
	HealthFailuresToRestart *int
	ShutdownGrace           *time.Duration
	RestartBackoffInitial   *time.Duration
	RestartBackoffMax       *time.Duration
	RestartBudgetWindow     *time.Duration
	RestartBudgetMax        *int
}

// lifecycleOverrideJSON is the wire shape Pkl's JSON renderer produces for
// `LifecycleOverride`. Unset fields are omitted entirely (Pkl drops nulls),
// so pointer-typed fields end up nil after json.Unmarshal.
type lifecycleOverrideJSON struct {
	HandshakeDeadline       *string `json:"handshakeDeadline"`
	HealthProbeInterval     *string `json:"healthProbeInterval"`
	HealthProbeTimeout      *string `json:"healthProbeTimeout"`
	HealthFailuresToRestart *int    `json:"healthFailuresToRestart"`
	ShutdownGrace           *string `json:"shutdownGrace"`
	RestartBackoffInitial   *string `json:"restartBackoffInitial"`
	RestartBackoffMax       *string `json:"restartBackoffMax"`
	RestartBudgetWindow     *string `json:"restartBudgetWindow"`
	RestartBudgetMax        *int    `json:"restartBudgetMax"`
}

// decodeLifecycleOverride converts the wire shape to the Go shape, parsing
// Pkl-rendered durations on the way through.
func decodeLifecycleOverride(j lifecycleOverrideJSON) LifecycleOverride {
	out := LifecycleOverride{
		HealthFailuresToRestart: j.HealthFailuresToRestart,
		RestartBudgetMax:        j.RestartBudgetMax,
	}
	if j.HandshakeDeadline != nil {
		if d, err := parsePklDuration(*j.HandshakeDeadline); err == nil {
			out.HandshakeDeadline = &d
		}
	}
	if j.HealthProbeInterval != nil {
		if d, err := parsePklDuration(*j.HealthProbeInterval); err == nil {
			out.HealthProbeInterval = &d
		}
	}
	if j.HealthProbeTimeout != nil {
		if d, err := parsePklDuration(*j.HealthProbeTimeout); err == nil {
			out.HealthProbeTimeout = &d
		}
	}
	if j.ShutdownGrace != nil {
		if d, err := parsePklDuration(*j.ShutdownGrace); err == nil {
			out.ShutdownGrace = &d
		}
	}
	if j.RestartBackoffInitial != nil {
		if d, err := parsePklDuration(*j.RestartBackoffInitial); err == nil {
			out.RestartBackoffInitial = &d
		}
	}
	if j.RestartBackoffMax != nil {
		if d, err := parsePklDuration(*j.RestartBackoffMax); err == nil {
			out.RestartBackoffMax = &d
		}
	}
	if j.RestartBudgetWindow != nil {
		if d, err := parsePklDuration(*j.RestartBudgetWindow); err == nil {
			out.RestartBudgetWindow = &d
		}
	}
	return out
}
