import React from 'react';
import { Navigate } from 'react-router-dom';
import DashboardHome from '../pages/member/DashboardHome';
import AdminDashboard from '../pages/admin/AdminDashboard';

const DashboardIndex = () => {
  const userStr = localStorage.getItem('user');
  const user = userStr ? JSON.parse(userStr) : null;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  const roleId = parseInt(user.role_id);

  if (roleId === 1) {
    return <AdminDashboard />;
  }

  return <DashboardHome />;
};

export default DashboardIndex;
