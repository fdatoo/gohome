package bridge

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// Client talks to a single Philips Hue bridge over CLIP v2. Safe for
// concurrent use by multiple goroutines.
type Client struct {
	baseURL    string
	apiKey     string
	httpClient *http.Client
}

// New constructs a Client. address is "<host>" or "<host>:<port>" — the
// CLIP v2 API is always HTTPS, so no scheme. apiKey is the bridge
// application key. tlsSkipVerify defaults to true in production because the
// bridge ships a self-signed cert.
func New(address, apiKey string, tlsSkipVerify bool) (*Client, error) {
	if address == "" {
		return nil, fmt.Errorf("bridge address is required")
	}
	if apiKey == "" {
		return nil, fmt.Errorf("api key is required")
	}
	return &Client{
		baseURL: "https://" + address,
		apiKey:  apiKey,
		httpClient: &http.Client{
			Transport: &http.Transport{
				TLSClientConfig: &tls.Config{InsecureSkipVerify: tlsSkipVerify}, //nolint:gosec // bridge ships self-signed cert
			},
		},
	}, nil
}

// ListLights returns every light resource on the bridge.
func (c *Client) ListLights(ctx context.Context) ([]Light, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/clip/v2/resource/light", nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("hue-application-key", c.apiKey)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close() //nolint:errcheck // body read fully in success/error paths
	if resp.StatusCode/100 != 2 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("hue: list lights: status %d: %s", resp.StatusCode, body)
	}
	var out listLightsResponse
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, fmt.Errorf("hue: decode list lights: %w", err)
	}
	return out.Data, nil
}
