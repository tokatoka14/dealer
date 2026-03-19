import { useState, useEffect } from "react";
import { useLocation } from "wouter";

export function useAdminAuth() {
  const [isAdmin, setIsAdmin] = useState<boolean>(!!localStorage.getItem("admin_token"));
  const [isLoading, setIsLoading] = useState(false);
  const [, setLocation] = useLocation();

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) throw new Error("Invalid credentials");

      const { token } = await res.json();
      localStorage.setItem("admin_token", token);
      setIsAdmin(true);
      setLocation("/admin/dashboard");
    } catch (err) {
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("admin_token");
    setIsAdmin(false);
    window.location.href = "http://localhost:5000/login";
  };

  return { isAdmin, isLoading, login, logout };
}
