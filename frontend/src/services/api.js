// Base API service to connect frontend with Django backend
const rawApiUrl = import.meta.env.VITE_API_URL || '/api/v1';
const trimmedApiUrl = rawApiUrl.replace(/\/$/, '');
export const API_URL = trimmedApiUrl.endsWith('/api') ? `${trimmedApiUrl}/v1` : trimmedApiUrl;
export const API_ORIGIN = API_URL.replace(/\/api$/, '');

export const apiUrl = (path = '') => {
  if (!path) return API_URL;
  return `${API_URL}${path.startsWith('/') ? '' : '/'}${path}`;
};

export const getAuthHeaders = () => {
  try {
    const userStr = localStorage.getItem('user');
    if (!userStr) return {};
    const user = JSON.parse(userStr);
    const headers = {};
    if (user.member_id) headers['X-MEMBER-ID'] = String(user.member_id);
    if (user.email) headers['X-USER-EMAIL'] = String(user.email);
    return headers;
  } catch (e) {
    return {};
  }
};

export const fetchHello = async () => {
  try {
    const response = await fetch(apiUrl('/hello/'));
    if (!response.ok) throw new Error('Network response was not ok');
    return await response.json();
  } catch (error) {
    console.error('API Connection Error:', error);
    throw error;
  }
};

export const fetchAdminDashboardOverview = async () => {
  try {
    const response = await fetch(apiUrl('/admin/dashboard/overview/'), { headers: getAuthHeaders() });
    return await handleJsonResponse(response);
  } catch (error) {
    console.error('Dashboard overview fetch error:', error);
    throw error;
  }
};

export const fetchAdminDashboardNetSales = async (range = '3month') => {
  try {
    const url = apiUrl(`/admin/shu/net-sales/?range=${encodeURIComponent(range)}`);
    const response = await fetch(url, { headers: getAuthHeaders() });
    return await handleJsonResponse(response);
  } catch (error) {
    console.error('Dashboard net sales fetch error:', error);
    throw error;
  }
};

export const fetchAdminDashboardWeeklyCashflow = async (range = '3month') => {
  try {
    const url = apiUrl(`/admin/shu/weekly-cashflow/?range=${encodeURIComponent(range)}`);
    const response = await fetch(url, { headers: getAuthHeaders() });
    return await handleJsonResponse(response);
  } catch (error) {
    console.error('Dashboard weekly cashflow fetch error:', error);
    throw error;
  }
};

const handleJsonResponse = async (response) => {
  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error || payload?.detail || 'Request failed';
    throw new Error(message);
  }
  return payload;
};

export const fetchDocumentArchives = async (typeId) => {
  const params = new URLSearchParams();
  if (typeId) params.append('type_id', typeId);

  const suffix = params.toString() ? `?${params.toString()}` : '';
  const response = await fetch(apiUrl(`/documents/${suffix}`), { headers: getAuthHeaders() });
  return handleJsonResponse(response);
};

export const fetchDocumentTypes = async () => {
  const response = await fetch(apiUrl('/document-types/'), { headers: getAuthHeaders() });
  return handleJsonResponse(response);
};

export const uploadDocumentArchive = async (formData) => {
  const response = await fetch(apiUrl('/documents/'), {
    method: 'POST',
    body: formData,
    headers: getAuthHeaders(),
  });
  return handleJsonResponse(response);
};
