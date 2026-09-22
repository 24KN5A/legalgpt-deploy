import { useEffect, useState, type ReactNode } from "react";
import * as api from "./api";
import { clearToken, getToken, setToken } from "./auth";
import { AuthContext } from "./auth-context";
import type { User } from "../types";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(true);

  // On first load, if a token was saved from a previous visit, verify it's
  // still valid against /auth/me and restore the session -- this is what
  // lets someone close the tab and come back logged in later.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setInitializing(false);
      return;
    }
    api
      .getMe()
      .then((u) => setUser(u))
      .catch(() => clearToken())
      .finally(() => setInitializing(false));
  }, []);

  async function login(email: string, password: string) {
    const res = await api.login({ email, password });
    setToken(res.access_token);
    setUser(res.user);
  }

  async function signup(
    fullName: string,
    email: string,
    password: string,
    phoneNumber?: string
  ) {
    const res = await api.signup({
      full_name: fullName,
      email,
      password,
      phone_number: phoneNumber,
    });
    setToken(res.access_token);
    setUser(res.user);
  }

  function logout() {
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, initializing, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
