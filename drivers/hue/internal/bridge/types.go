// Package bridge is the HTTPS + SSE client for the Philips Hue CLIP v2 API.
package bridge

// Light is a single light resource as returned by GET /clip/v2/resource/light.
// Only the fields we use are modeled; the bridge sends more.
type Light struct {
	ID               string            `json:"id"`
	Type             string            `json:"type"` // always "light" for items in the lights collection
	Metadata         LightMetadata     `json:"metadata"`
	On               OnState           `json:"on"`
	Dimming          *Dimming          `json:"dimming,omitempty"`
	ColorTemperature *ColorTemperature `json:"color_temperature,omitempty"`
}

// LightMetadata carries the human-friendly bulb name set in the Hue app.
type LightMetadata struct {
	Name string `json:"name"`
}

// OnState models the bridge's nested {"on": bool} shape.
type OnState struct {
	On bool `json:"on"`
}

// Dimming carries the bulb's brightness in 0-100 float (Hue's native range).
type Dimming struct {
	Brightness float64 `json:"brightness"`
}

// ColorTemperature carries color temp in mireds. Mirek is null on bulbs that
// don't support color temperature.
type ColorTemperature struct {
	Mirek *uint32 `json:"mirek"`
}

// LightUpdate is the JSON body sent to PUT /clip/v2/resource/light/{id}.
// Pointer fields let us send only the keys we want to change.
type LightUpdate struct {
	On               *OnState          `json:"on,omitempty"`
	Dimming          *Dimming          `json:"dimming,omitempty"`
	ColorTemperature *ColorTemperature `json:"color_temperature,omitempty"`
}

// listLightsResponse is the envelope returned by GET /clip/v2/resource/light.
type listLightsResponse struct {
	Errors []struct {
		Description string `json:"description"`
	} `json:"errors"`
	Data []Light `json:"data"`
}

// Event is a single resource-changed payload pulled from the SSE stream.
// Hue v2 events carry only the fields that changed.
type Event struct {
	ID               string            `json:"id"`
	Type             string            `json:"type"` // resource type, e.g. "light"
	On               *OnState          `json:"on,omitempty"`
	Dimming          *Dimming          `json:"dimming,omitempty"`
	ColorTemperature *ColorTemperature `json:"color_temperature,omitempty"`
}
