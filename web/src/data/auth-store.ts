import { create } from "zustand";
import { loginWithPasswordRequest } from "./client";

type User = { slug: string; displayName: string; roles: string[] };

type AuthState = {
  user: User | null;
  setUser: (u: User | null) => void;
  loginWithPassword: (username: string, password: string) => Promise<void>;
  loginWithPasskey: (username: string) => Promise<void>;
  logout: () => Promise<void>;
};

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (u) => set({ user: u }),
  loginWithPassword: async (username: string, password: string) => {
    await loginWithPasswordRequest(username, password);
    set({ user: { slug: username, displayName: username, roles: [] } });
  },
  loginWithPasskey: async (_username: string) => {
    throw new Error("auth: passkey not connected");
  },
  logout: async () => {
    set({ user: null });
  },
}));
