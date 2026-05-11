import { describe, expect, it, vi } from "vitest";
import { ConnectHTTPError, withAuthRefresh } from "./client";

describe("withAuthRefresh", () => {
  it("refreshes after a 401 and retries the call", async () => {
    const call = vi.fn()
      .mockRejectedValueOnce(new ConnectHTTPError("expired", 401))
      .mockResolvedValueOnce("ok");
    const refresh = vi.fn().mockResolvedValue(undefined);

    await expect(withAuthRefresh(call, { refresh })).resolves.toBe("ok");

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it("redirects to login when refresh fails", async () => {
    const refreshError = new Error("refresh failed");
    const call = vi.fn().mockRejectedValue(new ConnectHTTPError("expired", 401));
    const refresh = vi.fn().mockRejectedValue(refreshError);
    const redirectToLogin = vi.fn();

    await expect(withAuthRefresh(call, { refresh, redirectToLogin })).rejects.toBe(refreshError);

    expect(redirectToLogin).toHaveBeenCalledWith("/login");
    expect(call).toHaveBeenCalledTimes(1);
  });
});
