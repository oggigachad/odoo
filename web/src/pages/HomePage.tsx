import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Calendar,
  Ticket,
  ShoppingBag,
  Bell,
  HeartHandshake,
  ShieldCheck,
  ChevronRight,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

interface EventItem {
  id: number;
  title: string;
  start_at: string;
  venue: string;
  seat_limit: number;
  non_member_seat_limit: number;
}

interface AnnouncementItem {
  id: number;
  title: string;
  body: string;
  created_at: string;
  author_name: string;
}

export const HomePage: React.FC = () => {
  const { user, isLoggedIn } = useAuth();
  const [nextEvent, setNextEvent] = useState<EventItem | null>(null);
  const [announcements, setAnnouncements] = useState<AnnouncementItem[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [eventsRes, annRes] = await Promise.all([
          api.get<EventItem[]>("/events"),
          api.get<AnnouncementItem[]>("/announcements?limit=3"),
        ]);
        if (eventsRes && eventsRes.length > 0) {
          setNextEvent(eventsRes[0]);
        }
        if (annRes) {
          setAnnouncements(annRes.slice(0, 3));
        }
      } catch {
        // Fallback or empty states
      }
    };
    fetchData();
  }, []);

  const features = [
    {
      title: "Upcoming Events & Galas",
      desc: "Reserve seats with member pricing, live seat limits, and instant digital QR entry.",
      icon: Calendar,
      tag: "Live Seat Locking",
      link: "/events",
    },
    {
      title: "Club Merchandise",
      desc: "Official hoodies, T-shirts, and accessories with verified stock and non-member quotas.",
      icon: ShoppingBag,
      tag: "Apparel Store",
      link: "/shop",
    },
    {
      title: "Announcements & Updates",
      desc: "Direct bulletin broadcasts and email notifications for club assemblies and galas.",
      icon: Bell,
      tag: "Bulletin",
      link: "/announcements",
    },
    {
      title: "Door Check-In Terminal",
      desc: "Officer verification terminal with atomic double-scan protection and status badges.",
      icon: Ticket,
      tag: "Officer Tool",
      link: "/officer/checkin",
    },
    {
      title: "Treasurer Finance Ledger",
      desc: "Strict audit tracking for dues, gate ticket revenue, and reimbursed expenses.",
      icon: ShieldCheck,
      tag: "Financial Guard",
      link: "/treasurer/dashboard",
    },
    {
      title: "Fundraisers & Initiatives",
      desc: "Transparent campaign milestone tracking, volunteer task boards, and records.",
      icon: HeartHandshake,
      tag: "Community",
      link: "/officer/fundraisers",
    },
  ];

  return (
    <div className="space-y-12 pb-16">
      {/* Membership Status Strip (if signed in per 07_UI_SPECS.md) */}
      {isLoggedIn && user && (
        <section className="bg-slate-900 text-white border-b border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex flex-wrap items-center justify-between gap-3 text-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex h-2.5 w-2.5 rounded-full bg-emerald-400"></span>
              <span className="font-medium text-slate-200">
                Logged in as <strong className="text-white">{user.full_name}</strong>
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {user.roles.length > 0 ? user.roles.join(", ") : "Member"}
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <Link to="/me/membership" className="text-sky-400 hover:text-sky-300 font-medium flex items-center gap-1">
                View Membership Status <ChevronRight className="h-3 w-3" />
              </Link>
            </div>
          </div>
        </section>
      )}

      {/* Hero Section */}
      <section className="relative px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto pt-8">
        <div className="relative rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-950 p-8 sm:p-14 text-white overflow-hidden shadow-2xl border border-slate-800">
          <div className="pointer-events-none absolute -top-24 -right-24 h-96 w-96 rounded-full bg-sky-500/20 blur-3xl" />
          <div className="relative max-w-2xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full bg-sky-500/10 border border-sky-400/20 px-3 py-1 text-xs font-semibold text-sky-300">
              <Sparkles className="h-3.5 w-3.5" />
              Student Organization System • Skyline Student Association
            </div>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
              Everything your student union does, in one place.
            </h1>
            <p className="text-slate-300 text-base sm:text-lg leading-relaxed">
              Ticket booking with live zero-oversell seat holds, official merchandise, semester dues renewal, and transparent financial reporting.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                to="/events"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm transition shadow-lg shadow-sky-500/25"
              >
                Browse Events
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                to="/join"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm backdrop-blur transition border border-white/10"
              >
                Join or Renew Membership
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Next Event Card & Latest Announcements */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Next Event Card */}
          <div className="lg:col-span-1">
            <h2 className="text-lg font-bold text-slate-900 mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-sky-600" />
              Next Upcoming Event
            </h2>
            {nextEvent ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md transition">
                <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-sky-50 text-sky-700 border border-sky-200 mb-3">
                  Seats Available
                </span>
                <h3 className="text-xl font-bold text-slate-900 mb-1">{nextEvent.title}</h3>
                <p className="text-sm text-slate-500 mb-4 flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-slate-400" />
                  {new Date(nextEvent.start_at).toLocaleDateString("en-IN", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
                <p className="text-xs text-slate-600 mb-6 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  Venue: <strong>{nextEvent.venue}</strong>
                </p>
                <Link
                  to={`/events/${nextEvent.id}`}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold transition"
                >
                  View Details & Reserve Seats
                  <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center bg-white text-slate-500 text-sm">
                No upcoming events right now. Check back soon!
              </div>
            )}
          </div>

          {/* Latest 3 Announcements */}
          <div className="lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <Bell className="h-5 w-5 text-indigo-600" />
                Latest Announcements
              </h2>
              <Link to="/announcements" className="text-xs font-semibold text-sky-600 hover:text-sky-800">
                View all &rarr;
              </Link>
            </div>

            <div className="space-y-3">
              {announcements.length > 0 ? (
                announcements.map((item) => (
                  <div
                    key={item.id}
                    className="p-5 rounded-xl border border-slate-200 bg-white shadow-sm hover:border-slate-300 transition"
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <h4 className="font-bold text-base text-slate-900">{item.title}</h4>
                      <span className="text-xs text-slate-400 whitespace-nowrap">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm text-slate-600 line-clamp-2 leading-relaxed">{item.body}</p>
                    <p className="mt-2 text-xs text-slate-400">Posted by {item.author_name}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 p-8 text-center bg-white text-slate-500 text-sm">
                  No announcements posted yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Pillars Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        <h2 className="text-xl font-bold text-slate-900 mb-6">Association Services</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((item, idx) => {
            const Icon = item.icon;
            return (
              <Link
                key={idx}
                to={item.link}
                className="group p-6 rounded-2xl border border-slate-200 bg-white shadow-sm hover:border-sky-500 hover:shadow-md transition duration-200 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="p-3 rounded-xl bg-slate-50 text-slate-800 group-hover:bg-sky-50 group-hover:text-sky-600 transition">
                      <Icon className="h-6 w-6" />
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-600">
                      {item.tag}
                    </span>
                  </div>
                  <h3 className="font-bold text-lg text-slate-900 mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
                <div className="mt-6 flex items-center text-xs font-semibold text-slate-900 group-hover:text-sky-600 transition">
                  Explore <ChevronRight className="h-3.5 w-3.5 ml-1" />
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
};
