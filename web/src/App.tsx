import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { Layout } from "./components/layout/Layout";
import { RequireRole } from "./components/common/RequireRole";

// Public & Auth Pages
import { HomePage } from "./pages/HomePage";
import { LoginPage } from "./pages/auth/LoginPage";
import { AuthCallbackPage } from "./pages/auth/AuthCallbackPage";
import { NoAccessPage } from "./pages/NoAccessPage";

// Events & Tickets
import { EventsListPage } from "./pages/events/EventsListPage";
import { EventDetailPage } from "./pages/events/EventDetailPage";
import { PaymentStatusPage } from "./pages/events/PaymentStatusPage";
import { MyTicketsPage } from "./pages/members/MyTicketsPage";

// Shop & Merch
import { ShopPage } from "./pages/shop/ShopPage";
import { CartCheckoutPage } from "./pages/shop/CartCheckoutPage";
import { MyOrdersPage } from "./pages/members/MyOrdersPage";

// Announcements
import { AnnouncementsPage } from "./pages/announcements/AnnouncementsPage";

// Members & Renewals
import { JoinRenewPage } from "./pages/members/JoinRenewPage";
import { MyMembershipPage } from "./pages/members/MyMembershipPage";
import { MyExpensesPage } from "./pages/members/MyExpensesPage";
import { MyTasksPage } from "./pages/members/MyTasksPage";

// Officer Tools
import { DoorCheckInPage } from "./pages/officer/DoorCheckInPage";
import { VerifyMemberPage } from "./pages/officer/VerifyMemberPage";
import { MembersManagerPage } from "./pages/officer/MembersManagerPage";
import { SemestersManagerPage } from "./pages/officer/SemestersManagerPage";
import { EventManagerPage } from "./pages/officer/EventManagerPage";
import { AnnouncementComposerPage } from "./pages/officer/AnnouncementComposerPage";
import { ShopManagerPage } from "./pages/officer/ShopManagerPage";
import { FundraiserBoardPage } from "./pages/officer/FundraiserBoardPage";

// Treasurer Portal
import { TreasurerDashboardPage } from "./pages/treasurer/TreasurerDashboardPage";
import { ExpenseQueuePage } from "./pages/treasurer/ExpenseQueuePage";

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            {/* Public Pages */}
            <Route path="/" element={<HomePage />} />
            <Route path="/events" element={<EventsListPage />} />
            <Route path="/events/:id" element={<EventDetailPage />} />
            <Route path="/payment/status" element={<PaymentStatusPage />} />
            <Route path="/shop" element={<ShopPage />} />
            <Route path="/shop/checkout" element={<CartCheckoutPage />} />
            <Route path="/announcements" element={<AnnouncementsPage />} />
            <Route path="/join" element={<JoinRenewPage />} />

            {/* Auth Pages by Role per D-029 */}
            <Route path="/login" element={<LoginPage portal="member" />} />
            <Route path="/officer/login" element={<LoginPage portal="officer" />} />
            <Route path="/treasurer/login" element={<LoginPage portal="treasurer" />} />
            <Route path="/auth/callback" element={<AuthCallbackPage />} />
            <Route path="/no-access" element={<NoAccessPage />} />

            {/* Member Protected Routes (My Stuff) */}
            <Route
              path="/me/membership"
              element={
                <RequireRole role="member">
                  <MyMembershipPage />
                </RequireRole>
              }
            />
            <Route
              path="/me/tickets"
              element={
                <RequireRole role="member">
                  <MyTicketsPage />
                </RequireRole>
              }
            />
            <Route
              path="/me/orders"
              element={
                <RequireRole role="member">
                  <MyOrdersPage />
                </RequireRole>
              }
            />
            <Route
              path="/me/expenses"
              element={
                <RequireRole role="member">
                  <MyExpensesPage />
                </RequireRole>
              }
            />
            <Route
              path="/me/tasks"
              element={
                <RequireRole role="member">
                  <MyTasksPage />
                </RequireRole>
              }
            />

            {/* Officer Protected Routes */}
            <Route
              path="/officer/checkin"
              element={
                <RequireRole role="officer">
                  <DoorCheckInPage />
                </RequireRole>
              }
            />
            <Route
              path="/officer/verify"
              element={
                <RequireRole role="officer">
                  <VerifyMemberPage />
                </RequireRole>
              }
            />
            <Route
              path="/officer/members"
              element={
                <RequireRole role="officer">
                  <MembersManagerPage />
                </RequireRole>
              }
            />
            <Route
              path="/officer/semesters"
              element={
                <RequireRole role="officer">
                  <SemestersManagerPage />
                </RequireRole>
              }
            />
            <Route
              path="/officer/events"
              element={
                <RequireRole role="officer">
                  <EventManagerPage />
                </RequireRole>
              }
            />
            <Route
              path="/officer/announcements"
              element={
                <RequireRole role="officer">
                  <AnnouncementComposerPage />
                </RequireRole>
              }
            />
            <Route
              path="/officer/shop"
              element={
                <RequireRole role="officer">
                  <ShopManagerPage />
                </RequireRole>
              }
            />
            <Route
              path="/officer/fundraisers"
              element={
                <RequireRole role="officer">
                  <FundraiserBoardPage />
                </RequireRole>
              }
            />

            {/* Treasurer Protected Routes */}
            <Route
              path="/treasurer/dashboard"
              element={
                <RequireRole role="treasurer">
                  <TreasurerDashboardPage />
                </RequireRole>
              }
            />
            <Route
              path="/treasurer/expenses"
              element={
                <RequireRole role="treasurer">
                  <ExpenseQueuePage />
                </RequireRole>
              }
            />
            <Route path="/treasurer" element={<Navigate to="/treasurer/dashboard" replace />} />

            {/* Catch-all fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
};

export default App;
