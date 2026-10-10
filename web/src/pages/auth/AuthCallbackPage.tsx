import React, { useEffect, useState } from "react";
import { useSearchParams, useNavigate, Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle, ArrowRight } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { APIClientError } from "../../lib/api";

export const AuthCallbackPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const { exchangeToken, isOfficer, isTreasurer } = useAuth();
  const navigate = useNavigate();

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setErrorMessage("No login token provided in URL.");
      return;
    }

    let isMounted = true;
    const processToken = async () => {
      try {
        await exchangeToken(token);
        if (isMounted) {
          setStatus("success");
          setTimeout(() => {
            if (isTreasurer) {
              navigate("/treasurer/dashboard", { replace: true });
            } else if (isOfficer) {
              navigate("/officer/checkin", { replace: true });
            } else {
              navigate("/me/membership", { replace: true });
            }
          }, 1200);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setStatus("error");
          if (err instanceof APIClientError) {
            if (err.code === "UNAUTHENTICATED") {
              setErrorMessage("That sign-in link has expired or was already used. Send yourself a new one.");
            } else {
              setErrorMessage(err.message);
            }
          } else {
            setErrorMessage("Failed to verify login token. Please request a new link.");
          }
        }
      }
    };

    processToken();

    return () => {
      isMounted = false;
    };
  }, [token, exchangeToken, navigate, isOfficer, isTreasurer]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-xl p-8 text-center">
        {status === "loading" && (
          <div className="py-8">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-slate-200 border-t-sky-600 mb-4"></div>
            <h2 className="text-xl font-bold text-slate-900">Signing you in…</h2>
            <p className="mt-2 text-sm text-slate-500">
              Verifying your single-use security token with the server.
            </p>
          </div>
        )}

        {status === "success" && (
          <div className="py-6">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-4">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900">Signed In!</h2>
            <p className="mt-2 text-sm text-slate-600">
              Session established successfully. Redirecting to your workspace…
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="py-4">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600 mb-4">
              <AlertTriangle className="h-8 w-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Unable to Sign In</h2>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              {errorMessage}
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link
                to="/login"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 transition"
              >
                Send a new link
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link to="/" className="text-xs text-slate-500 hover:text-slate-800">
                Return to home page
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
