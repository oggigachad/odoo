import React from "react";
import { Link } from "react-router-dom";
import { ShieldAlert, ArrowRight, LogOut } from "lucide-react";
import { useAuth } from "../context/AuthContext";

interface NoAccessPageProps {
  requiredRole?: "officer" | "treasurer";
}

export const NoAccessPage: React.FC<NoAccessPageProps> = ({ requiredRole = "officer" }) => {
  const { logout, user } = useAuth();

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-8 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 mb-5 border border-amber-200">
          <ShieldAlert className="h-8 w-8" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-slate-900">
          No Access
        </h2>
        <p className="mt-2 text-sm text-slate-600 leading-relaxed">
          This account ({user?.email}) is not set up as an{" "}
          <span className="font-semibold text-slate-900">{requiredRole}</span>.
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Officer and treasurer access is assigned by the elected leadership team.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            to="/me/membership"
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition shadow-sm"
          >
            Go to My Stuff
            <ArrowRight className="h-4 w-4" />
          </Link>
          <button
            onClick={() => logout()}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
};
