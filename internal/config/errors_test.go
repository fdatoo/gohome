package config

import "testing"

func TestValidationError_FormatsWithCode(t *testing.T) {
	e := ValidationError{
		Code:    "duplicate_id",
		File:    "automations/foo.pkl",
		Field:   "automations[foo]",
		Message: "id 'foo' already declared inline",
	}
	got := e.Error()
	want := "automations/foo.pkl: [duplicate_id] automations[foo]: id 'foo' already declared inline"
	if got != want {
		t.Errorf("Error() = %q, want %q", got, want)
	}
}

func TestValidationError_FormatsWithFileAndLine(t *testing.T) {
	e := ValidationError{
		Code:    "pkl_eval",
		File:    "automations/bad.pkl",
		Line:    12,
		Message: "unexpected token",
	}
	got := e.Error()
	want := "automations/bad.pkl:12: [pkl_eval] unexpected token"
	if got != want {
		t.Errorf("Error() = %q, want %q", got, want)
	}
}

func TestValidationError_FormatsLegacyFieldOnly(t *testing.T) {
	e := ValidationError{
		Field:   "automations[foo]",
		Message: "duplicate automation id",
	}
	got := e.Error()
	want := "automations[foo]: duplicate automation id"
	if got != want {
		t.Errorf("Error() = %q, want %q", got, want)
	}
}
