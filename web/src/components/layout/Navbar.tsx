import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  Calendar,
  ShoppingBag,
  Bell,
  Ticket,
  User,
  Shield,
  DollarSign,
  Menu,
  X,
  LogOut,
  ChevronDown,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";

export const Navbar: React.FC = () => {
  const { user, isLoggedIn, isOfficer, isTreasurer, logout } = useAuth();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [manageDropdownOpen, setManageDropdownOpen] = useState(false);
  const [myStuffDropdownOpen, setMyStuffDropdownOpen] = useState(false);
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200 bg-white/95 backdrop-blur shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo / Brand */}
          <Link to="/" className="flex items-center space-x-3 group">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 font-bold text-white shadow group-hover:bg-sky-600 transition">
              SS
            </div>
            <div>
              <span className="font-bold text-base tracking-tight text-slate-900 block leading-tight">
                Skyline Student Association
              </span>
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                SOS Portal
              </span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-1 lg:space-x-2">
            <Link
              to="/events"
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                isActive("/events")
                  ? "bg-slate-100 text-slate-900 font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              Events
            </Link>
            <Link
              to="/announcements"
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                isActive("/announcements")
                  ? "bg-slate-100 text-slate-900 font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              Announcements
            </Link>
            <Link
              to="/shop"
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                isActive("/shop")
                  ? "bg-slate-100 text-slate-900 font-semibold"
                  : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
              }`}
            >
              Merch Shop
            </Link>

            {/* My Stuff Dropdown for logged-in members */}
            {isLoggedIn && (
              <div className="relative">
                <button
                  onClick={() => {
                    setMyStuffDropdownOpen(!myStuffDropdownOpen);
                    setManageDropdownOpen(false);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition"
                >
                  <User className="h-4 w-4 text-slate-500" />
                  My Stuff
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>
                {myStuffDropdownOpen && (
                  <div
                    className="absolute right-0 mt-2 w-52 rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-black ring-opacity-5 border border-slate-100 z-50 animate-in fade-in zoom-in-95 duration-100"
                    onMouseLeave={() => setMyStuffDropdownOpen(false)}
                  >
                    <Link
                      to="/me/membership"
                      onClick={() => setMyStuffDropdownOpen(false)}
                      className="block px-3 py-2 text-sm rounded-lg text-slate-700 hover:bg-slate-50"
                    >
                      My Membership & Renewal
                    </Link>
                    <Link
                      to="/me/tickets"
                      onClick={() => setMyStuffDropdownOpen(false)}
                      className="block px-3 py-2 text-sm rounded-lg text-slate-700 hover:bg-slate-50"
                    >
                      My Tickets (QR Codes)
                    </Link>
                    <Link
                      to="/me/orders"
                      onClick={() => setMyStuffDropdownOpen(false)}
                      className="block px-3 py-2 text-sm rounded-lg text-slate-700 hover:bg-slate-50"
                    >
                      My Orders
                    </Link>
                    <Link
                      to="/me/expenses"
                      onClick={() => setMyStuffDropdownOpen(false)}
                      className="block px-3 py-2 text-sm rounded-lg text-slate-700 hover:bg-slate-50"
                    >
                      Submit Expense
                    </Link>
                    <Link
                      to="/me/tasks"
                      onClick={() => setMyStuffDropdownOpen(false)}
                      className="block px-3 py-2 text-sm rounded-lg text-slate-700 hover:bg-slate-50"
                    >
                      My Volunteer Tasks
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Officer Manage Navigation */}
            {(isOfficer || isTreasurer) && (
              <div className="relative">
                <button
                  onClick={() => {
                    setManageDropdownOpen(!manageDropdownOpen);
                    setMyStuffDropdownOpen(false);
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-50 transition"
                >
                  <Shield className="h-4 w-4 text-sky-600" />
                  Manage
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
                </button>
                {manageDropdownOpen && (
                  <div
                    className="absolute right-0 mt-2 w-56 rounded-xl bg-white p-1.5 shadow-lg ring-1 ring-black ring-opacity-5 border border-slate-100 z-50 animate-in fade-in zoom-in-95 duration-100"
                    onMouseLeave={() => setManageDropdownOpen(false)}
                  >
                    <Link
                      to="/officer/checkin"
                      onClick={() => setManageDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg text-sky-700 hover:bg-sky-50"
                    >
                      <Ticket className="h-4 w-4" />
                      Door Check-In Terminal
                    </Link>
                    <Link
                      to="/officer/verify"
                      onClick={() => setManageDropdownOpen(false)}
                      className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg text-slate-700 hover:bg-slate-50"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      Verify Member (MEM-4)
                    </Link>
                    <Link
                      to="/officer/members"
                      onClick={() => setManageDropdownOpen(false)}
                      className="block px-3 py-2 text-sm rounded-lg text-slate-700 hover:bg-slate-50"
                    >
                      Members Directory & Cash Dues
                    </Link>
                    <Link
                      to="/officer/semesters"
                      onClick={() => setManageDropdownOpen(false)}
                      className="block px-3 py-2 text-sm rounded-lg text-slate-700 hover:bg-slate-50"
                    >
                      Semesters & Dues Types
                    </Link>
                    <Link
                      to="/officer/events"
                      onClick={() => setManageDropdownOpen(false)}
                      className="block px-3 py-2 text-sm rounded-lg text-slate-700 hover:bg-slate-50"
                    >
                      Events & Ticket Manager
                    </Link>
                    <Link
                      to="/officer/announcements"
                      onClick={() => setManageDropdownOpen(false)}
                      className="block px-3 py-2 text-sm rounded-lg text-slate-700 hover:bg-slate-50"
                    >
                      Announcement Composer
                    </Link>
                    <Link
                      to="/officer/shop"
                      onClick={() => setManageDropdownOpen(false)}
                      className="block px-3 py-2 text-sm rounded-lg text-slate-700 hover:bg-slate-50"
                    >
                      Shop Stock & Orders
                    </Link>
                    <Link
                      to="/officer/fundraisers"
                      onClick={() => setManageDropdownOpen(false)}
                      className="block px-3 py-2 text-sm rounded-lg text-slate-700 hover:bg-slate-50"
                    >
                      Fundraiser Task Board
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* Treasurer Dashboard Link */}
            {isTreasurer && (
              <Link
                to="/treasurer/dashboard"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition ${
                  location.pathname.startsWith("/treasurer")
                    ? "bg-emerald-50 text-emerald-800"
                    : "text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                <DollarSign className="h-4 w-4" />
                Treasurer
              </Link>
            )}

            {/* Auth CTA / User Avatar */}
            {isLoggedIn ? (
              <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
                <span className="text-xs text-slate-500 max-w-[120px] truncate" title={user?.full_name}>
                  {user?.full_name}
                </span>
                <button
                  onClick={() => logout()}
                  title="Sign out"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition"
                  aria-label="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2 pl-2">
                <Link
                  to="/login"
                  className="px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 transition shadow-sm"
                >
                  Sign In
                </Link>
              </div>
            )}
          </nav>

          {/* Mobile menu button */}
          <div className="flex md:hidden items-center">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-slate-200 bg-white px-4 pt-3 pb-6 space-y-2">
          <Link
            to="/events"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-medium text-slate-800 hover:bg-slate-50"
          >
            <Calendar className="h-5 w-5 text-slate-500" />
            Events & Tickets
          </Link>
          <Link
            to="/announcements"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-medium text-slate-800 hover:bg-slate-50"
          >
            <Bell className="h-5 w-5 text-slate-500" />
            Announcements
          </Link>
          <Link
            to="/shop"
            onClick={() => setMobileMenuOpen(false)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-base font-medium text-slate-800 hover:bg-slate-50"
          >
            <ShoppingBag className="h-5 w-5 text-slate-500" />
            Merchandise Shop
          </Link>

          {isLoggedIn ? (
            <>
              <div className="pt-2 pb-1 border-t border-slate-100 text-xs font-semibold text-slate-400 uppercase tracking-wider px-3">
                My Stuff
              </div>
              <Link
                to="/me/membership"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
              >
                My Membership & Renewal
              </Link>
              <Link
                to="/me/tickets"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
              >
                My Tickets (QR Codes)
              </Link>
              <Link
                to="/me/orders"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
              >
                My Merch Orders
              </Link>
              <Link
                to="/me/expenses"
                onClick={() => setMobileMenuOpen(false)}
                className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
              >
                Submit Expense
              </Link>

              {(isOfficer || isTreasurer) && (
                <>
                  <div className="pt-3 pb-1 border-t border-slate-100 text-xs font-semibold text-sky-600 uppercase tracking-wider px-3">
                    Officer Tools
                  </div>
                  <Link
                    to="/officer/checkin"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 rounded-lg text-sm font-semibold text-sky-700 bg-sky-50 hover:bg-sky-100"
                  >
                    Door Check-In Terminal
                  </Link>
                  <Link
                    to="/officer/verify"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Verify Member (MEM-4)
                  </Link>
                  <Link
                    to="/officer/members"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Members & Cash Dues
                  </Link>
                  <Link
                    to="/officer/events"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Event Manager
                  </Link>
                  <Link
                    to="/officer/semesters"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Semesters & Dues
                  </Link>
                  <Link
                    to="/officer/shop"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Shop Manager
                  </Link>
                </>
              )}

              {isTreasurer && (
                <>
                  <div className="pt-3 pb-1 border-t border-slate-100 text-xs font-semibold text-emerald-600 uppercase tracking-wider px-3">
                    Treasurer
                  </div>
                  <Link
                    to="/treasurer/dashboard"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 rounded-lg text-sm font-medium text-emerald-800 bg-emerald-50"
                  >
                    Dashboard & Ledger
                  </Link>
                  <Link
                    to="/treasurer/expenses"
                    onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-2 rounded-lg text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Review Expense Queue
                  </Link>
                </>
              )}

              <div className="pt-3 border-t border-slate-100">
                <button
                  onClick={() => {
                    setMobileMenuOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 text-sm font-medium"
                >
                  <LogOut className="h-4 w-4" />
                  Sign Out ({user?.email})
                </button>
              </div>
            </>
          ) : (
            <div className="pt-4 border-t border-slate-100 flex flex-col gap-2">
              <Link
                to="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="w-full text-center px-4 py-2.5 rounded-lg bg-slate-900 text-white font-medium text-sm"
              >
                Member Sign In
              </Link>
              <div className="flex justify-around text-xs text-slate-500 pt-2">
                <Link to="/officer/login" onClick={() => setMobileMenuOpen(false)}>
                  Officer Portal
                </Link>
                <span>•</span>
                <Link to="/treasurer/login" onClick={() => setMobileMenuOpen(false)}>
                  Treasurer Portal
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
