import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Plus, Info, ChevronRight, Loader, Banknote, X } from 'lucide-react';
import { apiUrl, getAuthHeaders } from '../../services/api';
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
      {loading ? <><Loader size={14} className="spinner" /> Memuat...</> : 'Lihat Detail'}
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
  const [isDataLoading, setIsDataLoading] = useState(true);
  const [checkingBankAccount, setCheckingBankAccount] = useState(false);
  const [showBankPopup, setShowBankPopup] = useState(false);
  const [banksList, setBanksList] = useState([]);
  const [bankFormData, setBankFormData] = useState({ bank_id: '', account_number: '', account_holder_name: '' });
  const [bankFormError, setBankFormError] = useState('');
  const [bankFormLoading, setBankFormLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      // Get member_id from user in localStorage
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const memberId = user?.member_id || 1;

      try {
        setIsDataLoading(true);
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
              const formattedDate = nextDate.toLocaleDateString('id-ID', { month: 'short', day: 'numeric', year: 'numeric' });
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
            status: item.status_code || 'SUBMITTED',
            totalBorrowed: formatRupiah(item.amount_requested),
            remaining: formatRupiah(item.amount_requested),
            purpose: item.purpose,
            progress: 0,
            installmentsPaid: 0,
            totalInstallments: item.duration_months || 0,
            appliedAt: new Date(item.applied_at).toLocaleDateString('id-ID', { month: 'short', day: '2-digit', year: 'numeric' }),
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
            appliedAt: new Date(item.applied_at).toLocaleDateString('id-ID', { month: 'short', day: '2-digit', year: 'numeric' }),
            dateRejected: new Date(item.admin_update).toLocaleDateString('id-ID', { month: 'short', day: '2-digit', year: 'numeric' }),
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
          setHasPendingClosure((profileData.pending_closure_count || 0) > 0);
        }
      } catch (error) {
        console.error('Failed to fetch data:', error);
      } finally {
        setIsDataLoading(false);
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

  const proceedToApply = () => {
    if (hasPendingLoan) {
      alert('Anda tidak dapat mengajukan pinjaman baru karena masih ada pengajuan pinjaman yang menunggu persetujuan.');
    } else if (hasActiveLoan) {
      alert('Anda tidak dapat mengajukan pinjaman baru karena masih ada pinjaman yang aktif.');
    } else {
      setIsNavigating(true);
      navigate('/dashboard/loans/application');
    }
  };

  const handleApplyLoan = async () => {
    if (isNavigating || checkingBankAccount) return;
    if (hasPendingClosure) {
      alert('Anda tidak dapat mengajukan pinjaman baru karena akun Anda dalam proses penutupan.');
      return;
    }

    setCheckingBankAccount(true);
    try {
      const res = await fetch(apiUrl('/my-savings/bank-account-status/'), { headers: getAuthHeaders() });
      const data = await res.json();
      if (data?.is_complete) {
        proceedToApply();
        return;
      }
      setBankFormData({
        bank_id: data?.bank_id ? String(data.bank_id) : '',
        account_number: data?.account_number || '',
        account_holder_name: data?.account_holder_name || '',
      });
      setBankFormError('');
      if (banksList.length === 0) {
        fetch(apiUrl('/master/banks/'), { headers: getAuthHeaders() })
          .then(r => r.json())
          .then(list => setBanksList(Array.isArray(list) ? list : []))
          .catch(() => {});
      }
      setShowBankPopup(true);
    } catch (err) {
      console.error('Failed to check bank account:', err);
      alert('Gagal mengecek rekening bank. Coba lagi.');
    } finally {
      setCheckingBankAccount(false);
    }
  };

  const handleBankFormSubmit = async () => {
    setBankFormError('');
    if (!bankFormData.bank_id || !bankFormData.account_number.trim() || !bankFormData.account_holder_name.trim()) {
      setBankFormError('Semua field wajib diisi');
      return;
    }
    setBankFormLoading(true);
    try {
      const userStr = localStorage.getItem('user');
      const user = userStr ? JSON.parse(userStr) : null;
      const memberId = user?.member_id || 1;

      const res = await fetch(apiUrl('/member/members/update_profile/'), {
        method: 'POST',
        headers: Object.assign({ 'Content-Type': 'application/json' }, getAuthHeaders()),
        body: JSON.stringify({
          member_id: memberId,
          bank_id: parseInt(bankFormData.bank_id, 10),
          acc_name: bankFormData.account_holder_name,
          acc_no: bankFormData.account_number,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setShowBankPopup(false);
        proceedToApply();
      } else {
        setBankFormError(data?.error || 'Gagal menyimpan. Coba lagi.');
      }
    } catch (err) {
      setBankFormError('Gagal menyimpan. Coba lagi.');
    } finally {
      setBankFormLoading(false);
    }
  };

  useEffect(() => {
    if (showBankPopup) {
      document.body.classList.add('has-global-modal');
    } else {
      document.body.classList.remove('has-global-modal');
    }
    return () => {
      document.body.classList.remove('has-global-modal');
    };
  }, [showBankPopup]);

  const tabs = [
    { id: 'active', label: 'Pinjaman Aktif' },
    { id: 'completed', label: 'Selesai' },
    { id: 'pending', label: 'Menunggu' },
    { id: 'rejected', label: 'Ditolak' },
  ];

  const getStatusColor = (status) => {
    switch (status.toLowerCase()) {
      case 'active': return 'status-active';
      case 'completed': return 'status-completed';
      case 'submitted': return 'status-pending';
      case 'verifying': return 'status-verifying';
      case 'rejected': return 'status-rejected';
      default: return '';
    }
  };

  const STATUS_LABELS = {
    submitted: 'Menunggu',
    verifying: 'Diverifikasi',
  };

  const getStatusLabel = (status) => STATUS_LABELS[status.toLowerCase()] || status;

  return (
    <div className="ml-page">
      <div className="ml-header-section">
        <div className="ml-header-text">
          <h1>Ringkasan Pinjaman</h1>
          <p>Ringkasan pinjaman aktif, progres pembayaran, dan potongan gaji</p>
        </div>
        <button
          className="btn-apply-loan"
          onClick={handleApplyLoan}
          disabled={isDataLoading || hasActiveLoan || hasPendingLoan || hasPendingClosure || isNavigating || checkingBankAccount}
          style={(isDataLoading || hasActiveLoan || hasPendingLoan || hasPendingClosure) ? {
            background: '#94a3b8',
            cursor: 'not-allowed',
            color: '#f1f5f9'
          } : {}}
        >
          {isDataLoading || isNavigating || checkingBankAccount ? <><Loader size={16} className="spinner" /> Memuat...</> : <><Plus size={16} strokeWidth={2.5} /> Ajukan Pinjaman Baru</>}
        </button>
      </div>

      <div className="ml-overview-cards">
        <div className="ml-ov-card">
          <div className="ml-ov-label">TOTAL SALDO TERTUNGGAK</div>
          <div className="ml-ov-value">{formatRupiah(totalOutstanding)}</div>
          {/* <div className="ml-ov-badge up">
            <ChevronRight size={12} strokeWidth={3} style={{ transform: 'rotate(-45deg)' }} />
            Increased by 5% this month
          </div> */}
        </div>
        <div className="ml-ov-card">
          <div className="ml-ov-label">POTONGAN GAJI BERIKUTNYA</div>
          <div className="ml-ov-value">{showAutoDeductBanner ? nextDeduction : '-'}</div>
          <div className="ml-ov-badge info">
            <span className="dot"></span>
            Dijadwalkan Otomatis
          </div>
        </div>
      </div>      {showAutoDeductBanner && (
        <div className="ml-info-banner">
          <div className="info-icon-wrapper">
            <Info size={16} strokeWidth={2} />
          </div>
          <div>
            <h4>Potongan Pembayaran Otomatis</h4>
            <p>Pembayaran dipotong otomatis oleh HRD pada tanggal 27 setiap bulan</p>
          </div>
        </div>
      )}

      <div className="ml-tabs-section">
        <h2>Pinjaman Saya</h2>
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
                    <span className="dot"></span> {getStatusLabel(loan.status)}
                  </div>
                </div>

                <div className="ml-lc-details">
                  <div className="ml-lc-col">
                    <span className="lbl">TOTAL PINJAMAN</span>
                    <span className="val">{loan.totalBorrowed}</span>
                  </div>
                  {activeTab !== 'pending' && (
                    <div className="ml-lc-col">
                      <span className="lbl">
                        {activeTab === 'rejected' ? 'TANGGAL PENGAJUAN' : 'SISA'}
                      </span>
                      <span className="val">
                        {activeTab === 'rejected' ? loan.appliedAt : loan.remaining}
                      </span>
                    </div>
                  )}
                  <div className="ml-lc-col">
                    <span className="lbl">TUJUAN</span>
                    <span className="val">{loan.purpose}</span>
                  </div>
                  {activeTab !== 'pending' && (
                    <div className="ml-lc-col">
                      <span className="lbl">
                        {activeTab === 'rejected' ? 'TANGGAL DITOLAK' : 'BUNGA (FLAT)'}
                      </span>
                      <span className="val">
                        {activeTab === 'rejected' ? loan.dateRejected : loan.bunga}
                      </span>
                    </div>
                  )}
                </div>

                <div className="ml-lc-progress">
                  <div className="prog-header">
                    <span>{activeTab === 'pending' || activeTab === 'rejected' ? 'Permintaan Cicilan' : 'Progres Pembayaran'}</span>
                    {(activeTab !== 'pending' && activeTab !== 'rejected') && <span className="pct">{loan.progress}%</span>}
                  </div>
                  {(activeTab !== 'pending' && activeTab !== 'rejected') && (
                    <div className="prog-bar">
                      <div className="prog-fill" style={{ width: `${loan.progress}%` }}></div>
                    </div>
                  )}
                  <div className="prog-footer">
                    {activeTab === 'pending' || activeTab === 'rejected'
                      ? `${loan.totalInstallments} Bulan Permintaan Angsuran`
                      : `${loan.installmentsPaid} dari ${loan.totalInstallments} Angsuran Terbayar`}
                  </div>
                </div>

                <div className="ml-lc-footer">
                  {activeTab === 'pending' ? (
                    <div>
                      <div className="lbl">TANGGAL PENGAJUAN</div>
                      <div className="val">{loan.appliedAt}</div>
                    </div>
                  ) : activeTab === 'rejected' ? (
                    <div>
                      <div className="lbl">ALASAN PENOLAKAN</div>
                      <div className="val" style={{ color: '#ef4444', fontWeight: '500' }}>{loan.rejectReason}</div>
                    </div>
                  ) : (
                    <div>
                      <div className="lbl">POTONGAN BERIKUTNYA</div>
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
            <p>Tidak ada pinjaman {activeTab === 'active' ? 'aktif' : activeTab === 'completed' ? 'selesai' : activeTab === 'pending' ? 'menunggu' : 'ditolak'} ditemukan.</p>
          </div>
        )}
      </div>

      {showBankPopup && createPortal(
        <div className="modal-overlay global-modal-overlay">
          <div className="sv-bank-popup">
            <div className="sv-bank-popup-header">
              <div className="sv-bank-popup-icon">
                <Banknote size={22} />
              </div>
              <div className="sv-bank-popup-heading">
                <p className="sv-bank-popup-kicker">Rekening pencairan belum lengkap</p>
                <h3 className="sv-bank-popup-title">Isi Rekening Bank Tujuan</h3>
                <p className="sv-bank-popup-subtitle">
                  Data rekening bank wajib diisi sebelum mengajukan pinjaman. Informasi ini digunakan untuk proses pencairan dana.
                </p>
              </div>
              <button
                className="sv-bank-popup-close"
                onClick={() => setShowBankPopup(false)}
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="sv-bank-form">
              <div className="inp-group">
                <label className="inp-label">Bank Tujuan</label>
                <select
                  className="prof-input"
                  value={bankFormData.bank_id}
                  onChange={e => setBankFormData(d => ({ ...d, bank_id: e.target.value }))}
                >
                  <option value="">— Pilih Bank —</option>
                  {banksList.map(b => (
                    <option key={b.id} value={b.id}>{b.bank_name}</option>
                  ))}
                </select>
              </div>

              <div className="inp-group">
                <label className="inp-label">Nomor Rekening</label>
                <input
                  className="prof-input"
                  type="text"
                  placeholder="Contoh: 1234567890"
                  value={bankFormData.account_number}
                  onChange={e => setBankFormData(d => ({ ...d, account_number: e.target.value }))}
                />
              </div>

              <div className="inp-group">
                <label className="inp-label">Nama Pemilik Rekening</label>
                <input
                  className="prof-input"
                  type="text"
                  placeholder="Sesuai buku tabungan"
                  value={bankFormData.account_holder_name}
                  onChange={e => setBankFormData(d => ({ ...d, account_holder_name: e.target.value }))}
                />
              </div>

              {bankFormError && (
                <p style={{ color: '#E11D48', fontSize: 12, margin: '0 0 12px' }}>{bankFormError}</p>
              )}
            </div>

            <div className="sv-bank-popup-actions">
              <button
                className="btn btn-navy"
                onClick={handleBankFormSubmit}
                disabled={bankFormLoading}
              >
                {bankFormLoading ? 'Menyimpan...' : 'Simpan & Lanjutkan'}
              </button>
              <button
                className="sv-bank-popup-secondary"
                onClick={() => setShowBankPopup(false)}
              >
                Batal
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default MyLoans;
