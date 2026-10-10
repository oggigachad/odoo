import React from "react";
import { Link } from "react-router-dom";

export const Footer: React.FC = () => {
  return (
    <footer className="border-t border-slate-200 bg-white text-slate-600 mt-auto py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-2">
            <div className="flex items-center space-x-3 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 font-bold text-white text-xs">
                SS
              </div>
              <span className="font-bold text-slate-900">Skyline Student Association</span>
            </div>
            <p className="text-sm text-slate-500 max-w-sm mb-4 leading-relaxed">
              Student Organization System (SOS). Official member services, event ticket issuance, merch store, and audited financial treasury.
            </p>
            <p className="text-xs text-slate-400">
              © {new Date().getFullYear()} Skyline Student Association. All rights reserved.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 mb-3">
              Portals & Sign In
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/login" className="hover:text-slate-900 transition">
                  Member Sign In & Sign Up
                </Link>
              </li>
              <li>
                <Link to="/officer/login" className="hover:text-slate-900 transition">
                  Officer Sign In
                </Link>
              </li>
              <li>
                <Link to="/treasurer/login" className="hover:text-slate-900 transition">
                  Treasurer Sign In
                </Link>
              </li>
              <li>
                <Link to="/join" className="hover:text-slate-900 transition">
                  Join or Renew Membership
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-900 mb-3">
              Explore
            </h3>
            <ul className="space-y-2 text-sm">
              <li>
                <Link to="/events" className="hover:text-slate-900 transition">
                  Upcoming Events & Galas
                </Link>
              </li>
              <li>
                <Link to="/announcements" className="hover:text-slate-900 transition">
                  Bulletin & Announcements
                </Link>
              </li>
              <li>
                <Link to="/shop" className="hover:text-slate-900 transition">
                  Apparel & Merch Store
                </Link>
              </li>
              <li>
                <Link to="/officer/checkin" className="hover:text-slate-900 transition">
                  Door Check-In Terminal
                </Link>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
};
