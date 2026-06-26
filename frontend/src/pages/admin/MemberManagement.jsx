import React, { useState, useEffect } from 'react';
import { Search, ChevronRight, Loader2, Users, PiggyBank, Building2, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { apiUrl } from '../../services/api';
import './MemberManagement.css';
import '../../styles/members.css';

const MemberManagement = () => {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    fetchDepartments();
    fetchMembers();
  }, []);

  useEffect(() => {
    filterMembers();
  }, [searchTerm, departmentFilter, members]);
  useEffect(() => {
    filterMembers();
  }, [activeFilter]);

  const fetchDepartments = async () => {
    try {
      const res = await fetch(apiUrl('/member/departments/'));
      if (res.ok) {
        const data = await res.json();
        setDepartments(data);
      }
    } catch (error) {
      console.error('Failed to fetch departments:', error);
    }
  };

  const fetchMembers = async () => {
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/member/members/'));
      if (res.ok) {
        const data = await res.json();
        setMembers(data);
      }
    } catch (error) {
      console.error('Failed to fetch members:', error);
    } finally {
      setLoading(false);
    }
  };

  const filterMembers = () => {
    let filtered = members;

    if (searchTerm) {
      filtered = filtered.filter(m =>
        m.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        m.nik_employee?.includes(searchTerm)
      );
    }

    if (departmentFilter !== 'all') {
      filtered = filtered.filter(m => m.department_name === departmentFilter);
    }

    if (activeFilter !== 'all') {
      if (activeFilter === 'active') {
        filtered = filtered.filter(m => m.user_is_active === true || m.user_is_active === 't' || m.user_is_active === 1);
      } else if (activeFilter === 'inactive') {
        filtered = filtered.filter(m => m.user_is_active === false || m.user_is_active === 'f' || m.user_is_active === 0);
      }
    }

    setFilteredMembers(filtered);
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('id-ID', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatRupiah = (number) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0
    }).format(number || 0).replace(',00', '');
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name
      .trim()
      .split(/\s+/)
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const handleDetail = (id) => {
    navigate(`/dashboard/admin/members/${id}?source=member-management`);
  };

  // Stats Calculations
  const totalMembers = members.length;
  const totalSavings = members.reduce((sum, m) => sum + (parseFloat(m.total_saving) || 0), 0);
  const totalDepartments = departments.length;
  const avgSavings = totalMembers > 0 ? (totalSavings / totalMembers) : 0;

  return (
    <div className="mm-container">
      <div className="mm-header-section">
        <h1 className="mm-header-title">Member Management</h1>
        <p className="mm-header-subtitle">Kelola dan pantau informasi keanggotaan koperasi secara real-time</p>
      </div>

      {/* Stats Cards Section */}
      <div className="mm-stats-grid">
        <div className="mm-stat-card">
          <div className="mm-stat-icon-wrapper blue">
            <Users size={20} />
          </div>
          <div className="mm-stat-info">
            <span className="mm-stat-label">Total Members</span>
            <strong className="mm-stat-value">{totalMembers}</strong>
          </div>
        </div>

        <div className="mm-stat-card">
          <div className="mm-stat-icon-wrapper green">
            <PiggyBank size={20} />
          </div>
          <div className="mm-stat-info">
            <span className="mm-stat-label">Total Savings</span>
            <strong className="mm-stat-value">{formatRupiah(totalSavings)}</strong>
          </div>
        </div>

        <div className="mm-stat-card">
          <div className="mm-stat-icon-wrapper purple">
            <Building2 size={20} />
          </div>
          <div className="mm-stat-info">
            <span className="mm-stat-label">Departments</span>
            <strong className="mm-stat-value">{totalDepartments}</strong>
          </div>
        </div>

        <div className="mm-stat-card">
          <div className="mm-stat-icon-wrapper orange">
            <TrendingUp size={20} />
          </div>
          <div className="mm-stat-info">
            <span className="mm-stat-label">Average Savings</span>
            <strong className="mm-stat-value">{formatRupiah(avgSavings)}</strong>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="mm-table-wrapper">
        <div className="mm-table-controls">
          <div className="mm-search">
            <Search size={18} />
            <input
              type="text"
              placeholder="Search by name, email, or NIK..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="mm-filter-wrapper">
            <select
              className="mm-filter"
              value={departmentFilter}
              onChange={(e) => setDepartmentFilter(e.target.value)}
            >
              <option value="all">All Departments</option>
              {departments.map(dept => (
                <option key={dept.id} value={dept.department_name}>
                  {dept.department_name}
                </option>
              ))}
            </select>
            <select
              className="mm-filter mm-filter-active"
              value={activeFilter}
              onChange={(e) => setActiveFilter(e.target.value)}
              style={{ marginLeft: 12 }}
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="mm-loading-container">
            <Loader2 className="spinner mm-spinner" size={32} />
            <p>Memuat data anggota...</p>
          </div>
        ) : (
          <div className="mm-table-scroll">
            <table className="mm-table">
              <thead style={{ background: 'linear-gradient(135deg, #3b82f6, #2563eb)' }}>
                <tr>
                  <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Nama & Email</th>
                  <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>NIK Karyawan</th>
                  <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Departemen</th>
                  <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Tanggal Bergabung</th>
                  <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Nomor Telepon</th>
                  <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none' }}>Total Tabungan</th>
                  <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none', textAlign: 'center' }}>Status</th>
                  <th style={{ color: '#ffffff', background: 'transparent', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', fontSize: '0.75rem', padding: '1rem', borderBottom: 'none', textAlign: 'center' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredMembers.length > 0 ? (
                  filteredMembers.map((member) => (
                    <tr 
                      key={member.id} 
                      onClick={() => handleDetail(member.id)}
                      className="mm-table-row-clickable"
                    >
                      <td>
                        <div className="mm-user-cell">
                          <div className="mm-avatar">
                            {getInitials(member.full_name)}
                          </div>
                          <div className="mm-user-meta">
                            <span className="mm-user-name">{member.full_name}</span>
                            <span className="mm-user-sub">{member.email}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="mm-nik-badge">{member.nik_employee || '-'}</span>
                      </td>
                      <td>
                        <span className="mm-dept-badge">{member.department_name || '-'}</span>
                      </td>
                      <td>{formatDate(member.join_date)}</td>
                      <td>{member.phone_number || '-'}</td>
                      <td className="total font-semibold">{formatRupiah(member.total_saving)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span className={`mm-status-badge ${member.user_is_active ? 'mm-status-active' : 'mm-status-inactive'}`}>
                          {member.user_is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                        <button 
                          className="btn-icon-detail" 
                          onClick={() => handleDetail(member.id)}
                          title="Lihat Detail Anggota"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan="8" className="mm-no-data">
                      Tidak ada anggota yang ditemukan
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default MemberManagement;

