import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Loader2 } from 'lucide-react';
import { apiUrl } from '../../services/api';
import './MemberApprovals.css';

const MemberApprovals = () => {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('new'); // 'new' | 'close'
  const [filterStatus, setFilterStatus] = useState('3'); // Status filter for new members only
  const [closeFilterStatus, setCloseFilterStatus] = useState('44'); // Status filter for close account
  const [registrations, setRegistrations] = useState([]);
  const [closeRequests, setCloseRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter options for new member dropdown
  const FILTER_OPTIONS = [
    { value: '3', label: 'REGIST_COMPLETE' },
    { value: '5', label: 'REJECT' },
    { value: '6', label: 'PAYMENT_PRINCIPLE' },
    { value: '7', label: 'APPROVE_KOPERASI' }
  ];

  // Filter options for close account dropdown
  const CLOSE_FILTER_OPTIONS = [
    { value: '44', label: 'SUBMIT' },
    { value: '45', label: 'APPROVED' },
    { value: '46', label: 'REJECT' }
  ];

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/member/members/pending_registrations/'));
      if (res.ok) {
        const data = await res.json();
        setRegistrations(data);
      }

      const resClose = await fetch(apiUrl('/member/members/pending_close_accounts/'));
      if (resClose.ok) {
        const data = await resClose.json();
        setCloseRequests(data);
      }
    } catch (error) {
      console.error('Failed to fetch data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(number || 0);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('id-ID');
  };

  // Filter registrations based on status filter and search
  const getFilteredRegistrations = () => {
    const filtered = registrations.filter(r => r.status_id === Number(filterStatus));

    return filtered.filter(r =>
      r.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const filteredRegistrations = getFilteredRegistrations();

  // Filter close requests based on status filter and search
  const getFilteredCloseRequests = () => {
    const filtered = closeRequests.filter(c => c.status_id === Number(closeFilterStatus));

    return filtered.filter(c =>
      c.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.email?.toLowerCase().includes(searchTerm.toLowerCase())
    );
  };

  const filteredCloseRequests = getFilteredCloseRequests();

  return (
    <div className="ma-container">
      <div className="ma-header">
        <div className="ma-tabs">
          <button 
            className={`ma-tab-btn ${activeSection === 'new' ? 'active' : ''}`}
            onClick={() => setActiveSection('new')}
          >
            Persetujuan Member Baru
          </button>
          <button 
            className={`ma-tab-btn ${activeSection === 'close' ? 'active' : ''}`}
            onClick={() => setActiveSection('close')}
          >
            Close Account
          </button>
        </div>
        <h1 className="ma-title">
          {activeSection === 'new' ? 'Persetujuan Member Baru' : 'Permintaan Close Akun'}
        </h1>
      </div>

      <div className="ma-content-wrapper">
        <div className="ma-notif-header">
          <h2 className="ma-notif-title">Notifikasi</h2>
          
          <div className="ma-controls">
            {activeSection === 'new' && (
              <select 
                className="ma-filter-dropdown"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
              >
                {FILTER_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}

            {activeSection === 'close' && (
              <select 
                className="ma-filter-dropdown"
                value={closeFilterStatus}
                onChange={(e) => setCloseFilterStatus(e.target.value)}
              >
                {CLOSE_FILTER_OPTIONS.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            )}

            <div className="ma-search">
              <Search size={16} />
              <input 
                type="text" 
                placeholder="Cari berdasarkan nama atau email..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="ma-table-wrapper">
          {loading ? (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <Loader2 className="spinner" size={24} />
              <p>Memuat data...</p>
            </div>
          ) : (
            <table className="ma-table">
              <thead style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                {activeSection === 'close' ? (
                  <tr>
                    <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Nama</th>
                    <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>NIK Karyawan</th>
                    <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Alasan</th>
                    <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Tanggal Permintaan</th>
                    <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Status</th>
                    <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Total Diterima</th>
                    <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Aksi</th>
                  </tr>
                ) : (
                  <tr>
                    <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Nama</th>
                    <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>NIK</th>
                    <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Email</th>
                    <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Telepon</th>
                    <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Departemen</th>
                    <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Tanggal Pendaftaran</th>
                    <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Aksi</th>
                  </tr>
                )}
              </thead>
              <tbody>
                {activeSection === 'close' ? (
                  filteredCloseRequests.length > 0 ? (
                    filteredCloseRequests.map((req) => (
                      <tr key={req.id}>
                        <td>{req.full_name}</td>
                        <td>{req.nik_employee}</td>
                        <td>{req.reason}</td>
                        <td>{formatDate(req.request_date)}</td>
                        <td>{req.status}</td>
                        <td>{formatRupiah(req.total_amount_to_receive)}</td>
                        <td>
                          <button className="btn-ma-detail" onClick={() => navigate(`/dashboard/admin/approvals/${req.id}?type=close`)}>Lihat Detail</button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>Tidak ada permintaan close akun</td></tr>
                  )
                ) : (
                  filteredRegistrations.length > 0 ? (
                    filteredRegistrations.map((reg) => (
                      <tr key={reg.id}>
                        <td>{reg.full_name}</td>
                        <td>{reg.nik}</td>
                        <td>{reg.email}</td>
                        <td>{reg.phone_number}</td>
                        <td>{reg.department_name || '-'}</td>
                        <td>{formatDate(reg.created_at)}</td>
                        <td>
                          <button className="btn-ma-detail" onClick={() => navigate(`/dashboard/admin/approvals/${reg.id}?type=new`)}>Lihat Detail</button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr><td colSpan="7" style={{ textAlign: 'center', padding: '2rem' }}>Tidak ada permintaan pendaftaran</td></tr>
                  )
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* Pagination */}
        <div className="ma-pagination">
          <div style={{ marginLeft: 'auto' }}>
            {activeSection === 'close' ? `${filteredCloseRequests.length} permintaan` : `${filteredRegistrations.length} pendaftaran`}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemberApprovals;
