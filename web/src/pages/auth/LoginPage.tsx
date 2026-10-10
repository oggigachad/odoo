import React, { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import { Mail, CheckCircle2, Shield, Lock, ArrowRight, UserPlus } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { ErrorBanner } from "../../components/common/ErrorBanner";
import { APIClientError } from "../../lib/api";

interface LoginPageProps {
  portal: "member" | "officer" | "treasurer";
}

export const LoginPage: React.FC<LoginPageProps> = ({ portal }) => {
  const { requestMagicLink, registerMember, isLoggedIn, isOfficer, isTreasurer } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // If already logged in, redirect to respective section
  React.useEffect(() => {
    if (isLoggedIn) {
      const redirect = searchParams.get("redirect");
      if (redirect) {
        navigate(redirect, { replace: true });
        return;
      }
      if (portal === "treasurer" && isTreasurer) {
        navigate("/treasurer/dashboard", { replace: true });
      } else if (portal === "officer" && (isOfficer || isTreasurer)) {
        navigate("/officer/checkin", { replace: true });
      } else {
        navigate("/me/membership", { replace: true });
      }
    }
  }, [isLoggedIn, portal, isOfficer, isTreasurer, navigate, searchParams]);

  const [email, setEmail] = useState("");
  const [isSent, setIsSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New member signup state (member portal only)
  const [isSigningUp, setIsSigningUp] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");

  const portalConfig = {
    member: {
      title: "Member Sign In",
      subtitle: "Access your memberships, tickets, and student perks.",
      badge: "Student & Member Portal",
      badgeClass: "bg-slate-100 text-slate-800",
      icon: <Mail className="h-6 w-6 text-slate-700" />,
      note: "Single-use magic link sent to your university email.",
    },
    officer: {
      title: "Officer Sign In",
      subtitle: "Door scanner, member verification, and event management.",
      badge: "Elected Officers Only",
      badgeClass: "bg-sky-50 text-sky-800 border-sky-200",
      icon: <Shield className="h-6 w-6 text-sky-600" />,
      note: "Officer access is configured by the elected executive committee.",
    },
    treasurer: {
      title: "Treasurer Sign In",
      subtitle: "Club balances, receipts, dues reconciliation, and financial ledger.",
      badge: "Treasury Guard",
      badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
      icon: <Lock className="h-6 w-6 text-emerald-600" />,
      note: "Strict access control with multi-factor audit logging.",
    },
  }[portal];

  const handleSendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;

    setError(null);
    setErrorCode(undefined);
    setIsSubmitting(true);

    try {
      await requestMagicLink(email.trim(), portal);
      setIsSent(true);
      setCountdown(60); // 60s cooldown for rate limiting
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setErrorCode(err.code);
        setError(err.message);
      } else {
        setError("Failed to send sign-in link. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) return;

    setError(null);
    setErrorCode(undefined);
    setIsSubmitting(true);

    try {
      await registerMember({
        full_name: fullName.trim(),
        email: email.trim(),
        phone: phone.trim() || undefined,
      });
      // Now auto-request magic link
      await requestMagicLink(email.trim(), "member");
      setIsSent(true);
    } catch (err: unknown) {
      if (err instanceof APIClientError) {
        setErrorCode(err.code);
        setError(err.message);
      } else {
        setError("Registration failed. Please check your information.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white shadow-md border border-slate-200 mb-4">
          {portalConfig.icon}
        </div>
        <span
          className={`inline-block px-3 py-1 rounded-full text-xs font-semibold mb-2 border ${portalConfig.badgeClass}`}
        >
          {portalConfig.badge}
        </span>
        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
          {isSigningUp ? "Create Member Account" : portalConfig.title}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {isSigningUp
            ? "Join Skyline Student Association to reserve member-rate tickets and merch."
            : portalConfig.subtitle}
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md px-4 sm:px-0">
        <div className="bg-white py-8 px-6 shadow-xl rounded-2xl sm:px-10 border border-slate-200">
          {error && (
            <div className="mb-6">
              <ErrorBanner message={error} code={errorCode} />
            </div>
          )}

          {isSent ? (
            <div className="text-center py-4">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 mb-4">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-900">Check your email</h3>
              <p className="mt-2 text-sm text-slate-600 leading-relaxed">
                We sent a single-use login link to{" "}
                <span className="font-semibold text-slate-900">{email}</span>.
              </p>
              <div className="mt-4 p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-500">
                The link works once and expires in 15 minutes.
              </div>

              <div className="mt-6 flex flex-col gap-3">
                <button
                  type="button"
                  disabled={countdown > 0 || isSubmitting}
                  onClick={handleSendLink}
                  className="w-full inline-flex justify-center items-center px-4 py-2.5 text-sm font-medium rounded-xl text-slate-700 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 transition"
                >
                  {countdown > 0 ? `Resend available in ${countdown}s` : "Send again"}
                </button>
                <button
                  type="button"
                  onClick={() => setIsSent(false)}
                  className="text-xs text-slate-500 hover:text-slate-900"
                >
                  Change email address
                </button>
              </div>
            </div>
          ) : isSigningUp ? (
            <form onSubmit={handleSignUp} className="space-y-4">
              <div>
                <label htmlFor="name" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Full Name *
                </label>
                <input
                  id="name"
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Alex Morgan"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
                />
              </div>

              <div>
                <label htmlFor="signup-email" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  University Email *
                </label>
                <input
                  id="signup-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@skyline.edu"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Phone Number (Optional)
                </label>
                <input
                  id="phone"
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 disabled:opacity-50 transition shadow-md"
              >
                {isSubmitting ? "Creating Account..." : "Create Account & Sign In"}
                <ArrowRight className="h-4 w-4" />
              </button>

              <div className="pt-3 text-center">
                <button
                  type="button"
                  onClick={() => setIsSigningUp(false)}
                  className="text-xs text-sky-600 hover:text-sky-800 font-medium"
                >
                  Already have an account? Sign in
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSendLink} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Your Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@skyline.edu"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:ring-2 focus:ring-sky-500 focus:border-transparent text-sm"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-900 text-white font-semibold text-sm hover:bg-slate-800 disabled:opacity-50 transition shadow-md"
              >
                {isSubmitting ? "Sending Link..." : "Send me a sign-in link"}
                <ArrowRight className="h-4 w-4" />
              </button>

              <p className="text-xs text-slate-500 text-center leading-relaxed">
                {portalConfig.note}
              </p>

              {portal === "member" && (
                <div className="pt-4 border-t border-slate-100 text-center">
                  <button
                    type="button"
                    onClick={() => setIsSigningUp(true)}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 hover:text-sky-800"
                  >
                    <UserPlus className="h-3.5 w-3.5" />
                    New here? Sign up for membership
                  </button>
                </div>
              )}
            </form>
          )}

          {/* Role portal switcher per D-029 */}
          <div className="mt-6 pt-6 border-t border-slate-100 flex flex-col gap-2 text-center text-xs text-slate-500">
            {portal !== "member" && (
              <p>
                Not an officer?{" "}
                <Link to="/login" className="text-sky-600 hover:underline font-medium">
                  Member sign in
                </Link>
              </p>
            )}
            {portal !== "officer" && (
              <p>
                Elected officer?{" "}
                <Link to="/officer/login" className="text-sky-600 hover:underline font-medium">
                  Officer sign in
                </Link>
              </p>
            )}
            {portal !== "treasurer" && (
              <p>
                Club Treasurer?{" "}
                <Link to="/treasurer/login" className="text-sky-600 hover:underline font-medium">
                  Treasurer sign in
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
