package page

import (
	"fmt"
	"os"
	"path/filepath"
)

// ScaffoldPage creates the two-file Pkl split for a new page in a pages directory.
func ScaffoldPage(pageDir, slug, title string) error {
	if err := os.MkdirAll(pageDir, 0o755); err != nil {
		return fmt.Errorf("scaffold: mkdir: %w", err)
	}

	sourcePath := filepath.Join(pageDir, slug+".pkl")
	layoutPath := filepath.Join(pageDir, slug+".layout.pkl")

	sourceContent := fmt.Sprintf(`import "switchyard:pages" as p
import "%s.layout.pkl" as layout

page = new p.Page {
  slug = %q
  title = %q
  sections = layout.sections
}
`, slug, slug, title)

	const layoutContent = `import "switchyard:pages" as p

// Auto-generated layout — do not edit manually.
sections: Listing<p.Section> = new {}
`

	if err := os.WriteFile(sourcePath, []byte(sourceContent), 0o644); err != nil {
		return fmt.Errorf("scaffold: write source: %w", err)
	}
	if err := os.WriteFile(layoutPath, []byte(layoutContent), 0o644); err != nil {
		return fmt.Errorf("scaffold: write layout: %w", err)
	}
	return nil
}
