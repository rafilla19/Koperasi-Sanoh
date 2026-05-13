import React, { useState, useEffect, useRef } from 'react';
import { User, Plus, Trash2, Calendar, Search, Upload, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import './ManualPayment.css';

const MONTHS = [
  { value: 1, label: 'January' }, { value: 2, label: 'February' },
  { value: 3, label: 'March' }, { value: 4, label: 'April' },
  { value: 5, label: 'May' }, { value: 6, label: 'June' },
  { value: 7, label: 'July' }, { value: 8, label: 'August' },
  { value: 9, label: 'September' }, { value: 10, label: 'October' },
  { value: 11, label: 'November' }, { value: 12, label: 'December' },
];
const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: currentYear - 2020 + 3 }, (_, i) => 2020 + i);

const PAYMENT_TYPES = [
  { value: 'mandatory', label: 'Mandatory Saving', detailKey: 'mandatory_outstanding' },
  { value: 'voluntary', label: 'Voluntary Saving', detailKey: 'voluntary_outstanding' },
  { value: 'loan', label: 'Loan Repayment', detailKey: 'loan_deduction' },
  { value: 'withdrawal', label: 'Withdrawal', detailKey: '' },
];

const MAX_FILE_MB = 10;

const ManualPayment = () => {
  const now = new Date();
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());

  // Member search
  const [members, setMembers] = useState([]);
  const [memberSearch, setMemberSearch] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState('');
  const [selectedMemberLabel, setSelectedMemberLabel] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [memberDetail, setMemberDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef(null);

  // Payment rows — max 3
  const [payments, setPayments] = useState([{ type: '', amount: '' }]);

  // Notes & file
  const [notes, setNotes] = useState('');
  const [proofFile, setProofFile] = useState(null);
  const [fileError, setFileError] = useState('');
  const [formError, setFormError] = useState('');

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (searchRef.current && !searchRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => { fetchMembers(); }, []);

  useEffect(() => {
    if (selectedMemberId) fetchMemberDetail(selectedMemberId);
  }, [selectedMonth, selectedYear]);

  const fetchMembers = async () => {
    try {
      const res = await fetch('http://127.0.0.1:8000/api/loan/loans/member_list_manual_payment/');
      if (res.ok) setMembers(await res.json());
    } catch (err) { console.error(err); }
  };

  const fetchMemberDetail = async (id) => {
    setLoading(true);
    try {
      const res = await fetch(
        `http://127.0.0.1:8000/api/loan/loans/get_member_outstanding_detail/?member_id=${id}&month=${selectedMonth}&year=${selectedYear}`
      );
      if (res.ok) {
        const data = await res.json();
        setMemberDetail(data);
        // Re-fill amounts for any already-selected payment types
        setPayments(prev => prev.map(p => {
          if (!p.type) return p;
          const pt = PAYMENT_TYPES.find(t => t.value === p.type);
          return { ...p, amount: pt ? (data[pt.detailKey] || 0) : p.amount };
        }));
      } else {
        setMemberDetail(null);
      }
    } catch (err) {
      console.error(err);
      setMemberDetail(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectMember = (member) => {
    setSelectedMemberId(member.id);
    setSelectedMemberLabel(`${member.full_name} (${member.nik_employee})`);
    setMemberSearch('');
    setShowDropdown(false);
    setPayments([{ type: '', amount: '' }]);
    fetchMemberDetail(member.id);
  };

  const filteredMembers = members.filter(m =>
    m.full_name.toLowerCase().includes(memberSearch.toLowerCase()) ||
    m.nik_employee.toLowerCase().includes(memberSearch.toLowerCase())
  );

  // ── Payment row logic ──────────────────────────────────────────

  const usedTypes = payments.map(p => p.type).filter(Boolean);

  const getAutoAmount = (type) => {
    if (!memberDetail) return '';
    const pt = PAYMENT_TYPES.find(t => t.value === type);
    return pt ? String(memberDetail[pt.detailKey] || 0) : '';
  };

  const handleTypeChange = (idx, newType) => {
    let updated = [...payments];

    // If selecting withdrawal, it must be the only row
    if (newType === 'withdrawal') {
      updated = [{ type: 'withdrawal', amount: getAutoAmount('withdrawal') }];
    } else {
      updated[idx] = { type: newType, amount: newType ? getAutoAmount(newType) : '' };
    }

    setPayments(updated);
  };

  const handleAmountChange = (idx, value) => {
    const updated = [...payments];
    updated[idx] = { ...updated[idx], amount: value };
    setPayments(updated);
  };

  const isWithdrawalActive = payments.some(p => p.type === 'withdrawal');

  const addPayment = () => {
    if (isWithdrawalActive) return; // Cannot add more if withdrawal is active
    if (payments.length >= PAYMENT_TYPES.length - 1) return; // max rows (excluding withdrawal)
    setPayments([...payments, { type: '', amount: '' }]);
  };

  const removePayment = (idx) => {
    setPayments(payments.filter((_, i) => i !== idx));
  };

  // Options available for a given row (exclude already-used types except own)
  const availableTypes = (currentType) => {
    // If other types already exist, don't show withdrawal in the list
    const hasOtherTypes = payments.some(p => p.type && p.type !== 'withdrawal');
    return PAYMENT_TYPES.filter(pt => {
      const isUsed = usedTypes.includes(pt.value) && pt.value !== currentType;
      const isWithdrawalConflict = hasOtherTypes && pt.value === 'withdrawal';
      return !isUsed && !isWithdrawalConflict;
    });
  };

  // ── File upload ────────────────────────────────────────────────

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'application/pdf'];
    if (!allowedTypes.includes(file.type)) {
      setFileError('Only JPG, PNG, and PDF files are allowed.');
      setProofFile(null);
      e.target.value = '';
      return;
    }
    if (file.size > MAX_FILE_MB * 1024 * 1024) {
      setFileError(`File size must be under ${MAX_FILE_MB}MB.`);
      setProofFile(null);
      e.target.value = '';
      return;
    }
    setFileError('');
    setProofFile(file);
  };

  // ── Submit ─────────────────────────────────────────────────────

  const handleProcessPayment = async () => {
    setFormError('');
    if (!selectedMemberId) { setFormError('Please select a member.'); return; }
    
    const activePayments = payments.filter(p => p.type && p.amount);
    if (activePayments.length === 0) { 
      setFormError('Please add at least one payment type and amount.'); 
      return; 
    }
    
    if (!notes.trim()) { 
      setFormError('Notes are required before processing payment.'); 
      return; 
    }

    setLoading(true);
    const formData = new FormData();
    formData.append('member_id', selectedMemberId);
    formData.append('notes', notes);
    formData.append('payments', JSON.stringify(activePayments));
    if (proofFile) {
      formData.append('proof_file', proofFile);
    }

    try {
      const res = await fetch('http://127.0.0.1:8000/api/loan/loans/process_manual_payments/', {
        method: 'POST',
        body: formData,
        // Don't set Content-Type header when using FormData
      });

      const result = await res.json();

      if (res.ok || res.status === 207) {
        if (result.errors && result.errors.length > 0) {
          setFormError(`Partial success. Errors: ${result.errors.join(', ')}`);
        } else {
          setSubmitSuccess(true);
          // Refresh data member untuk melihat saldo terbaru
          if (selectedMemberId) {
            fetchMemberDetail(selectedMemberId);
          }
          
          // Simpan ringkasan hasil untuk ditampilkan
          const summary = result.results ? result.results.join(' | ') : 'All payments processed';
          setSuccessMessage(summary);

          setTimeout(() => {
            setSubmitSuccess(false);
            setSuccessMessage('');
            handleClear();
          }, 5000); // Beri waktu lebih lama agar admin bisa baca ringkasan
        }
      } else {
        const errorMsg = result.error || 'Failed to process payment.';
        const detailedErrors = result.details ? `: ${result.details.join(', ')}` : '';
        setFormError(errorMsg + detailedErrors);
      }
    } catch (err) {
      console.error('Submit error:', err);
      setFormError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleClear = () => {
    setSelectedMemberId('');
    setSelectedMemberLabel('');
    setMemberDetail(null);
    setPayments([{ type: '', amount: '' }]);
    setNotes('');
    setProofFile(null);
    setFileError('');
    setFormError('');
  };

  const formatRupiah = (number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 })
      .format(number || 0).replace(',00', '');

  const selectedMonthLabel = MONTHS.find(m => m.value === selectedMonth)?.label || '';
  const canAddMore = !isWithdrawalActive && (payments.length < PAYMENT_TYPES.length - 1);

  return (
    <div className="mp-container">
      <div className="mp-top-bar">
        <h1 className="mp-title">Manual Transaction</h1>

        {/* Period Filter */}
        <div className="mp-period-filter">
          <Calendar size={16} style={{ color: '#6b7280' }} />
          <select id="mp-filter-month" value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}>
            {MONTHS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
          </select>
          <select id="mp-filter-year" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}>
            {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
      </div>

      <div className="mp-card">
        {/* ── Member Selector ── */}
        <div className="mp-user-info">
          <div className="mp-user-avatar"><User size={24} color="#fff" /></div>

          <div className="mp-user-select-wrap">
            {/* Searchable dropdown */}
            <div className="mp-searchable-wrap" ref={searchRef}>
              <div className="mp-search-input-box" onClick={() => setShowDropdown(true)}>
                <Search size={15} className="mp-search-icon" />
                <input
                  type="text"
                  className="mp-search-input"
                  placeholder={selectedMemberLabel || 'Search member by name or NIK...'}
                  value={memberSearch}
                  onChange={e => { setMemberSearch(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                />
                {selectedMemberId && (
                  <span className="mp-selected-badge">{selectedMemberLabel}</span>
                )}
              </div>
              {showDropdown && (
                <div className="mp-member-dropdown">
                  {filteredMembers.length === 0 ? (
                    <div className="mp-dropdown-empty">No members found</div>
                  ) : (
                    filteredMembers.map(m => (
                      <div
                        key={m.id}
                        className={`mp-dropdown-item ${m.id === selectedMemberId ? 'selected' : ''}`}
                        onMouseDown={() => handleSelectMember(m)}
                      >
                        <span className="mp-drop-name">{m.full_name}</span>
                        <span className="mp-drop-nik">{m.nik_employee}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            <div className="mp-user-meta">
              Department: {memberDetail?.department_name || '-'}<br />
              NIK Employee: {memberDetail?.nik_employee || '-'}
            </div>
          </div>

          <div className="mp-user-details">
            Email: {memberDetail?.email || '-'}<br />
            Phone: {memberDetail?.phone_number || '-'}
          </div>
        </div>

        {/* ── Outstanding Detail ── */}
        <div className="mp-section">
          <div className="mp-section-header-row">
            <h2 className="mp-section-title" style={{ margin: 0 }}>Detail Outstanding</h2>
            {memberDetail && (
              <span className="mp-period-badge">Period: {selectedMonthLabel} {selectedYear}</span>
            )}
            {loading && <span className="mp-loading-text">Loading...</span>}
          </div>

          <div className="mp-grid">
            <div className="mp-outstanding-list">
              <div className="mp-out-item">
                <label>Loan Deduction (Current Cycle)</label>
                <div className="mp-amount">{formatRupiah(memberDetail?.loan_deduction)}</div>
              </div>
              <div className="mp-out-item">
                <label>Mandatory Saving (Outstanding)</label>
                <div className="mp-amount">{formatRupiah(memberDetail?.mandatory_outstanding)}</div>
              </div>
              <div className="mp-out-item">
                <label>Voluntary Saving (Outstanding)</label>
                <div className="mp-amount">{formatRupiah(memberDetail?.voluntary_outstanding)}</div>
              </div>
            </div>

            <div className="mp-saving-card">
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <label>Saving Balance</label>
                  <h3>{formatRupiah(memberDetail?.amount_saving_balance)}</h3>
                  <label style={{ marginTop: '16px' }}>Total Loan Balance</label>
                  <h3>{formatRupiah(memberDetail?.loans_balance)}</h3>
                  <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #eee' }}>
                    <label style={{ fontSize: '11px', color: '#666' }}>Monthly Mandatory Set</label>
                    <div style={{ fontWeight: '700', color: '#1a1a1a' }}>{formatRupiah(memberDetail?.mandatory_monthly_amount)}</div>
                    <label style={{ fontSize: '11px', color: '#666', marginTop: '8px', display: 'block' }}>Monthly Voluntary Set</label>
                    <div style={{ fontWeight: '700', color: '#1a1a1a' }}>{formatRupiah(memberDetail?.voluntary_monthly_amount)}</div>
                  </div>
                </div>
                <div>
                  <label>Bank Info</label>
                  <h4 style={{ fontSize: '13px', margin: '4px 0 0' }}>
                    {memberDetail?.bank_name || '-'}<br />
                    {memberDetail?.account_number || '-'}<br />
                    ({memberDetail?.account_holder_name || '-'})
                  </h4>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Payment Rows ── */}
        <div className="mp-section">
          <div className="mp-section-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 className="mp-section-title" style={{ margin: 0 }}>
              Payment
              <span className="mp-row-count">{payments.length}/{PAYMENT_TYPES.length}</span>
            </h2>
            <button
              className="mp-add-payment-btn"
              onClick={addPayment}
              disabled={!canAddMore}
              title={!canAddMore ? 'Maximum 3 payment types' : 'Add payment row'}
            >
              <Plus size={16} /> Add More
            </button>
          </div>

          {payments.map((pay, idx) => {
            const opts = availableTypes(pay.type);
            return (
              <div key={idx} className="mp-payment-row">
                {/* Type */}
                <div className="mp-input-wrap" style={{ flex: 2 }}>
                  <select
                    className="mp-clean-input"
                    value={pay.type}
                    onChange={e => handleTypeChange(idx, e.target.value)}
                  >
                    <option value="">— Transaction Type —</option>
                    {opts.map(pt => (
                      <option key={pt.value} value={pt.value}>{pt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Amount — auto-filled, editable */}
                <div className="mp-input-wrap" style={{ flex: 2, position: 'relative' }}>
                  <span className="mp-currency-prefix">Rp</span>
                  <input
                    type="number"
                    className="mp-clean-input mp-amount-input"
                    placeholder="0"
                    value={pay.amount}
                    onChange={e => handleAmountChange(idx, e.target.value)}
                  />
                  {pay.type && memberDetail && (
                    <span className="mp-auto-label">auto-filled</span>
                  )}
                </div>

                {/* Remove */}
                {payments.length > 1 && (
                  <button className="mp-remove-btn" onClick={() => removePayment(idx)} title="Remove row">
                    <Trash2 size={18} color="#ef4444" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Notes & Proof ── */}
        <div className="mp-section">
          <div className="mp-payment-extra">
            {/* Notes — required */}
            <div className="mp-input-group">
              <label className="mp-label">
                Notes <span className="mp-required">*</span>
                <span className="mp-required-hint">(required)</span>
              </label>
              <textarea
                className={`mp-clean-input mp-textarea ${!notes.trim() && formError ? 'mp-input-error' : ''}`}
                placeholder="Enter transaction notes (required)..."
                value={notes}
                onChange={e => { setNotes(e.target.value); if (formError) setFormError(''); }}
              />
            </div>

            {/* Proof of Transfer */}
            <div className="mp-input-group">
              <label className="mp-label">Proof of Transfer</label>
              <div className="mp-file-upload">
                <input
                  type="file"
                  id="mp-proof"
                  className="mp-file-input"
                  accept="image/jpeg,image/png,image/jpg,application/pdf"
                  onChange={handleFileChange}
                />
                <label htmlFor="mp-proof" className={`mp-file-label ${proofFile ? 'mp-file-selected' : ''}`}>
                  {proofFile ? (
                    <>
                      <FileText size={20} style={{ flexShrink: 0 }} />
                      <span className="mp-filename">{proofFile.name}</span>
                      <span className="mp-filesize">({(proofFile.size / 1024 / 1024).toFixed(2)} MB)</span>
                    </>
                  ) : (
                    <>
                      <Upload size={20} style={{ flexShrink: 0 }} />
                      <span>Upload Proof of Transfer</span>
                      <span className="mp-file-hint">JPG, PNG, PDF · Max {MAX_FILE_MB}MB</span>
                    </>
                  )}
                </label>
              </div>
              {fileError && <div className="mp-file-error"><AlertCircle size={14} /> {fileError}</div>}
            </div>
          </div>
        </div>

        {/* ── Validation error ── */}
        {formError && (
          <div className="mp-form-error">
            <AlertCircle size={16} /> {formError}
          </div>
        )}

        {/* ── Success banner ── */}
        {submitSuccess && (
          <div className="mp-form-success">
            <CheckCircle size={20} style={{ marginTop: '2px', flexShrink: 0 }} />
            <div>
              <div className="mp-success-title">Payment Processed Successfully!</div>
              <div className="mp-success-detail">{successMessage}</div>
            </div>
          </div>
        )}

        {/* ── Actions ── */}
        <div className="mp-actions">
          <button className="mp-btn mp-btn-process" onClick={handleProcessPayment}>
            Process Payment
          </button>
          <button className="mp-btn" onClick={handleClear}>Clear</button>
        </div>
      </div>
    </div>
  );
};

export default ManualPayment;
