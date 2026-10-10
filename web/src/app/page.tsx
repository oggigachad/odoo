import Link from "next/link";
import {
  Calendar,
  Ticket,
  ShoppingBag,
  Bell,
  HeartHandshake,
  Users,
  ShieldCheck,
  ChevronRight,
} from "lucide-react";

export default function HomePage() {
  const features = [
    {
      title: "Upcoming Events & Tickets",
      desc: "Reserve tickets with member pricing, live seat limits, and instant digital QR entry.",
      icon: Calendar,
      tag: "Live Seat Locking",
    },
    {
      title: "Club Merchandise",
      desc: "Official hoodies, T-shirts, and apparel with verified size stock tracking.",
      icon: ShoppingBag,
      tag: "Member Rates",
    },
    {
      title: "Announcements & Updates",
      desc: "Direct bulletin broadcasts and email notifications for club assemblies and galas.",
      icon: Bell,
      tag: "All Members",
    },
    {
      title: "Fundraisers & Initiatives",
      desc: "Transparent campaign milestone tracking, volunteer task boards, and records.",
      icon: HeartHandshake,
      tag: "Goal Metrics",
    },
    {
      title: "Fast Door Check-In",
      desc: "Officer verification terminal with atomic double-scan protection and status badges.",
      icon: Ticket,
      tag: "Officer Tool",
    },
    {
      title: "Treasurer Finance Ledger",
      desc: "Strict audit tracking for dues, gate ticket revenue, and reimbursed expenses.",
      icon: ShieldCheck,
      tag: "Financial Guard",
    },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-slate-950 px-6 py-12 md:px-16 lg:px-24">
      {/* Ambient background glow */}
      <div className="pointer-events-none absolute -top-40 -left-40 h-96 w-96 rounded-full bg-indigo-600/20 blur-[128px]" />
      <div className="pointer-events-none absolute top-1/2 -right-40 h-96 w-96 rounded-full bg-cyan-600/20 blur-[128px]" />

      <header className="relative mx-auto flex max-w-6xl items-center justify-between pb-12 border-b border-slate-800/80">
        <div className="flex items-center space-x-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-indigo-500 to-cyan-400 font-bold text-white shadow-lg shadow-indigo-500/25">
            SSA
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">Skyline Student Association</h1>
            <p className="text-xs text-slate-400">Student Organization System (SOS)</p>
          </div>
        </div>

        <nav className="flex items-center space-x-4">
          <Link
            href="/events"
            className="hidden sm:inline-flex text-sm text-slate-300 hover:text-white transition"
          >
            Events
          </Link>
          <Link
            href="/merch"
            className="hidden sm:inline-flex text-sm text-slate-300 hover:text-white transition"
          >
            Merchandise
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-indigo-600/30 hover:bg-indigo-500 transition"
          >
            Member Sign In
          </Link>
        </nav>
      </header>

      {/* Hero Section */}
      <section className="relative mx-auto max-w-4xl pt-16 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-4 py-1.5 text-xs font-medium text-indigo-300 backdrop-blur-md">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
          Active Semester Operations • Year 2026-27
        </div>
        <h2 className="mt-6 text-4xl font-extrabold tracking-tight text-white sm:text-6xl sm:leading-tight">
          Everything your student union does,{" "}
          <span className="bg-gradient-to-r from-indigo-400 via-sky-300 to-cyan-400 bg-clip-text text-transparent">
            in one seamless place.
          </span>
        </h2>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-400 leading-relaxed">
          From verified event tickets with door scanning to dues payment, annual membership renewals, and real-time financial tracking for the treasurer.
        </p>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/join"
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-500 to-cyan-500 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-indigo-500/25 hover:opacity-95 transition"
          >
            Join the Association
            <ChevronRight className="h-4 w-4" />
          </Link>
          <Link
            href="/checkin"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-900/60 px-6 py-3.5 text-sm font-semibold text-slate-200 backdrop-blur-md hover:bg-slate-800 transition"
          >
            Door Check-In Terminal
          </Link>
        </div>
      </section>

      {/* Grid of system pillars */}
      <section className="relative mx-auto mt-24 max-w-6xl">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {features.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={idx}
                className="group relative rounded-2xl border border-slate-800 bg-slate-900/40 p-6 backdrop-blur-md transition-all duration-300 hover:border-indigo-500/50 hover:bg-slate-900/80 hover:shadow-xl hover:shadow-indigo-500/10"
              >
                <div className="flex items-center justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-800 text-indigo-400 group-hover:bg-indigo-600 group-hover:text-white transition-colors duration-300">
                    <Icon className="h-6 w-6" />
                  </div>
                  <span className="rounded-full bg-slate-800/80 px-2.5 py-0.5 text-xs font-medium text-slate-400">
                    {item.tag}
                  </span>
                </div>
                <h3 className="mt-5 text-lg font-semibold text-white">{item.title}</h3>
                <p className="mt-2 text-sm text-slate-400 leading-relaxed">{item.desc}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Footer */}
      <footer className="relative mx-auto mt-24 max-w-6xl border-t border-slate-800/80 pt-8 text-center text-xs text-slate-500">
        <p>© 2026 Skyline Student Association • Built strictly following Master Rules & Architecture</p>
      </footer>
    </main>
  );
}
