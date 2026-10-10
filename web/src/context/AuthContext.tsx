import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "../lib/api";

export interface UserProfile {
  member_id: number;
  full_name: string;
  email: string;
  phone?: string | null;
  is_active: boolean;
  roles: string[];
}

interface AuthContextType {
  user: UserProfile | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  isMember: boolean;
  isOfficer: boolean;
  isTreasurer: boolean;
  requestMagicLink: (email: string, portal: "member" | "officer" | "treasurer") => Promise<{ message: string }>;
  exchangeToken: (token: string) => Promise<void>;
  registerMember: (data: { full_name: string; email: string; phone?: string }) => Promise<{ member_id: number }>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const isOfficerRole = (roles: string[] = []): boolean => {
    const officerRoles = ["president", "vice president", "secretary", "treasurer", "officer"];
    return roles.some((r) => officerRoles.includes(r.toLowerCase()));
  };

  const isTreasurerRole = (roles: string[] = []): boolean => {
    return roles.some((r) => r.toLowerCase() === "treasurer");
  };

  const refreshProfile = useCallback(async () => {
    try {
      const data = await api.get<UserProfile>("/auth/me");
      setUser(data);
    } catch {
      setUser(null);
      localStorage.removeItem("sos_token");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProfile();
  }, [refreshProfile]);

  const requestMagicLink = async (
    email: string,
    portal: "member" | "officer" | "treasurer" = "member"
  ) => {
    return api.post<{ message: string }>("/auth/magic-link", { email, portal });
  };

  const exchangeToken = async (token: string) => {
    const res = await api.post<{ token: string; token_type: string; expires_in: number }>("/auth/token", {
      token,
    });
    if (res.token) {
      localStorage.setItem("sos_token", res.token);
    }
    await refreshProfile();
  };

  const registerMember = async (data: { full_name: string; email: string; phone?: string }) => {
    const res = await api.post<{ member_id: number }>("/members/register", data);
    return res;
  };

  const logout = async () => {
    try {
      await api.post("/auth/logout");
    } catch {
      // Ignore network error on logout
    } finally {
      localStorage.removeItem("sos_token");
      setUser(null);
    }
  };

  const isOfficer = !!user && isOfficerRole(user.roles);
  const isTreasurer = !!user && isTreasurerRole(user.roles);
  const isMember = !!user;

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isLoggedIn: !!user,
        isMember,
        isOfficer,
        isTreasurer,
        requestMagicLink,
        exchangeToken,
        registerMember,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
