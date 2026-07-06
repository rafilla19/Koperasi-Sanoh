import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, ChevronRight } from 'lucide-react';
import { apiUrl } from '../../services/api';
import './AdminPendingApprovals.css';

const STATUS_TABS = [
  { key: 'pending', label: 'Menunggu', color: '#1e3a5f' },
  { key: 'verifying', label: 'Diverifikasi', color: '#d97706' },
  { key: 'approved', label: 'Disetujui', color: '#2563eb' },
  { key: 'rejected', label: 'Ditolak', color: '#dc2626' },
];

const AdminPendingApprovals = () => {
  const [activeTab, setActiveTab] = useState('approvals'); // 'approvals' | 'active'
  const navigate = useNavigate();

  const [pendingList, setPendingList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [filterDate, setFilterDate] = useState('');
  const [stats, setStats] = useState({
    total_members: 0,
    active_loans: 0,
    collected_this_month: 0,
    total_overdue: 0
  });

  const fetchPendingList = async (status) => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl(`/loan/loan-applications/admin_pending_list/?status=${status}`));
      if (res.ok) {
        const data = await res.json();
        setPendingList(Array.isArray(data) ? data : []);
      } else {
        setPendingList([]);
      }
    } catch (error) {
      console.error('Failed to fetch pending list:', error);
      setPendingList([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingList('pending');

    const fetchStats = async () => {
      try {
        const statsRes = await fetch(apiUrl('/loan/loans/admin_pending_stats/'));
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      }
    };
    fetchStats();
  }, []);

  const handleFilterChange = (val) => {
    setStatusFilter(val);
    fetchPendingList(val);
  };

  const filteredList = pendingList.filter((item) => {
    if (!filterDate) return true;
    const d = item.applied_at ? new Date(item.applied_at) : null;
    if (!d) return true;
    return d.toISOString().slice(0, 10) === filterDate;
  });

  const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(number || 0).replace(',00', '');
  };

  const handleDetails = (id) => {
    navigate(`/dashboard/admin/ls-loans/${id}`);
  };

  return (
    <div className="admin-pending-approvals">
      <div className="apa-header">
        <h1>{activeTab === 'approvals' ? 'Menunggu Persetujuan' : 'Pengingat Pembayaran Pinjaman'}</h1>
        <div className="apa-breadcrumb">
          <Link to="/dashboard/admin/ls-loans">Dashboard Pinjaman</Link>
          <ChevronRight size={13} className="apa-breadcrumb-sep" />
          <span className="apa-breadcrumb-current">
            {activeTab === 'approvals'
              ? 'Menunggu Persetujuan'
              : 'Pengingat Pembayaran Pinjaman'}
          </span>
        </div>
      </div>

      {activeTab === 'approvals' && (
        <>
          {/* FILTER */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {STATUS_TABS.map(({ key, label, color }) => (
                <button
                  key={key}
                  onClick={() => handleFilterChange(key)}
                  style={{
                    padding: '7px 16px',
                    borderRadius: 8,
                    fontSize: 13,
                    border: '1px solid #e2e8f0',
                    cursor: 'pointer',
                    background: statusFilter === key ? color : '#fff',
                    color: statusFilter === key ? '#fff' : '#374151',
                    fontWeight: statusFilter === key ? 600 : 400,
                    transition: 'all 0.15s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            <div style={{ width: 1, height: 28, background: '#e2e8f0' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: '#6b7280', whiteSpace: 'nowrap' }}>Tanggal:</span>
              <input
                type="date"
                value={filterDate}
                onChange={(e) => setFilterDate(e.target.value)}
                style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, cursor: 'pointer' }}
              />
              {filterDate && (
                <button
                  onClick={() => setFilterDate('')}
                  style={{ padding: '6px 12px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#f9fafb', fontSize: 12, cursor: 'pointer', color: '#6b7280' }}
                >
                  Atur Ulang
                </button>
              )}
            </div>
          </div>

          <div className="apa-approvals-content">
            {loading ? (
              <p style={{ color: '#94a3b8', fontSize: 13 }}>Memuat...</p>
            ) : filteredList.length === 0 ? (
              <p style={{ color: '#94a3b8', fontSize: 13 }}>
                Tidak ada pengajuan{filterDate ? ` pada tanggal ${new Date(filterDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''} dengan status "{STATUS_TABS.find(t => t.key === statusFilter)?.label}"
              </p>
            ) : (
              filteredList.map((item, idx) => (
                <div key={item.application_id ?? idx} className="apa-approval-card">
                  <div className="apa-card-avatar">
                    <User size={24} color="white" />
                  </div>
                  <div className="apa-card-user">
                    <div className="apa-card-name">{item.full_name}</div>
                    <div className="apa-card-dept">{item.department_name}</div>
                    <div className="apa-card-id">{item.employee_id}</div>
                  </div>
                  <div className="apa-card-purpose">
                    <div className="apa-card-label">Tujuan</div>
                    <div className="apa-card-value">{item.purpose}</div>
                  </div>
                  <div className="apa-card-term">
                    <div className="apa-card-label">Jangka Waktu</div>
                    <div className="apa-card-value">{item.duration_months} Bulan</div>
                  </div>
                  <div className="apa-card-amount">
                    <div className="apa-card-label">Jumlah</div>
                    <div className="apa-card-value bold">{formatRupiah(item.amount_requested)}</div>
                  </div>
                  <div className="apa-card-action">
                    <button className="apa-btn-details" onClick={() => handleDetails(item.application_id)}>Detail</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default AdminPendingApprovals;
