import { useState, useEffect } from "react";

const AUTH_KEY = "devalor_auth";
const VALID_USER = "devalor";
const VALID_PASS = "devalor123";

export const useSimpleAuth = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(AUTH_KEY);
    setIsAuthenticated(stored === "true");
  }, []);

  const login = (user: string, password: string): boolean => {
    if (user === VALID_USER && password === VALID_PASS) {
      localStorage.setItem(AUTH_KEY, "true");
      setIsAuthenticated(true);
      return true;
    }
    return false;
  };

  const logout = () => {
    localStorage.removeItem(AUTH_KEY);
    setIsAuthenticated(false);
  };

  return { isAuthenticated, login, logout };
};
