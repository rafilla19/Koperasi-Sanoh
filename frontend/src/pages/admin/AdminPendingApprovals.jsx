import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User, ShoppingBag } from 'lucide-react';
import { apiUrl } from '../../services/api';
import './AdminPendingApprovals.css';

const AdminPendingApprovals = () => {
  const [activeTab, setActiveTab] = useState('approvals'); // 'approvals' | 'active'
  const navigate = useNavigate();

  const [pendingList, setPendingList] = useState([]);
  const [stats, setStats] = useState({
    total_members: 0,
    active_loans: 0,
    collected_this_month: 0,
    total_overdue: 0
  });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const pendingRes = await fetch(apiUrl('/loan/loan-applications/admin_pending_list/'));
        if (pendingRes.ok) {
          const pendingData = await pendingRes.json();
          setPendingList(pendingData);
        }

        const statsRes = await fetch(apiUrl('/loan/loans/admin_pending_stats/'));
        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats(statsData);
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
          {" > "}
          {activeTab === 'approvals'
            ? 'Menunggu Persetujuan'
            : 'Pengingat Pembayaran Pinjaman'}
        </div>
      </div>

      {/* <div className="apa-tabs">
        <button
          className={`apa-tab ${activeTab === 'approvals' ? 'active' : ''}`}
          onClick={() => setActiveTab('approvals')}
        >
          Loan Approvals
        </button>
      </div> */}

      {activeTab === 'approvals' && (
        <div className="apa-approvals-content">
          {pendingList.map((item, idx) => (
            <div key={idx} className="apa-approval-card">
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
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminPendingApprovals;
