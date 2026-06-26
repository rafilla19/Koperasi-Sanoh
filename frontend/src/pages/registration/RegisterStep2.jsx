import React, { useState, useEffect, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Upload } from 'lucide-react';
import { apiUrl } from '../../services/api';
import './RegistrationPages.css';

const RegisterStep2 = () => {
  const navigate = useNavigate();
  const defaultFormData = {
    mobilePhone: '',
    email: '',
    employeeStatus: '',
    department: '',
    voluntarySaving: '',
    contractEndDate: '',
    defaultAgree: false,
    payrollAgree: false,
    npwpFileName: '',
    ktpFileName: '',
    npwpPath: '',
    ktpPath: ''
  };

  const [formData, setFormData] = useState(() => {
    const saved = sessionStorage.getItem('regStep2');
    const parsed = saved ? JSON.parse(saved) : {};
    return {
      mobilePhone: parsed.mobilePhone ?? '',
      email: parsed.email ?? '',
      employeeStatus: parsed.employeeStatus ?? '',
      department: parsed.department ?? '',
      voluntarySaving: parsed.voluntarySaving ?? '',
      contractEndDate: parsed.contractEndDate ?? '',
      defaultAgree: parsed.defaultAgree ?? false,
      payrollAgree: parsed.payrollAgree ?? false,
      npwpFileName: parsed.npwpFileName ?? '',
      ktpFileName: parsed.ktpFileName ?? '',
      npwpPath: parsed.npwpPath ?? '',
      ktpPath: parsed.ktpPath ?? ''
    };
  });

  const [departments, setDepartments] = useState([]);
  const [employeeStatuses, setEmployeeStatuses] = useState([]);

  useEffect(() => {
    sessionStorage.setItem('regStep2', JSON.stringify(formData));
  }, [formData]);

  useEffect(() => {
    const fetchOptions = async () => {
      try {
        const [deptRes, statusRes] = await Promise.all([
          fetch(apiUrl('/member/members/departments/')),
          fetch(apiUrl('/member/members/employee_statuses/'))
        ]);

        const deptData = await deptRes.json();
        const statusData = await statusRes.json();

        if (deptRes.ok) setDepartments(deptData);
        if (statusRes.ok) setEmployeeStatuses(statusData);
      } catch (error) {
        console.error('Failed to load registration options', error);
      }
    };

    fetchOptions();
  }, []);

  const handleChange = (field, validator) => (e) => {
    let val = e.target.value;
    if (validator) val = validator(val);
    setFormData(prev => ({ ...prev, [field]: val }));
  };

  const handleCheckboxChange = (field) => (e) => {
    setFormData(prev => ({ ...prev, [field]: e.target.checked }));
  };

  const onlyNumbers = (val) => val.replace(/[^0-9]/g, '');

  const npwpInputRef = useRef(null);
  const ktpInputRef = useRef(null);

  const [isUploading, setIsUploading] = useState({ npwp: false, ktp: false });

  const handleFileChange = (field) => async (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 10 * 1024 * 1024) {
        alert("File size cannot exceed 10MB");
        e.target.value = '';
        return;
      }

      setIsUploading(prev => ({ ...prev, [field]: true }));
      
      const formDataUpload = new FormData();
      formDataUpload.append('file', file);
      formDataUpload.append('type', field);

      try {
        const response = await fetch(apiUrl('/member/members/upload_temp_document/'), {
          method: 'POST',
          body: formDataUpload
        });

        const data = await response.json();
        if (response.ok) {
          const fileNameKey = field === 'npwp' ? 'npwpFileName' : 'ktpFileName';
          const pathKey = field === 'npwp' ? 'npwpPath' : 'ktpPath';
          
          setFormData(prev => ({ 
            ...prev, 
            [fileNameKey]: file.name,
            [pathKey]: data.file_path 
          }));
        } else {
          alert("Failed to upload file: " + (data.error || 'Server error'));
        }
      } catch (err) {
        console.error("Upload error:", err);
        alert("Connection error while uploading");
      } finally {
        setIsUploading(prev => ({ ...prev, [field]: false }));
      }
    }
  };

  const isOutsource = () => {
    if (!formData.employeeStatus) return false;
    const selectedStatus = employeeStatuses.find(s => s.id.toString() === formData.employeeStatus.toString());
    return selectedStatus && selectedStatus.status_name.toLowerCase().includes('outsource');
  };

  const isContract = () => {
    if (!formData.employeeStatus) return false;
    const selectedStatus = employeeStatuses.find(s => s.id.toString() === formData.employeeStatus.toString());
    return selectedStatus && selectedStatus.status_name.toLowerCase().includes('contract');
  };

  const isFormValid = () => {
    // Basic fields validation
    const hasBasicFields = formData.mobilePhone && formData.email && formData.employeeStatus && formData.department && formData.voluntarySaving >= 50000;
    const hasFiles = formData.npwpPath && formData.ktpPath;
    const hasContractDate = isContract() ? formData.contractEndDate : true;
    
    // Checkbox validation based on status
    const hasDefaultAgree = formData.defaultAgree;
    const hasPayrollAgree = isOutsource() ? true : formData.payrollAgree;

    return hasBasicFields && hasFiles && hasContractDate && hasDefaultAgree && hasPayrollAgree && !isUploading.npwp && !isUploading.ktp;
  };

  const handleContinue = (e) => {
    e.preventDefault();
    if (!isFormValid()) return;
    navigate('/register/step-3');
  };

  return (
    <div>
      <h2 className="reg-page-title">Personal Information</h2>
      <p className="reg-step-subtitle" style={{ marginBottom: '2rem' }}>
        Please provide your contact information and income details for the purpose of reviewing your account registration.
      </p>
      
      <form className="reg-form" onSubmit={handleContinue}>
        {/* Contact Info */}
        <div className="reg-form-group">
          <label className="reg-form-label">Mobile Phone Number</label>
          <div style={{ display: 'flex' }}>
            <span style={{ 
              padding: '0.75rem 1rem', 
              backgroundColor: '#e5e7eb', 
              border: '1px solid var(--color-border)', 
              borderRight: 'none',
              borderRadius: 'var(--radius-md) 0 0 var(--radius-md)',
              color: '#4b5563'
            }}>+62</span>
            <input 
              type="tel" 
              className="reg-form-input" 
              style={{ borderRadius: '0 var(--radius-md) var(--radius-md) 0' }} 
              value={formData.mobilePhone} onChange={handleChange('mobilePhone', onlyNumbers)}
              required 
            />
          </div>
        </div>

        <div className="reg-form-group">
          <label className="reg-form-label">Email Address</label>
          <input type="email" className="reg-form-input" required value={formData.email} onChange={handleChange('email')} />
        </div>

        {/* Employment Info */}
        <div className="reg-form-group">
          <label className="reg-form-label">Employee Status</label>
          <div className="custom-select-wrapper">
            <select className="reg-form-input reg-form-select" required value={formData.employeeStatus} onChange={handleChange('employeeStatus')}>
              <option value="" disabled></option>
              {employeeStatuses.map((status) => (
                <option key={status.id} value={status.id}>{status.status_name}</option>
              ))}
            </select>
          </div>
        </div>

        {isContract() && (
          <div className="reg-form-group">
            <label className="reg-form-label">Contract End Date (Masa Kontrak)</label>
            <input 
              type="date" 
              className="reg-form-input" 
              required 
              value={formData.contractEndDate} 
              onChange={handleChange('contractEndDate')} 
            />
          </div>
        )}

        {/* File Uploads */}
        <div className="reg-form-group">
          <label className="reg-form-label">Upload NPWP <span style={{ fontWeight: 'normal', color: '#64748b' }}>(Max 10MB)</span></label>
          <div className="file-upload-box" onClick={() => !isUploading.npwp && npwpInputRef.current.click()} style={{ cursor: isUploading.npwp ? 'wait' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', borderColor: formData.npwpPath ? '#22c55e' : 'var(--color-border)' }}>
            <Upload size={20} className={isUploading.npwp ? "animate-bounce" : ""} />
            {isUploading.npwp ? (
              <span style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#3b82f6' }}>Uploading...</span>
            ) : formData.npwpFileName ? (
              <span style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#22c55e' }}>✓ {formData.npwpFileName}</span>
            ) : (
              <span style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>Click to upload NPWP</span>
            )}
            <input type="file" ref={npwpInputRef} style={{ display: 'none' }} accept="image/*,.pdf" onChange={handleFileChange('npwp')} />
          </div>
        </div>

        <div className="reg-form-group">
          <label className="reg-form-label">Upload KTP <span style={{ fontWeight: 'normal', color: '#64748b' }}>(Max 10MB)</span></label>
          <div className="file-upload-box" onClick={() => !isUploading.ktp && ktpInputRef.current.click()} style={{ cursor: isUploading.ktp ? 'wait' : 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', borderColor: formData.ktpPath ? '#22c55e' : 'var(--color-border)' }}>
            <Upload size={20} className={isUploading.ktp ? "animate-bounce" : ""} />
            {isUploading.ktp ? (
              <span style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#3b82f6' }}>Uploading...</span>
            ) : formData.ktpFileName ? (
              <span style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#22c55e' }}>✓ {formData.ktpFileName}</span>
            ) : (
              <span style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#94a3b8' }}>Click to upload KTP</span>
            )}
            <input type="file" ref={ktpInputRef} style={{ display: 'none' }} accept="image/*,.pdf" onChange={handleFileChange('ktp')} />
          </div>
        </div>

        {/* More Employment Info */}
        <div className="reg-form-group">
          <label className="reg-form-label">Department</label>
          <div className="custom-select-wrapper">
            <select className="reg-form-input reg-form-select" required value={formData.department} onChange={handleChange('department')}>
              <option value="" disabled></option>
              {departments.map((dept) => (
                <option key={dept.id} value={dept.id}>{dept.department_name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Savings Info */}
        <div className="reg-form-group">
          <label className="reg-form-label">Input Voluntary Saving <span style={{ fontSize: '0.75rem' }}>(min Rp 50.000)</span></label>
          <div style={{ display: 'flex' }}>
            <span style={{ 
              padding: '0.75rem 1rem', 
              backgroundColor: '#e5e7eb', 
              border: '1px solid var(--color-border)', 
              borderRight: 'none',
              borderRadius: 'var(--radius-md) 0 0 var(--radius-md)',
              color: '#4b5563'
            }}>Rp</span>
            <input 
              type="number" 
              min="50000"
              className="reg-form-input" 
              style={{ borderRadius: '0 var(--radius-md) var(--radius-md) 0' }} 
              required 
              value={formData.voluntarySaving}
              onChange={handleChange('voluntarySaving', onlyNumbers)}
            />
          </div>
        </div>

        {/* Agreements */}
        <div style={{ marginTop: '1rem' }}>
          <div className="checkbox-group" style={{ marginBottom: '1rem' }}>
            <input type="checkbox" id="mandatory-saving-agree" required checked={formData.defaultAgree} onChange={handleCheckboxChange('defaultAgree')} />
            <label htmlFor="mandatory-saving-agree" className="checkbox-label">
              By registering as a member of the cooperative, I agree to pay a mandatory deposit of IDR 100,000, which must be paid every month during active membership.
            </label>
          </div>

          {!isOutsource() && (
            <div className="checkbox-group">
              <input type="checkbox" id="payroll-deduct-agree" required checked={formData.payrollAgree} onChange={handleCheckboxChange('payrollAgree')} />
              <label htmlFor="payroll-deduct-agree" className="checkbox-label">
                I authorize the HR payroll department of PT Sanoh Indonesia to automatically deduct my salary for Mandatory Savings and Voluntary Savings for the Sanoh Sinergi Bersama Cooperative.
              </label>
            </div>
          )}
        </div>

        <div className="reg-actions" style={{ justifyContent: 'space-between', marginTop: '2rem' }}>
          <Link to="/register/step-1" className="btn-secondary">← Back</Link>
          <button 
            type="submit" 
            className="btn-primary-sm"
            disabled={!isFormValid()}
            style={{ 
              opacity: isFormValid() ? 1 : 0.6, 
              cursor: isFormValid() ? 'pointer' : 'not-allowed'
            }}
          >
            Lanjutkan →
          </button>
        </div>
      </form>
    </div>
  );
};

export default RegisterStep2;
