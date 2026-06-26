import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthLayout from './components/AuthLayout';
import RegistrationLayout from './components/RegistrationLayout';
import GlobalPopup from './components/GlobalPopup';

import Login from './pages/auth/Login';
import ForgotPassword from './pages/auth/ForgotPassword';
import ResetPassword from './pages/auth/ResetPassword';
import RegisterStep1 from './pages/registration/RegisterStep1';
import RegisterStep2 from './pages/registration/RegisterStep2';
import RegisterStep3 from './pages/registration/RegisterStep3';
import RegisterStep4 from './pages/registration/RegisterStep4';
import RegisterStep5 from './pages/registration/RegisterStep5';
import UnderReview from './pages/registration/UnderReview';
import ActivateMembership from './pages/registration/ActivateMembership';
import PaymentSuccess from './pages/registration/PaymentSuccess';

import DashboardLayout from './components/DashboardLayout';
import DashboardIndex from './components/DashboardIndex';
import DashboardHome from './pages/member/DashboardHome';
import MyProfile from './pages/member/MyProfile';
import MySaving from './pages/member/MySaving';
import TermsAndConditions from './pages/member/TermsAndConditions';
import MyLoans from './pages/member/MyLoans';
import LoanApplication from './pages/member/LoanApplication';
import LoanDetails from './pages/member/LoanDetails';

import AdminDashboard from './pages/admin/AdminDashboard';
import MemberManagement from './pages/admin/MemberManagement';
import MemberApprovals from './pages/admin/MemberApprovals';
import ApprovalDetail from './pages/admin/ApprovalDetail';
import MemberDetail from './pages/admin/MemberDetail';
import CloseAccountDetail from './pages/admin/CloseAccountDetail';
import TransactionHistory from './pages/admin/TransactionHistory';
import ManualPayment from './pages/admin/ManualPayment';
import DocumentArchives from './pages/admin/DocumentArchives';
import PayrollLoans from './pages/admin/PayrollLoans';
import PayrollSavings from './pages/admin/PayrollSavings';
import SHUDashboard from './pages/admin/SHUDashboard';
import SHUIncomeTransaction from './pages/admin/SHUIncomeTransaction';
import SHUOutcomeTransaction from './pages/admin/SHUOutcomeTransaction';
import SHUMasterData from './pages/admin/SHUMasterData';
import AdminLoansDashboard from './pages/admin/AdminLoansDashboard';
import AdminPendingApprovals from './pages/admin/AdminPendingApprovals';
import AdminLoanDetail from './pages/admin/AdminLoanDetail';
import AdminActiveLoanDetail from './pages/admin/AdminActiveLoanDetail';

import SavingsDashboard from './pages/admin/SavingsDashboard';
import SavingsManagement  from './pages/admin/SavingsManagement';
import MandatorySavings from './pages/admin/MandatorySavings';
import VoluntarySavings from  './pages/admin/VoluntarySavings';
import WithdrawalRequests from "./pages/admin/WithdrawalRequests";
import WithdrawalRequestDetail from "./pages/admin/WithdrawalRequestsDetail";
import WhatsAppSettings from './pages/admin/WhatsAppSettings';
function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Auth Routes */}
        <Route element={<AuthLayout />}>
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route path="/" element={<Navigate to="/login" replace />} />
        </Route>

        {/* Registration Routes */}
        <Route path="/register" element={<RegistrationLayout />}>
          <Route path="step-1" element={<RegisterStep1 />} />
          <Route path="step-2" element={<RegisterStep2 />} />
          <Route path="step-3" element={<RegisterStep3 />} />
          <Route path="step-4" element={<RegisterStep4 />} />
          <Route path="step-5" element={<RegisterStep5 />} />
          <Route path="under-review" element={<UnderReview />} />
          <Route path="activate-membership" element={<ActivateMembership />} />
          <Route path="payment-success" element={<PaymentSuccess />} />
          <Route index element={<Navigate to="step-1" replace />} />
        </Route>

        {/* Dashboard Routes */}
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardIndex />} />
          <Route path="profile" element={<MyProfile />} />
          <Route path="saving" element={<MySaving />} />
          <Route path="terms" element={<TermsAndConditions />} />
          <Route path="loans" element={<MyLoans />} />
          <Route path="loans/application" element={<LoanApplication />} />
          <Route path="loans/:id" element={<LoanDetails />} />
          
          {/* Admin Pages */}
          <Route path="admin" element={<AdminDashboard />} />
          <Route path="admin/ls-loans" element={<AdminLoansDashboard />} />
          <Route path="admin/ls-loans/pending" element={<AdminPendingApprovals />} />
          <Route path="admin/ls-loans/:id" element={<AdminLoanDetail />} />
          <Route path="admin/ls-loans/active/:id" element={<AdminActiveLoanDetail />} />
          <Route path="admin/members" element={<MemberManagement />} />
          <Route path="admin/members/:id" element={<MemberDetail />} />
          <Route path="admin/approvals" element={<MemberApprovals />} />
          <Route path="admin/approvals/:id" element={<ApprovalDetail />} />
          <Route path="admin/approvals/close/:id" element={<CloseAccountDetail />} />
          <Route path="admin/transaction/history" element={<TransactionHistory />} />
          <Route path="admin/transaction/manual" element={<ManualPayment />} />
          <Route path="admin/archives" element={<DocumentArchives />} />
          <Route path="admin/whatsapp-settings" element={<WhatsAppSettings />} />
          <Route path="admin/pr-loans" element={<PayrollLoans />} />
          <Route path="admin/pr-savings" element={<PayrollSavings />} />
          <Route path="admin/shu-dashboard" element={<SHUDashboard />} />
          <Route path="admin/shu-income" element={<SHUIncomeTransaction />} />
          <Route path="admin/shu-outcome" element={<SHUOutcomeTransaction />} />
          <Route path="admin/shu-master" element={<SHUMasterData />} />
          <Route path="admin/ls-savings" element={<SavingsDashboard />} />
          <Route path="admin/savings-management" element={<SavingsManagement />} />
          <Route path="admin/mandatory-savings" element={<MandatorySavings />} />
          <Route path="admin/voluntary-savings" element={<VoluntarySavings />} />
          <Route path="admin/withdrawal-requests" element={<WithdrawalRequests />} />
          <Route path="admin/withdrawal-requests/:id" element={<WithdrawalRequestDetail />} />
        </Route>
      </Routes>
      <GlobalPopup />
    </BrowserRouter>
  );
}

export default App;
