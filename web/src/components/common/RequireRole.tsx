import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { NoAccessPage } from "../../pages/NoAccessPage";
import { LoadingSkeleton } from "./LoadingSkeleton";

interface RequireRoleProps {
  children: React.ReactElement;
  role: "member" | "officer" | "treasurer";
}

export const RequireRole: React.FC<RequireRoleProps> = ({ children, role }) => {
  const { user, isLoading, isOfficer, isTreasurer } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <LoadingSkeleton rows={4} />
      </div>
    );
  }

  // If not logged in, redirect to the matching portal's login page
  if (!user) {
    const loginPath =
      role === "treasurer"
        ? "/treasurer/login"
        : role === "officer"
        ? "/officer/login"
        : "/login";

    return (
      <Navigate
        to={`${loginPath}?redirect=${encodeURIComponent(location.pathname + location.search)}`}
        replace
      />
    );
  }

  // If role is officer and user is neither officer nor treasurer, show NoAccessPage
  if (role === "officer" && !isOfficer && !isTreasurer) {
    return <NoAccessPage requiredRole="officer" />;
  }

  // If role is treasurer and user is not treasurer, show NoAccessPage
  if (role === "treasurer" && !isTreasurer) {
    return <NoAccessPage requiredRole="treasurer" />;
  }

  return children;
};
