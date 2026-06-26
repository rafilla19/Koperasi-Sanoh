import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Info, ChevronRight, Loader } from 'lucide-react';
import { apiUrl } from '../../services/api';
import './MyLoans.css';

const ViewDetailsButton = ({ loanId, navigate }) => {
  const [loading, setLoading] = useState(false);
  return (
    <button
      className="btn-view-details"
      disabled={loading}
      onClick={() => {
        if (loading) return;
        setLoading(true);
        navigate(`/dashboard/loans/${loanId}`);
      }}
    >
      {loading ? <><Loader size={14} className="spinner" /> Loading...</> : 'View Details'}
    </button>
  );
};

const MyLoans = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('active');
  const [hasActiveLoan, setHasActiveLoan] = useState(false);
  const [hasPendingLoan, setHasPendingLoan] = useState(false);
  const [totalOutstanding, setTotalOutstanding] = useState(0);
  const [nextDeduction, setNextDeduction] = useState('-');
  const [showAutoDeductBanner, setShowAutoDeductBanner] = useState(false);
  const [loansData, setLoansData] = useState({
    active: [],
    completed: [],
    pending: [],
    rejected: []
  });
  const [hasPendingClosure, setHasPendingClosure] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      // Get member_id from user in localStorage
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const memberId = user?.member_id || 1;

      try {
        const response = await fetch(apiUrl(`/loan/loan-applications/?member_id=${memberId}`));
        if (response.ok) {
          const data = await response.json();
        }

        const summaryResponse = await fetch(apiUrl(`/loan/loans/dashboard_summary/?member_id=${memberId}`));
        if (summaryResponse.ok) {
          const summaryData = await summaryResponse.json();
          setHasActiveLoan(summaryData.has_active_loan);
        }

        const loanResponse = await fetch(apiUrl(`/loan/loans/?member_id=${memberId}`));
        if (loanResponse.ok) {
          const loanData = await loanResponse.json();
          const activeLoans = loanData.filter(loan => Number(loan.member_id) === Number(memberId) && (loan.status_id === 25 || loan.status === 25));
          
          const outstanding = activeLoans
            .filter(loan => parseFloat(loan.remaining_balance) !== 0)
            .reduce((sum, loan) => sum + parseFloat(loan.remaining_balance), 0);
          setTotalOutstanding(outstanding);

          // Get due_date from the active loan
          if (activeLoans.length > 0) {
            const sortedLoans = [...activeLoans].sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
            if (sortedLoans[0].due_date) {
              const nextDate = new Date(sortedLoans[0].due_date);
              const formattedDate = nextDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              setNextDeduction(formattedDate);
            } else {
              setNextDeduction('-');
            }
          } else {
            setNextDeduction('-');
          }
        }

        const activeSummaryResponse = await fetch(apiUrl(`/loan/loans/active_summary/?member_id=${memberId}`));
        if (activeSummaryResponse.ok) {
          const activeSummary = await activeSummaryResponse.json();
          const activeLoansFormatted = activeSummary.map(item => ({
            id: `#${item.loan_id}`,
            type: item.type_name || 'Pinjaman',
            status: 'Active',
            totalBorrowed: formatRupiah(item.principal_amount),
            remaining: formatRupiah(item.remaining_balance),
            purpose: item.purpose,
            bunga: `${parseFloat(item.bunga || 0).toFixed(1).replace('.', ',')}%`,
            progress: item.total_installment > 0 ? Math.round((item.paid_installment / item.total_installment) * 100) : 0,
            installmentsPaid: item.paid_installment || 0,
            totalInstallments: item.total_installment || 0,
            nextDeduction: item.next_installment_balance ? formatRupiah(item.next_installment_balance) : '-',
          }));
          setLoansData(prev => ({ ...prev, active: activeLoansFormatted }));
        }

        const completedSummaryResponse = await fetch(apiUrl(`/loan/loans/completed_summary/?member_id=${memberId}`));
        if (completedSummaryResponse.ok) {
          const completedSummary = await completedSummaryResponse.json();
          const completedLoansFormatted = completedSummary.map(item => ({
            id: `#${item.loan_id}`,
            type: item.type_name || 'Pinjaman',
            status: 'Completed',
            totalBorrowed: formatRupiah(item.principal_amount),
            remaining: formatRupiah(item.remaining_balance),
            purpose: item.purpose,
            bunga: `${parseFloat(item.bunga || 0).toFixed(1).replace('.', ',')}%`,
            progress: item.total_installment > 0 ? Math.round((item.paid_installment / item.total_installment) * 100) : 0,
            installmentsPaid: item.paid_installment || 0,
            totalInstallments: item.total_installment || 0,
            nextDeduction: item.next_installment_balance ? formatRupiah(item.next_installment_balance) : '-',
          }));
          setLoansData(prev => ({ ...prev, completed: completedLoansFormatted }));
        }

        const pendingSummaryResponse = await fetch(apiUrl(`/loan/loan-applications/pending_summary/?member_id=${memberId}`));
        if (pendingSummaryResponse.ok) {
          const pendingSummary = await pendingSummaryResponse.json();
          setHasPendingLoan((pendingSummary || []).length > 0);
          const pendingLoansFormatted = pendingSummary.map(item => ({
            id: `#${item.id}`,
            type: item.type_name || 'Pinjaman',
            status: item.status_code || 'Pending',
            totalBorrowed: formatRupiah(item.amount_requested),
            remaining: formatRupiah(item.amount_requested),
            interestEstimate: formatRupiah(item.amount_requested * 0.005),
            purpose: item.purpose,
            bunga: '0,5%',
            progress: 0,
            installmentsPaid: 0,
            totalInstallments: item.duration_months || 0,
            appliedAt: new Date(item.applied_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
            nextDeduction: '-',
          }));
          setLoansData(prev => ({ ...prev, pending: pendingLoansFormatted }));
        }

        const rejectedSummaryResponse = await fetch(apiUrl(`/loan/loan-applications/rejected_summary/?member_id=${memberId}`));
        if (rejectedSummaryResponse.ok) {
          const rejectedSummary = await rejectedSummaryResponse.json();
          const rejectedLoansFormatted = rejectedSummary.map(item => ({
            id: `#${item.id}`,
            type: item.type_name || 'Pinjaman',
            status: 'Rejected',
            totalBorrowed: formatRupiah(item.amount_requested),
            appliedAt: new Date(item.applied_at).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
            dateRejected: new Date(item.admin_update).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' }),
            purpose: item.purpose,
            rejectReason: item.reject_reason || '-',
            progress: 0,
            installmentsPaid: 0,
            totalInstallments: item.duration_months || 0,
            nextDeduction: '-',
          }));
          setLoansData(prev => ({ ...prev, rejected: rejectedLoansFormatted }));
        }

        const memberResponse = await fetch(apiUrl('/member/members/'));
        if (memberResponse.ok) {
          const memberData = await memberResponse.json();
          const currentMember = memberData.find(m => m.id === memberId);
          if (currentMember) {
            const empStatus = currentMember.employee_status_id;
            if (empStatus === 1 || empStatus === 2) {
              setShowAutoDeductBanner(true);
            }
          }
        }

        const profileResponse = await fetch(apiUrl(`/member/members/profile_detail/?member_id=${memberId}`));
        if (profileResponse.ok) {
          const profileData = await profileResponse.json();
          setHasPendingClosure(profileData.has_pending_closure || false);
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      }
    };

    fetchData();
  }, []);

  const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(number).replace(',00', '');
  };

  const handleApplyLoan = () => {
    if (isNavigating) return;
    if (hasPendingClosure) {
      alert('Anda tidak dapat mengajukan pinjaman baru karena akun Anda dalam proses penutupan.');
    } else if (hasPendingLoan) {
      alert('Anda tidak dapat mengajukan pinjaman baru karena masih ada pengajuan pinjaman yang menunggu persetujuan.');
    } else if (hasActiveLoan) {
      alert('Anda tidak dapat mengajukan pinjaman baru karena masih ada pinjaman yang aktif.');
    } else {
      setIsNavigating(true);
      navigate('/dashboard/loans/application');
    }
  };

  const tabs = [
    { id: 'active', label: 'Active Loans' },
    { id: 'completed', label: 'Completed' },
    { id: 'pending', label: 'Pending' },
    { id: 'rejected', label: 'Rejected' },
  ];

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'active': return 'status-active';
      case 'completed': return 'status-completed';
      case 'submitted': return 'status-pending';
      case 'rejected': return 'status-rejected';
      default: return '';
    }
  };

  return (
    <div className="ml-page">
      <div className="ml-header-section">
        <div className="ml-header-text">
          <h1>Loan Overview</h1>
          <p>Overview active loans, repayment progress, and payroll deduction</p>
        </div>
        <button
          className="btn-apply-loan"
          onClick={handleApplyLoan}
          disabled={hasActiveLoan || hasPendingLoan || hasPendingClosure || isNavigating}
          style={(hasActiveLoan || hasPendingLoan || hasPendingClosure) ? {
            background: '#94a3b8',
            cursor: 'not-allowed',
            color: '#f1f5f9'
          } : {}}
        >
          {isNavigating ? <><Loader size={16} className="spinner" /> Loading...</> : <><Plus size={16} strokeWidth={2.5} /> Apply for a New Loan</>}
        </button>
      </div>

      <div className="ml-overview-cards">
        <div className="ml-ov-card">
          <div className="ml-ov-label">TOTAL OUTSTANDING BALANCE</div>
          <div className="ml-ov-value">{formatRupiah(totalOutstanding)}</div>
          {/* <div className="ml-ov-badge up">
            <ChevronRight size={12} strokeWidth={3} style={{ transform: 'rotate(-45deg)' }} />
            Increased by 5% this month
          </div> */}
        </div>
        <div className="ml-ov-card">
          <div className="ml-ov-label">NEXT PAYROLL DEDUCTION</div>
          <div className="ml-ov-value">{nextDeduction}</div>
          <div className="ml-ov-badge info">
            <span className="dot"></span>
            Scheduled Automatically
          </div>
        </div>
      </div>      {showAutoDeductBanner && (
        <div className="ml-info-banner">
          <div className="info-icon-wrapper">
            <Info size={16} strokeWidth={2} />
          </div>
          <div>
            <h4>Automatic Payment Deduction</h4>
            <p>Payments are automatically deducted by HRD on the 25th of each month</p>
          </div>
        </div>
      )}

      <div className="ml-tabs-section">
        <h2>My Loans</h2>
        <div className="ml-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`ml-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="ml-loan-list">
        {loansData[activeTab].length > 0 ? (
          <div className="ml-grid">
            {loansData[activeTab].map((loan, idx) => (
              <div className="ml-loan-card" key={idx}>
                <div className="ml-lc-header">
                  <div>
                    <h3>{loan.type}</h3>
                    <span>ID: {loan.id}</span>
                  </div>
                  <div className={`ml-status-pill ${getStatusColor(loan.status)}`}>
                    <span className="dot"></span> {loan.status}
                  </div>
                </div>

                <div className="ml-lc-details">
                  <div className="ml-lc-col">
                    <span className="lbl">TOTAL BORROWED</span>
                    <span className="val">{loan.totalBorrowed}</span>
                  </div>
                  <div className="ml-lc-col">
                    <span className="lbl">
                      {activeTab === 'pending' ? 'ESTIMATE INTEREST AMOUNT'
                        : activeTab === 'rejected' ? 'DATE APPLY'
                          : 'REMAINING'}
                    </span>
                    <span className="val">
                      {activeTab === 'pending' ? loan.interestEstimate
                        : activeTab === 'rejected' ? loan.appliedAt
                          : loan.remaining}
                    </span>
                  </div>
                  <div className="ml-lc-col">
                    <span className="lbl">PURPOSE</span>
                    <span className="val">{loan.purpose}</span>
                  </div>
                  <div className="ml-lc-col">
                    <span className="lbl">
                      {activeTab === 'pending' ? 'ESTIMATE BUNGA'
                        : activeTab === 'rejected' ? 'DATE REJECTED'
                          : 'BUNGA (FLAT)'}
                    </span>
                    <span className="val">
                      {activeTab === 'rejected' ? loan.dateRejected : loan.bunga}
                    </span>
                  </div>
                </div>

                <div className="ml-lc-progress">
                  <div className="prog-header">
                    <span>{activeTab === 'pending' || activeTab === 'rejected' ? 'Repayment Request' : 'Repayment Progress'}</span>
                    {(activeTab !== 'pending' && activeTab !== 'rejected') && <span className="pct">{loan.progress}%</span>}
                  </div>
                  {(activeTab !== 'pending' && activeTab !== 'rejected') && (
                    <div className="prog-bar">
                      <div className="prog-fill" style={{ width: `${loan.progress}%` }}></div>
                    </div>
                  )}
                  <div className="prog-footer">
                    {activeTab === 'pending' || activeTab === 'rejected'
                      ? `${loan.totalInstallments} Months Installment Request`
                      : `${loan.installmentsPaid} of ${loan.totalInstallments} Installments Paid`}
                  </div>
                </div>

                <div className="ml-lc-footer">
                  {activeTab === 'pending' ? (
                    <div>
                      <div className="lbl">APPLIED AT</div>
                      <div className="val">{loan.appliedAt}</div>
                    </div>
                  ) : activeTab === 'rejected' ? (
                    <div>
                      <div className="lbl">REASON REJECT</div>
                      <div className="val" style={{ color: '#ef4444', fontWeight: '500' }}>{loan.rejectReason}</div>
                    </div>
                  ) : (
                    <div>
                      <div className="lbl">NEXT DEDUCTION</div>
                      <div className="val">{loan.nextDeduction}</div>
                    </div>
                  )}
                  <ViewDetailsButton loanId={loan.id.replace('#', '')} navigate={navigate} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="ml-empty-state">
            <p>No {activeTab} loans found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyLoans;
