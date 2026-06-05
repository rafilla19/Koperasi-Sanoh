import React, { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, Wallet, CreditCard, FileText, UserCircle, LogOut, Menu, ChevronLeft, ChevronRight, Users, CheckSquare, Database, Archive } from 'lucide-react';
import logoImg from '../assets/logo.png';
import './DashboardLayout.css';
import { fetchWASettings } from '../services/waApi';

const DashboardLayout = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  // Get user data from localStorage
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;

  // Basic Auth Guard
  React.useEffect(() => {
    if (!user) {
      navigate('/login');
    }
  }, [user, navigate]);

  if (!user) return null;

  const roleId = parseInt(user.role_id);

  // Admin Accordion state
  const [openSections, setOpenSections] = useState({
    member: false,
    ls: false,
    pr: false,
    shu: false,
    transaction: false,
  });

  const toggleSection = (sec) => {
    setOpenSections(prev => ({ ...prev, [sec]: !prev[sec] }));
  };

  // WhatsApp menu state
  const [showWAMenu, setShowWAMenu] = useState(false);
  const [waQuestions, setWaQuestions] = useState([]);
  const [waPhone, setWaPhone] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchWASettings();
        if (cancelled) return;
        setWaQuestions(data?.questions || []);
        const phone = (data?.phone_number || '').replace(/\D/g, '');
        setWaPhone(phone || '');
      } catch (e) {
        // ignore
      }
    };
    if (roleId === 2) load();
    return () => { cancelled = true; };
  }, [roleId]);

  const handleLogout = () => {
    localStorage.removeItem('user');
    navigate('/login');
  };

  const currentPath = location.pathname;
  let title = 'Portal Dashboard';
  let breadcrumb = 'Overview';
  // Admin-specific page titles
  if (currentPath.includes('/dashboard/admin/archives')) {
    title = 'Document Archives';
    breadcrumb = 'Admin / Archives';  } else if (currentPath.includes('/dashboard/admin/whatsapp-settings')) {
    title = 'WhatsApp Settings';
    breadcrumb = 'Admin / WA Settings';  } else if (currentPath.includes('/dashboard/admin/transaction/history')) {
    title = 'Transaction History';
    breadcrumb = 'Admin / Transaction';
  } else if (currentPath.includes('/dashboard/admin/transaction/manual')) {
    title = 'Manual Payment';
    breadcrumb = 'Admin / Transaction';
  } else if (currentPath.includes('/dashboard/admin/shu-master')) {
    title = 'Master Data Management';
    breadcrumb = 'Admin / SHU';
  } else if (currentPath.includes('/dashboard/admin/pr-loans')) {
    title = 'Payroll Loans';
    breadcrumb = 'Admin / Payroll';
  } else if (currentPath.includes('/dashboard/admin/pr-savings')) {
    title = 'Payroll Savings';
    breadcrumb = 'Admin / Payroll';
  } else if (currentPath.includes('/dashboard/admin/members')) {
    title = 'Member Management';
    breadcrumb = 'Admin / Member';
  } else if (currentPath.includes('/dashboard/admin/approvals')) {
    title = 'Member Approvals';
    breadcrumb = 'Admin / Member';
  } else if (currentPath.includes('/dashboard/admin/savings-management') || currentPath.includes('/admin/savings-management')) {
    title = 'Savings Management';
    breadcrumb = 'Admin / Savings';
  } else if (currentPath.includes('/dashboard/admin/mandatory-savings') || currentPath.includes('/admin/mandatory-savings')) {
    title = 'Savings Obligations';
    breadcrumb = 'Admin / Savings';
  } else if (currentPath.includes('/dashboard/admin/voluntary-savings') || currentPath.includes('/admin/voluntary-savings')) {
    title = 'Voluntary Savings';
    breadcrumb = 'Admin / Savings';
  } else if (currentPath.includes('/dashboard/admin/ls-savings') || currentPath.includes('/admin/ls-savings')) {
    title = 'Savings Dashboard';
    breadcrumb = 'Admin / Savings';
  } else if (currentPath.includes('/admin/ls-loans')) {
    title = 'Admin Loans Dashboard';
    breadcrumb = 'Admin / Loans';
  } else if (currentPath.includes('/saving')) {
    title = 'My Saving';
    breadcrumb = 'My Saving';
  } else if (currentPath.includes('/loans')) {
    title = 'My Loans';
    breadcrumb = 'My Loans';
  } else if (currentPath.includes('/terms')) {
    title = 'Terms & Conditions';
    breadcrumb = 'Terms & Conditions';
  } else if (currentPath.includes('/profile')) {
    title = 'My Profile';
    breadcrumb = 'My Profile';
  }

  return (
    <div className="dl-app">
      {/* Mobile Overlay */}
      <div
        className={`dl-sidebar-overlay ${isSidebarOpen ? 'open' : ''}`}
        onClick={() => setIsSidebarOpen(false)}
      ></div>

      {/* ─── SIDEBAR ─────────────────────────────────────────── */}
      <aside className={`dl-sidebar ${isSidebarOpen ? 'open' : ''} ${isCollapsed ? 'collapsed' : ''}`}>

        {/* Collapse Trigger */}
        <button
          className="dl-collapse-trigger"
          onClick={() => setIsCollapsed(!isCollapsed)}
        >
          {isCollapsed ? <ChevronRight size={14} strokeWidth={3} /> : <ChevronLeft size={14} strokeWidth={3} />}
        </button>

        <div className="dl-sb-logo">
          <img src={logoImg} alt="Logo" className="dl-sb-logo-img" />
          <div className="dl-sb-logo-text">
            <strong>KOPERASI SANOH</strong>
            <span>SINERGI BERSAMA</span>
          </div>
        </div>

        <nav className="dl-sb-nav">
          {roleId === 2 && (
            <>
              <div className="dl-sb-lbl">MAIN MENU</div>
              <NavLink to="/dashboard" end className={({ isActive }) => `dl-sb-item ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)} title="Dashboard">
                <div className="dl-sb-dot"></div>
                <LayoutDashboard size={17} strokeWidth={2} />
                <span className="dl-sb-item-text">Dashboard</span>
              </NavLink>
              <NavLink to="/dashboard/saving" className={({ isActive }) => `dl-sb-item ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)} title="My Saving">
                <div className="dl-sb-dot"></div>
                <Wallet size={17} strokeWidth={2} />
                <span className="dl-sb-item-text">My Saving</span>
              </NavLink>
              <NavLink to="/dashboard/loans" className={({ isActive }) => `dl-sb-item ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)} title="My Loans">
                <div className="dl-sb-dot"></div>
                <CreditCard size={17} strokeWidth={2} />
                <span className="dl-sb-item-text">My Loans</span>
              </NavLink>
              <NavLink to="/dashboard/terms" className={({ isActive }) => `dl-sb-item ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)} title="Terms & Conditions">
                <div className="dl-sb-dot"></div>
                <FileText size={17} strokeWidth={2} />
                <span className="dl-sb-item-text">Terms & Conditions</span>
              </NavLink>

              <div className="dl-sb-lbl" style={{ marginTop: 16 }}>ACCOUNT</div>
              <NavLink to="/dashboard/profile" className={({ isActive }) => `dl-sb-item ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)} title="My Profile">
                <div className="dl-sb-dot"></div>
                <UserCircle size={17} strokeWidth={2} />
                <span className="dl-sb-item-text">My Profile</span>
              </NavLink>
            </>
          )}

          {roleId === 1 && (
            <>
              {/* ADMIN MENU (Temporary combined layout) */}
              <div className="dl-sb-lbl" style={{ marginTop: 24 }}>ADMIN OVERVIEW</div>
              <NavLink to="/dashboard" end className={({ isActive }) => `dl-sb-item ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                <div className="dl-sb-dot"></div>
                <LayoutDashboard size={17} strokeWidth={2} />
                <span className="dl-sb-item-text">Dashboard</span>
              </NavLink>

              <div className="dl-sb-group">
                <button className={`dl-sb-parent ${openSections.member ? 'active' : ''}`} onClick={() => toggleSection('member')}>
                  <div className="dl-sb-parent-left">
                    <div className="dl-sb-parent-icon"><Users size={17} strokeWidth={2} /></div>
                    <span className="dl-sb-item-text" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Member</span>
                  </div>
                </button>
                <div className={`dl-sb-children ${openSections.member ? 'open' : ''}`}>
                  <NavLink to="/dashboard/admin/members" className={({ isActive }) => `dl-sb-child ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                    Management
                  </NavLink>
                  <NavLink to="/dashboard/admin/approvals" className={({ isActive }) => `dl-sb-child ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                    Approvals
                  </NavLink>
                </div>
              </div>

              <div className="dl-sb-group">
                <button className={`dl-sb-parent ${openSections.ls ? 'active' : ''}`} onClick={() => toggleSection('ls')}>
                  <div className="dl-sb-parent-left">
                    <div className="dl-sb-parent-icon"><Wallet size={17} strokeWidth={2} /></div>
                    <span className="dl-sb-item-text" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Loans & Saving</span>
                  </div>
                </button>
                <div className={`dl-sb-children ${openSections.ls ? 'open' : ''}`}>
                  <NavLink to="/dashboard/admin/ls-loans" className={({ isActive }) => `dl-sb-child ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                    Loans
                  </NavLink>
                  <NavLink to="/dashboard/admin/ls-savings" className={({ isActive }) => `dl-sb-child ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                    Savings
                  </NavLink>
                </div>
              </div>

              <div className="dl-sb-group">
                <button className={`dl-sb-parent ${openSections.pr ? 'active' : ''}`} onClick={() => toggleSection('pr')}>
                  <div className="dl-sb-parent-left">
                    <div className="dl-sb-parent-icon"><CreditCard size={17} strokeWidth={2} /></div>
                    <span className="dl-sb-item-text" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Payroll</span>
                  </div>
                </button>
                <div className={`dl-sb-children ${openSections.pr ? 'open' : ''}`}>
                  <NavLink to="/dashboard/admin/pr-loans" className={({ isActive }) => `dl-sb-child ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                    Loans
                  </NavLink>
                  <NavLink to="/dashboard/admin/pr-savings" className={({ isActive }) => `dl-sb-child ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                    Savings
                  </NavLink>
                </div>
              </div>

              <div className="dl-sb-group">
                <button className={`dl-sb-parent ${openSections.shu ? 'active' : ''}`} onClick={() => toggleSection('shu')}>
                  <div className="dl-sb-parent-left">
                    <div className="dl-sb-parent-icon"><LayoutDashboard size={17} strokeWidth={2} /></div>
                    <span className="dl-sb-item-text" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>SHU Management</span>
                  </div>
                </button>
                <div className={`dl-sb-children ${openSections.shu ? 'open' : ''}`}>
                  <NavLink to="/dashboard/admin/shu-dashboard" className={({ isActive }) => `dl-sb-child ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                    Dashboard
                  </NavLink>
                  <NavLink to="/dashboard/admin/shu-master" className={({ isActive }) => `dl-sb-child ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                    Master Data
                  </NavLink>
                </div>
              </div>

              <div className="dl-sb-lbl" style={{ marginTop: 16 }}>GENERAL</div>

              <div className="dl-sb-group">
                <button className={`dl-sb-parent ${openSections.transaction ? 'active' : ''}`} onClick={() => toggleSection('transaction')}>
                  <div className="dl-sb-parent-left">
                    <div className="dl-sb-parent-icon"><CheckSquare size={17} strokeWidth={2} /></div>
                    <span className="dl-sb-item-text" style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>Transaction</span>
                  </div>
                </button>
                <div className={`dl-sb-children ${openSections.transaction ? 'open' : ''}`}>
                  <NavLink to="/dashboard/admin/transaction/history" className={({ isActive }) => `dl-sb-child ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                    History
                  </NavLink>
                  <NavLink to="/dashboard/admin/transaction/manual" className={({ isActive }) => `dl-sb-child ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                    Manual Payment
                  </NavLink>
                </div>
              </div>

              <NavLink to="/dashboard/admin/archives" className={({ isActive }) => `dl-sb-item ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                <div className="dl-sb-dot"></div>
                <Archive size={17} strokeWidth={2} />
                <span className="dl-sb-item-text">Archives</span>
              </NavLink>

              <NavLink to="/dashboard/admin/whatsapp-settings" className={({ isActive }) => `dl-sb-item ${isActive ? 'active' : ''}`} onClick={() => setIsSidebarOpen(false)}>
                <div className="dl-sb-dot"></div>
                <span className="dl-sb-item-text" style={{ fontSize: 14 }}>WA Settings</span>
              </NavLink>
            </>
          )}
        </nav>

        <div className="dl-sb-footer">
          <button className="dl-sb-item logout" onClick={handleLogout} title="Log Out">
            <LogOut size={17} strokeWidth={2} />
            <span className="dl-sb-item-text" style={{ fontWeight: 700 }}>Log Out</span>
          </button>
        </div>
      </aside>

      {/* ─── MAIN CONTENT ────────────────────────────────────── */}
      <div className="dl-main-wrap">
        <header className="dl-header">
          <div className="dl-hdr-left">
            <button className="dl-mobile-toggle" onClick={() => setIsSidebarOpen(true)}>
              <Menu size={20} strokeWidth={2.5} />
            </button>
            <span className="dl-hdr-title">{title}</span>
            {/* <span className="dl-hdr-breadcrumb">Home / <span>{breadcrumb}</span></span> */}
          </div>

          <div className="dl-hdr-right">

            {roleId === 1 ? (
              <div className="dl-avatar-btn admin-view" style={{ cursor: 'default' }}>
                <div className="dl-avatar" style={{ background: 'linear-gradient(135deg, #4880F0, #1e3a8a)', color: '#ffffff' }}>
                  AD
                </div>
                <div className="dl-avatar-info hidden-mobile">
                  <div className="dl-avatar-name" style={{ fontWeight: 600, color: '#1e293b' }}>{user.email}</div>
                  <div className="dl-avatar-id" style={{ color: '#4880F0', fontWeight: 600 }}>Admin Account</div>
                </div>
              </div>
            ) : (
              <button className="dl-avatar-btn" onClick={() => navigate('/dashboard/profile')}>
                <div className="dl-avatar">
                  {user.full_name ? user.full_name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) : 'U'}
                </div>
                <div className="dl-avatar-info hidden-mobile">
                  <div className="dl-avatar-name">{user.full_name || user.email}</div>
                  <div className="dl-avatar-id">
                    {`ID: ${user.nik_employee || 'N/A'}`}
                  </div>
                </div>
              </button>
            )}
          </div>
        </header>

        <main className="dl-content">
          <Outlet />
        </main>
      </div>

      {/* Floating WhatsApp */}
      {!currentPath.includes('/admin') && roleId === 2 && (
        <div className="dl-wa-wrapper">
          {showWAMenu && (
            <>
              <div className="dl-wa-backdrop" onClick={() => setShowWAMenu(false)} />
              <div className="dl-wa-menu">
                <div className="dl-wa-menu-header">
                  <svg viewBox="0 0 32 32" width="18" height="18" fill="#25D366" xmlns="http://www.w3.org/2000/svg">
                    <path d="M16 2C8.3 2 2 8.3 2 16c0 2.5.7 4.8 1.8 6.8L2 30l7.4-1.8C11.3 29.3 13.6 30 16 30c7.7 0 14-6.3 14-14S23.7 2 16 2zm-3.7 7.5c-.3 0-.7.1-1 .5-.3.3-1.1 1.1-1.1 2.6s1.1 3 1.3 3.2c.2.2 2.2 3.5 5.4 4.8 3.2 1.3 3.2.8 3.7.8.5 0 1.7-.7 1.9-1.3.2-.6.2-1.2.1-1.3-.1-.1-.3-.2-.6-.3-.3-.2-1.7-.8-1.9-.9-.2-.1-.4-.2-.6.2-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.5-1.3-.8-1.8c-.2-.4-.5-.4-.7-.4z" />
                  </svg>
                  <span>Tanya Admin Koperasi</span>
                </div>
                <p className="dl-wa-menu-sub">Pilih pertanyaan di bawah ini, kita bantu jawab via WhatsApp!</p>
                <ul className="dl-wa-menu-list">
                  {waQuestions.map((q) => (
                    <li key={q.id}>
                      <a
                        href={`https://wa.me/${waPhone}?text=${encodeURIComponent(q.message)}`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={() => setShowWAMenu(false)}
                        className="dl-wa-menu-item"
                      >
                        <span className="dl-wa-menu-item-icon">💬</span>
                        {q.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
          <button
            className={`dl-floating-wa ${showWAMenu ? 'active' : ''}`}
            onClick={() => setShowWAMenu(v => !v)}
            aria-label="Chat dengan Admin via WhatsApp"
          >
            {showWAMenu ? (
              <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" xmlns="http://www.w3.org/2000/svg">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            ) : (
              <svg viewBox="0 0 32 32" width="26" height="26" fill="white" xmlns="http://www.w3.org/2000/svg">
                <path d="M16 2C8.3 2 2 8.3 2 16c0 2.5.7 4.8 1.8 6.8L2 30l7.4-1.8C11.3 29.3 13.6 30 16 30c7.7 0 14-6.3 14-14S23.7 2 16 2zm-3.7 7.5c-.3 0-.7.1-1 .5-.3.3-1.1 1.1-1.1 2.6s1.1 3 1.3 3.2c.2.2 2.2 3.5 5.4 4.8 3.2 1.3 3.2.8 3.7.8.5 0 1.7-.7 1.9-1.3.2-.6.2-1.2.1-1.3-.1-.1-.3-.2-.6-.3-.3-.2-1.7-.8-1.9-.9-.2-.1-.4-.2-.6.2-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.5-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5s-.5-1.3-.8-1.8c-.2-.4-.5-.4-.7-.4z" />
              </svg>
            )}
          </button>
        </div>
      )}
    </div>
  );
};

export default DashboardLayout;

