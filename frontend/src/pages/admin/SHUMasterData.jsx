import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, Building, Percent, CreditCard, Wallet, Tags } from 'lucide-react';
import { apiUrl } from '../../services/api';
import './SHUManagement.css';

const TABS = [
  { id: 'shu', label: 'Komponen SHU', icon: Percent, apiUrl: apiUrl('/master/shu-components/') },
  { id: 'dept', label: 'Departemen', icon: Building, apiUrl: apiUrl('/master/departments/') },
  { id: 'loan_type', label: 'Jenis Pinjaman', icon: CreditCard, apiUrl: apiUrl('/loan/loan-types/') },
  { id: 'payment_channel', label: 'Kanal Pembayaran', icon: Wallet, apiUrl: apiUrl('/master/payment-channels/') },
  { id: 'inc_exp_cat', label: 'Kategori Masuk/Keluar', icon: Tags, apiUrl: apiUrl('/master/income-expense-categories/') },
];

const SHUMasterData = () => {
  const [activeTab, setActiveTab] = useState('shu');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  
  const [formData, setFormData] = useState({
    // SHU fields
    component_name: '',
    percentage: '',
    distributed_member: false,
    // Dept fields
    department_name: '',
    // Loan type fields
    name: '',
    // Payment channel fields
    channel_code: '',
    channel_name: '',
    fee_percentage: '',
    fee_fixed: '',
    is_active: true,
    // Income/Expense Category fields
    category_name: '',
    type: 'INCOME',
  });

  const currentTab = TABS.find(t => t.id === activeTab);

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(currentTab.apiUrl);
      if (res.ok) {
        const result = await res.json();
        setData(result);
      }
    } catch (err) {
      console.error(`Error fetching ${activeTab}:`, err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    
    // Custom validation for SHU
    if (activeTab === 'shu') {
      const newPercentage = parseFloat(formData.percentage);
      const totalPercentage = data.reduce((sum, item) => sum + parseFloat(item.percentage || 0), 0);
      let currentTotalWithoutThis = totalPercentage;
      
      if (editingId) {
        const editingItem = data.find(t => t.id === editingId);
        currentTotalWithoutThis -= parseFloat(editingItem.percentage || 0);
      }

      if (currentTotalWithoutThis + newPercentage > 100.001) {
        alert(`Tidak dapat menyimpan. Total distribusi akan melebihi 100%`);
        return;
      }
    }

    const method = editingId ? 'PUT' : 'POST';
    const url = editingId ? `${currentTab.apiUrl}${editingId}/` : currentTab.apiUrl;

    // Prepare payload based on tab
    let payload = {};
    if (activeTab === 'shu') {
      payload = {
        component_name: formData.component_name,
        percentage: formData.percentage,
        distributed_member: formData.distributed_member
      };
    } else if (activeTab === 'dept') {
      payload = { department_name: formData.department_name };
    } else if (activeTab === 'loan_type') {
      payload = { name: formData.name };
    } else if (activeTab === 'payment_channel') {
      payload = { 
        channel_code: formData.channel_code, 
        channel_name: formData.channel_name, 
        fee_percentage: formData.fee_percentage, 
        fee_fixed: formData.fee_fixed, 
        is_active: formData.is_active 
      };
    } else if (activeTab === 'inc_exp_cat') {
      payload = {
        category_name: formData.category_name,
        type: formData.type,
      };
    }

    try {
      const res = await fetch(url, {
        method: method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        fetchData();
        resetForm();
      } else {
        const errorText = await res.text();
        try {
          const errorData = JSON.parse(errorText);
          alert(errorData?.detail || errorData?.error || 'Gagal menyimpan. Silakan periksa data Anda.');
        } catch {
          alert('Gagal menyimpan. Silakan periksa data Anda.');
        }
      }
    } catch (err) {
      console.error('Error saving:', err);
    }
  };

  const handleDelete = async (id) => {
    const confirmed = await window.appConfirm({
      title: 'Hapus item?',
      message: 'Apakah Anda yakin ingin menghapus item ini?',
      confirmText: 'Hapus',
      cancelText: 'Batal',
      variant: 'danger',
    });
    if (!confirmed) return;
    
    try {
      const res = await fetch(`${currentTab.apiUrl}${id}/`, { method: 'DELETE' });
      if (res.ok) fetchData();
    } catch (err) {
      console.error('Error deleting:', err);
    }
  };

  const startEdit = (item) => {
    setEditingId(item.id);
    if (activeTab === 'shu') {
      setFormData({
        component_name: item.component_name,
        percentage: item.percentage,
        distributed_member: item.distributed_member
      });
    } else if (activeTab === 'dept') {
      setFormData({ department_name: item.department_name });
    } else if (activeTab === 'loan_type') {
      setFormData({ name: item.name });
    } else if (activeTab === 'payment_channel') {
      setFormData({
        channel_code: item.channel_code,
        channel_name: item.channel_name,
        fee_percentage: item.fee_percentage,
        fee_fixed: item.fee_fixed,
        is_active: item.is_active
      });
    } else if (activeTab === 'inc_exp_cat') {
      setFormData({
        category_name: item.category_name,
        type: item.type || 'INCOME',
      });
    }
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      component_name: '', percentage: '', distributed_member: false,
      department_name: '', name: '',
      channel_code: '', channel_name: '', fee_percentage: '', fee_fixed: '', is_active: true,
      category_name: '', type: 'INCOME'
    });
    setEditingId(null);
    setShowForm(false);
  };

  const totalPercentage = activeTab === 'shu' 
    ? data.reduce((sum, item) => sum + parseFloat(item.percentage || 0), 0)
    : 0;

  return (
    <div className="shum-container">
      <div className="shum-header">
        <div>
          <h1 className="shum-title">Manajemen Data Master</h1>
          <p className="shum-subtitle">Konfigurasi data master dan pengaturan sistem</p>
        </div>
        {activeTab !== 'payment_channel' && (
          <button 
            className="shum-add-btn"
            onClick={() => { resetForm(); setShowForm(true); }}
          >
            <Plus size={18} /> Tambah
          </button>
        )}
      </div>

      <div className="shum-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`shum-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab.id); resetForm(); }}
          >
            <tab.icon size={16} style={{ marginRight: 8, verticalAlign: 'middle' }} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="shum-card">
        {showForm && (
          <div className="shum-form-overlay">
            <div className="shum-form-card">
              <div className="shum-form-header">
                <h3>{editingId ? 'Edit' : 'Tambah'} {currentTab.label}</h3>
                <button onClick={resetForm}><X size={20} /></button>
              </div>
              <form onSubmit={handleSave}>
                {activeTab === 'shu' && (
                  <>
                    <div className="shum-form-group">
                      <label>Nama Komponen</label>
                      <input
                        type="text"
                        value={formData.component_name}
                        onChange={(e) => setFormData({...formData, component_name: e.target.value})}
                        required
                      />
                    </div>
                    <div className="shum-form-group">
                      <label>Persentase (%)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={formData.percentage}
                        onChange={(e) => setFormData({...formData, percentage: e.target.value})}
                        required
                      />
                    </div>
                    <div className="shum-form-group checkbox">
                      <input 
                        type="checkbox" 
                        id="dist"
                        checked={formData.distributed_member}
                        onChange={(e) => setFormData({...formData, distributed_member: e.target.checked})}
                      />
                      <label htmlFor="dist">Didistribusikan ke Anggota</label>
                    </div>
                  </>
                )}

                {activeTab === 'dept' && (
                  <div className="shum-form-group">
                    <label>Nama Departemen</label>
                    <input 
                      type="text" 
                      value={formData.department_name}
                      onChange={(e) => setFormData({...formData, department_name: e.target.value})}
                      required
                    />
                  </div>
                )}

                {activeTab === 'loan_type' && (
                  <div className="shum-form-group">
                    <label>Nama Jenis Pinjaman</label>
                    <input 
                      type="text" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      required
                    />
                  </div>
                )}

                {activeTab === 'payment_channel' && (
                  <>
                    <div className="shum-form-group">
                      <label>Nama Kanal</label>
                      <input 
                        type="text" 
                        value={formData.channel_name}
                        disabled
                      />
                    </div>
                    <div className="shum-form-group">
                      <label>Persentase Biaya (%)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={formData.fee_percentage}
                        onChange={(e) => setFormData({...formData, fee_percentage: e.target.value})}
                        required
                      />
                    </div>
                    <div className="shum-form-group">
                      <label>Biaya Tetap (Rp)</label>
                      <input 
                        type="number" 
                        step="0.01"
                        value={formData.fee_fixed}
                        onChange={(e) => setFormData({...formData, fee_fixed: e.target.value})}
                        required
                      />
                    </div>
                  </>
                )}

                {activeTab === 'inc_exp_cat' && (
                  <>
                    <div className="shum-form-group">
                      <label>Nama Kategori</label>
                      <input 
                        type="text" 
                        value={formData.category_name}
                        onChange={(e) => setFormData({...formData, category_name: e.target.value})}
                        required
                      />
                    </div>
                    <div className="shum-form-group">
                      <label>Jenis</label>
                      <select
                        value={formData.type}
                        onChange={(e) => setFormData({...formData, type: e.target.value})}
                        required
                      >
                        <option value="INCOME">Pemasukan</option>
                        <option value="EXPENSE">Pengeluaran</option>
                      </select>
                    </div>
                  </>
                )}

                <div className="shum-form-actions">
                  <button type="button" className="btn-cancel" onClick={resetForm}>Batal</button>
                  <button type="submit" className="btn-save">
                    {editingId ? 'Perbarui' : 'Buat'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        <table className="shum-table">
          <thead>
            <tr>
              {activeTab === 'shu' ? (
                <>
                  <th>Nama Komponen</th>
                  <th>Persentase</th>
                  <th>Distribusi</th>
                </>
              ) : activeTab === 'dept' ? (
                <th>Nama Departemen</th>
              ) : activeTab === 'loan_type' ? (
                <th>Nama Jenis Pinjaman</th>
              ) : activeTab === 'payment_channel' ? (
                <>
                  <th>Kode Kanal</th>
                  <th>Nama Kanal</th>
                  <th>Biaya %</th>
                  <th>Biaya Tetap</th>
                </>
              ) : activeTab === 'inc_exp_cat' ? (
                <>
                  <th>Nama Kategori</th>
                  <th>Jenis</th>
                </>
              ) : (
                <th>Nama Kategori</th>
              )}
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '40px' }}>Memuat...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '40px' }}>Data tidak ditemukan</td></tr>
            ) : data.map((item) => (
              <tr key={item.id}>
                <td className="font-bold">
                  {activeTab === 'shu' ? item.component_name 
                    : activeTab === 'dept' ? item.department_name 
                    : activeTab === 'loan_type' ? item.name 
                    : activeTab === 'payment_channel' ? item.channel_code
                    : item.category_name}
                </td>
                {activeTab === 'shu' && (
                  <>
                    <td><span className="shum-badge blue">{item.percentage}%</span></td>
                    <td>
                      <span className={`shum-badge ${item.distributed_member ? 'green' : 'gray'}`}>
                        {item.distributed_member ? 'Ya' : 'Tidak'}
                      </span>
                    </td>
                  </>
                )}
                {activeTab === 'payment_channel' && (
                  <>
                    <td>{item.channel_name}</td>
                    <td><span className="shum-badge blue">{item.fee_percentage}%</span></td>
                    <td>Rp {parseFloat(item.fee_fixed).toLocaleString('id-ID')}</td>
                  </>
                )}
                {activeTab === 'inc_exp_cat' && (
                  <td>
                    <span className="shum-badge blue">{item.type === 'EXPENSE' ? 'Pengeluaran' : 'Pemasukan'}</span>
                  </td>
                )}
                <td>
                  <div className="shum-table-actions">
                    <button className="action-edit" onClick={() => startEdit(item)}><Edit2 size={16} /></button>
                    {activeTab !== 'payment_channel' && (
                      <button className="action-delete" onClick={() => handleDelete(item.id)}><Trash2 size={16} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            
            {activeTab === 'shu' && (
              <tr className="shum-total-row">
                <td>Total Distribusi</td>
                <td colSpan="3">
                  <span className={`shum-total-badge ${totalPercentage > 100 ? 'red' : 'green'}`}>
                    {totalPercentage.toFixed(2)}%
                  </span>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SHUMasterData;
