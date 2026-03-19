import { useState, useEffect } from "react";
import { useLocation } from "wouter";

interface DealerInfo {
  id: number;
  key: string;
  name: string;
  email: string;
}

export function useDealerAuth() {
  const [dealer, setDealer] = useState<DealerInfo | null>(null);
  const [isDealer, setIsDealer] = useState<boolean>(!!localStorage.getItem("dealer_token"));
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const token = localStorage.getItem("dealer_token");
    if (!token) {
      setIsDealer(false);
      setIsLoading(false);
      return;
    }

    fetch("/api/dealer/me", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Unauthorized");
        return res.json();
      })
      .then((data) => {
        setDealer(data);
        setIsDealer(true);
      })
      .catch(() => {
        localStorage.removeItem("dealer_token");
        setIsDealer(false);
        setDealer(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/dealer/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) throw new Error("Invalid credentials");

      const { token, dealer: dealerData } = await res.json();
      localStorage.setItem("dealer_token", token);
      setDealer(dealerData);
      setIsDealer(true);
      setLocation("/workspace");
    } catch (err) {
      throw err;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    localStorage.removeItem("dealer_token");
    setIsDealer(false);
    setDealer(null);
    window.location.href = "http://localhost:5000/login";
  };

  return { dealer, isDealer, isLoading, login, logout };
}
