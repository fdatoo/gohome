package editsession

// TODO: AST-aware analysis once Pkl exposes a parse API.
// This implementation uses a text-search heuristic: scan each line for
// non-round-trippable tokens (starlark(, import ", local) and marks those
// line ranges as file-only. This is conservative: it may produce false
// positives for plain string values that contain these token patterns.

import (
	"bufio"
	"os"
	"strings"
)

// Reason constants for FileOnlyRegion.Reason.
const (
	ReasonStarlarkCall     = "starlark_call"
	ReasonImport           = "import"
	ReasonLetBinding       = "let_binding"
	ReasonNondeterministic = "nondeterministic"
)

// FileOnlyRegion describes a line range that the regenerator cannot round-trip.
type FileOnlyRegion struct {
	StartLine int32  // 1-indexed
	EndLine   int32  // 1-indexed, inclusive
	Reason    string // one of the Reason* constants
}

// AnalyzeFile scans the Pkl file at path and returns any file-only regions.
// The caller does not need an open edit session — this is stateless.
//
// TODO: AST-aware analysis once Pkl exposes a parse API.
func AnalyzeFile(path string) ([]FileOnlyRegion, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer func() { _ = f.Close() }()

	var regions []FileOnlyRegion
	scanner := bufio.NewScanner(f)
	lineNum := int32(0)
	for scanner.Scan() {
		lineNum++
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)

		// Skip comment lines.
		if strings.HasPrefix(trimmed, "///") || strings.HasPrefix(trimmed, "//") {
			continue
		}

		reason, matched := classifyLine(trimmed)
		if matched {
			regions = append(regions, FileOnlyRegion{
				StartLine: lineNum,
				EndLine:   lineNum,
				Reason:    reason,
			})
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return regions, nil
}

// classifyLine returns the reason and true if the line contains a
// non-round-trippable construct.
func classifyLine(line string) (reason string, matched bool) {
	// starlark( call — highest priority check
	if strings.Contains(line, "starlark(") {
		return ReasonStarlarkCall, true
	}

	// import statement: starts with 'import "' or 'import '''
	if strings.HasPrefix(line, `import "`) || strings.HasPrefix(line, "import '") {
		return ReasonImport, true
	}

	// let / local binding: 'local <ident>' or 'let <ident>'
	if strings.HasPrefix(line, "local ") || strings.HasPrefix(line, "let ") {
		return ReasonLetBinding, true
	}

	return "", false
}
