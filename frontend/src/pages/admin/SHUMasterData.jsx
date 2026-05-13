import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, Building, Percent, CreditCard } from 'lucide-react';
import './SHUManagement.css';

const TABS = [
  { id: 'shu', label: 'SHU Components', icon: Percent, apiUrl: 'http://127.0.0.1:8000/api/master/shu-components/' },
  { id: 'dept', label: 'Departments', icon: Building, apiUrl: 'http://127.0.0.1:8000/api/master/departments/' },
  { id: 'loan_type', label: 'Loan Types', icon: CreditCard, apiUrl: 'http://127.0.0.1:8000/api/loan/loan-types/' },
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
        alert(`Cannot save. Total distribution would exceed 100%`);
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
        const errorData = await res.json();
        alert('Failed to save. Please check your data.');
      }
    } catch (err) {
      console.error('Error saving:', err);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Are you sure you want to delete this item?')) return;
    
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
    }
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      component_name: '', percentage: '', distributed_member: false,
      department_name: '', name: ''
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
          <h1 className="shum-title">Master Data Management</h1>
          <p className="shum-subtitle">Configure system-wide master data and settings</p>
        </div>
        <button 
          className="shum-add-btn"
          onClick={() => { resetForm(); setShowForm(true); }}
        >
          <Plus size={18} /> Add {currentTab.label.replace('s', '')}
        </button>
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
                <h3>{editingId ? 'Edit' : 'Add New'} {currentTab.label.replace('s', '')}</h3>
                <button onClick={resetForm}><X size={20} /></button>
              </div>
              <form onSubmit={handleSave}>
                {activeTab === 'shu' && (
                  <>
                    <div className="shum-form-group">
                      <label>Component Name</label>
                      <input 
                        type="text" 
                        value={formData.component_name}
                        onChange={(e) => setFormData({...formData, component_name: e.target.value})}
                        required
                      />
                    </div>
                    <div className="shum-form-group">
                      <label>Percentage (%)</label>
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
                      <label htmlFor="dist">Distributed to Members</label>
                    </div>
                  </>
                )}

                {activeTab === 'dept' && (
                  <div className="shum-form-group">
                    <label>Department Name</label>
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
                    <label>Loan Type Name</label>
                    <input 
                      type="text" 
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      required
                    />
                  </div>
                )}

                <div className="shum-form-actions">
                  <button type="button" className="btn-cancel" onClick={resetForm}>Cancel</button>
                  <button type="submit" className="btn-save">
                    {editingId ? 'Update' : 'Create'}
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
                  <th>Component Name</th>
                  <th>Percentage</th>
                  <th>Distributed</th>
                </>
              ) : activeTab === 'dept' ? (
                <th>Department Name</th>
              ) : (
                <th>Loan Type Name</th>
              )}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '40px' }}>Loading...</td></tr>
            ) : data.length === 0 ? (
              <tr><td colSpan="4" style={{ textAlign: 'center', padding: '40px' }}>No data found</td></tr>
            ) : data.map((item) => (
              <tr key={item.id}>
                <td className="font-bold">
                  {activeTab === 'shu' ? item.component_name : activeTab === 'dept' ? item.department_name : item.name}
                </td>
                {activeTab === 'shu' && (
                  <>
                    <td><span className="shum-badge blue">{item.percentage}%</span></td>
                    <td>
                      <span className={`shum-badge ${item.distributed_member ? 'green' : 'gray'}`}>
                        {item.distributed_member ? 'Yes' : 'No'}
                      </span>
                    </td>
                  </>
                )}
                <td>
                  <div className="shum-table-actions">
                    <button className="action-edit" onClick={() => startEdit(item)}><Edit2 size={16} /></button>
                    <button className="action-delete" onClick={() => handleDelete(item.id)}><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            ))}
            
            {activeTab === 'shu' && (
              <tr className="shum-total-row">
                <td>Total Distribution</td>
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
