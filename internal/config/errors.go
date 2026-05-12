package config

import (
	"fmt"
	"strings"
)

type EvalError struct {
	File    string
	Line    int
	Column  int
	Message string
}

func (e *EvalError) Error() string {
	if e.File != "" {
		return fmt.Sprintf("%s:%d:%d: %s", e.File, e.Line, e.Column, e.Message)
	}
	return e.Message
}

// ValidationError describes a non-fatal config issue. Compile-time checks
// produce these with Field+Message; discovery produces them with File and
// optionally Code/Line populated.
type ValidationError struct {
	Code    string // machine-readable category, e.g. "duplicate_id", "pkl_eval"
	File    string // path relative to configDir, e.g. "automations/foo.pkl"
	Line    int    // 1-based line number when known (Pkl errors); 0 otherwise
	Field   string // legacy locator, e.g. "automations[foo]"
	Message string
}

func (e *ValidationError) Error() string {
	var b strings.Builder
	if e.File != "" {
		b.WriteString(e.File)
		if e.Line > 0 {
			fmt.Fprintf(&b, ":%d", e.Line)
		}
		b.WriteString(": ")
	}
	if e.Code != "" {
		fmt.Fprintf(&b, "[%s] ", e.Code)
	}
	if e.Field != "" {
		b.WriteString(e.Field)
		b.WriteString(": ")
	}
	b.WriteString(e.Message)
	return b.String()
}
