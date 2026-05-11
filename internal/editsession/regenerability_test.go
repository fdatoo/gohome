package editsession

import (
	"testing"
)

func TestAnalyzeFile_PlainLiteral_EmptyReport(t *testing.T) {
	report, err := AnalyzeFile("testdata/plain_literal.pkl")
	if err != nil {
		t.Fatalf("AnalyzeFile: %v", err)
	}
	if len(report) != 0 {
		t.Errorf("expected 0 regions, got %d: %+v", len(report), report)
	}
}

func TestAnalyzeFile_StarlarkCall_OneRegion(t *testing.T) {
	report, err := AnalyzeFile("testdata/starlark_call.pkl")
	if err != nil {
		t.Fatalf("AnalyzeFile: %v", err)
	}
	if len(report) != 1 {
		t.Fatalf("expected 1 region, got %d: %+v", len(report), report)
	}
	if report[0].Reason != ReasonStarlarkCall {
		t.Errorf("expected reason %q, got %q", ReasonStarlarkCall, report[0].Reason)
	}
}

func TestAnalyzeFile_ImportStmt_OneRegion(t *testing.T) {
	report, err := AnalyzeFile("testdata/import_stmt.pkl")
	if err != nil {
		t.Fatalf("AnalyzeFile: %v", err)
	}
	if len(report) != 1 {
		t.Fatalf("expected 1 region, got %d: %+v", len(report), report)
	}
	if report[0].Reason != ReasonImport {
		t.Errorf("expected reason %q, got %q", ReasonImport, report[0].Reason)
	}
}

func TestAnalyzeFile_LetBinding_OneRegion(t *testing.T) {
	report, err := AnalyzeFile("testdata/let_binding.pkl")
	if err != nil {
		t.Fatalf("AnalyzeFile: %v", err)
	}
	if len(report) != 1 {
		t.Fatalf("expected 1 region, got %d: %+v", len(report), report)
	}
	if report[0].Reason != ReasonLetBinding {
		t.Errorf("expected reason %q, got %q", ReasonLetBinding, report[0].Reason)
	}
}

func TestAnalyzeFile_Mixed_OnlyStarlarkRegion(t *testing.T) {
	report, err := AnalyzeFile("testdata/mixed.pkl")
	if err != nil {
		t.Fatalf("AnalyzeFile: %v", err)
	}
	// Only the starlark line should be flagged, not the plain fields
	if len(report) != 1 {
		t.Fatalf("expected 1 region, got %d: %+v", len(report), report)
	}
	if report[0].Reason != ReasonStarlarkCall {
		t.Errorf("expected reason %q, got %q", ReasonStarlarkCall, report[0].Reason)
	}
}
