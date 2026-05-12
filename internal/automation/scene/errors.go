package scene

import "errors"

// ErrSceneNotFound is returned by Applier.Invoke when no scene with the
// requested id exists in the current snapshot.
var ErrSceneNotFound = errors.New("scene: not found")
