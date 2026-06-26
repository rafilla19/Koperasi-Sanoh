import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FileSearch, CheckCircle2, ClipboardCheck, UserPlus, Clock, Mail } from 'lucide-react';
import { apiUrl } from '../../services/api';
import './RegistrationPages.css';

const UnderReview = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [supportContact, setSupportContact] = useState('admin@example.com');
  const [principalAmount, setPrincipalAmount] = useState(100000);
  const [loading, setLoading] = useState(true);
  const [isApproved, setIsApproved] = useState(false);
  const [memberId, setMemberId] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const queryParams = new URLSearchParams(location.search);
        const regId = queryParams.get('id');

        if (regId) {
          const statusRes = await fetch(apiUrl(`/member/members/${regId}/get_registration_status/`));
          if (statusRes.ok) {
            const statusData = await statusRes.json();
            if (statusData.status_id === 6 || statusData.status_id === 7) {
              setIsApproved(true);
            }
            if (statusData.member_id) {
              setMemberId(statusData.member_id);
            }
            if (statusData.principal_amount) {
              setPrincipalAmount(Number(statusData.principal_amount));
            }
          }
        }

        // Fetch support contact info
        const contactRes = await fetch(apiUrl('/member/members/footer_contact/'));
        if (contactRes.ok) {
          const contactData = await contactRes.json();
          if (contactData.email) {
            setSupportContact(contactData.email);
          } 
        }

        // Fetch saving types info as fallback
        const savingRes = await fetch(apiUrl('/member/members/saving_types_info/'));
        if (savingRes.ok) {
          const savingData = await savingRes.json();
          const principalType = savingData.find(st => st.id === 3);
          if (principalType && !principalAmount) {
            setPrincipalAmount(principalType.minimum_amount);
          }
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [location.search]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleContinuePayment = () => {
    if (!isApproved) return;
    const params = new URLSearchParams();
    if (memberId) params.set('member_id', memberId);
    params.set('amount', principalAmount);
    navigate(`/register/activate-membership?${params.toString()}`);
  };

  return (
    <div className="review-container pt-4 pb-4">
      <div className="text-center mb-6">
        <FileSearch size={64} className="mx-auto text-gray-400 mb-4" />
        <h2 className="reg-page-title mb-2">
          {isApproved ? "Pendaftaran Disetujui" : "Pendaftaran Sedang Ditinjau"}
        </h2>
        <p className="reg-page-subtitle">
          {isApproved
            ? "Identitas Anda telah diverifikasi. Silakan lanjutkan ke pembayaran."
            : "Terima kasih telah mendaftar. Kami telah menerima dokumen Anda.\nTim kami sedang memverifikasi identitas Anda."}
        </p>
      </div>

      <div className="status-timeline mt-8 mb-8">
        <div className="timeline-item completed">
          <div className="timeline-icon"><CheckCircle2 size={20} color="var(--color-secondary)" /></div>
          <div className="timeline-content">
            <h4 className="timeline-title">Pendaftaran Selesai</h4>
            <p className="timeline-desc">Detail akun berhasil dikirim</p>
          </div>
        </div>
        
        <div className={`timeline-item ${isApproved ? 'completed' : 'in-progress'}`}>
          <div className="timeline-icon timeline-line">
            {isApproved ? <CheckCircle2 size={20} color="var(--color-secondary)" /> : <ClipboardCheck size={20} color="var(--color-primary)" />}
          </div>
          <div className="timeline-content">
            <h4 className={`timeline-title ${!isApproved ? 'title-active' : ''}`}>Verifikasi Sedang Berlangsung</h4>
            <p className="timeline-desc">Memeriksa dokumen dan identitas</p>
          </div>
        </div>

        <div className={`timeline-item ${isApproved ? 'in-progress' : 'pending'}`}>
          <div className="timeline-icon timeline-line">
            <UserPlus size={20} color={isApproved ? "var(--color-primary)" : "var(--color-text-muted)"} />
          </div>
          <div className="timeline-content">
            <h4 className={`timeline-title ${isApproved ? 'title-active' : 'title-pending'}`}>Aktivasi Keanggotaan</h4>
            <p className="timeline-desc">Pembayaran simpanan pokok wajib sebesar<br/>{!loading && formatCurrency(principalAmount)} diperlukan untuk mengaktifkan akun Anda.</p>
          </div>
        </div>
      </div>

      <div className="info-box-footer mt-6 flex justify-between bg-gray-50 p-4 rounded-md">
        <div>
          <span className="info-label text-xs font-bold text-gray-500 block mb-1 uppercase tracking-wider">Estimasi Waktu Tunggu</span>
          <div className="flex items-center text-sm text-gray-600">
            <Clock size={16} className="mr-2" /> 1-2 Hari Kerja
          </div>
        </div>
        <div>
          <span className="info-label text-xs font-bold text-gray-500 block mb-1 uppercase tracking-wider">Kontak Dukungan</span>
          <div className="flex items-center text-sm text-gray-600">
            <Mail size={16} className="mr-2" /> {supportContact}
          </div>
        </div>
      </div>

      <div className="mt-6 full-width">
        <button 
           className={`btn-secondary full-width text-center ${!isApproved ? 'opacity-50 cursor-not-allowed' : ''}`}
           onClick={handleContinuePayment}
           disabled={!isApproved}
        >
          Lanjutkan ke pembayaran &rarr;
        </button>
      </div>
    </div>
  );
};

export default UnderReview;
