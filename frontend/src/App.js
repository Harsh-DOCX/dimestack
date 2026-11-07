import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout, PublicLayout, RequireAuth } from './components/Layouts';
import { About, Home, NotFound, Privacy, SearchPage, Security } from './pages/PublicPages';
import { Forgot, Login, Register, Reset, Verify } from './pages/AuthPages';
import { Dashboard } from './pages/Dashboard';
import { Transactions } from './pages/Transactions';
import { Budgets, Categories, Goals, Recurring } from './pages/Planning';
import { Ledgers, NetWorth, Reports } from './pages/Wealth';
import { Profile, Sessions } from './pages/AccountPages';

export default function App() {
  return (
    <Routes>
      <Route element={<PublicLayout />}>
        <Route path="/" element={<Home />} />
        <Route path="/about" element={<About />} />
        <Route path="/privacy" element={<Privacy />} />
        <Route path="/security" element={<Security />} />
        <Route path="/search" element={<SearchPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<Forgot />} />
        <Route path="/reset-password" element={<Reset />} />
        <Route path="/verify-email" element={<Verify />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route element={<RequireAuth />}>
        <Route element={<AppLayout />}>
          <Route path="/app" element={<Dashboard />} />
          <Route path="/app/ledgers" element={<Ledgers />} />
          <Route path="/app/transactions" element={<Transactions />} />
          <Route path="/app/budgets" element={<Budgets />} />
          <Route path="/app/recurring" element={<Recurring />} />
          <Route path="/app/goals" element={<Goals />} />
          <Route path="/app/net-worth" element={<NetWorth />} />
          <Route path="/app/reports" element={<Reports />} />
          <Route path="/app/categories" element={<Categories />} />
          <Route path="/app/profile" element={<Profile />} />
          <Route path="/app/sessions" element={<Sessions />} />
          <Route path="/app/*" element={<Navigate to="/app" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
