import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  ShieldCheck, Lock,
  CheckCircle2, ChevronDown, ChevronUp, AlertCircle, Timer
} from 'lucide-react';
import { apiUrl } from '../../services/api';
import './RegistrationPages.css';

const API_BASE = apiUrl('/member');
const LOAN_API_BASE = apiUrl('/loan');

/* ─── Countdown hook ───────────────────────────────────── */
const COUNTDOWN_SECONDS = 15 * 60; // 15 minutes

function useCountdown(seconds) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    if (remaining <= 0) return;
    const id = setInterval(() => setRemaining(r => r - 1), 1000);
    return () => clearInterval(id);
  }, []);
  const m = String(Math.floor(remaining / 60)).padStart(2, '0');
  const s = String(remaining % 60).padStart(2, '0');
  return { label: `${m}:${s}`, expired: remaining <= 0, urgent: remaining < 120 };
}

/* ─── Main component ───────────────────────────────────── */
const ActivateMembership = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [selectedMethod, setSelectedMethod] = useState(null);
  const [principalAmount, setPrincipalAmount] = useState(100000);
  const [loading, setLoading] = useState(true);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [memberId, setMemberId] = useState(null);
  const [paymentChannels, setPaymentChannels] = useState([]);

  const countdown = useCountdown(COUNTDOWN_SECONDS);

  /* Get member_id from URL query params */
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const mid = params.get('member_id');
    if (mid) setMemberId(mid);
  }, [location.search]);

  /* Fetch principal amount */
  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(`${API_BASE}/members/saving_types_info/`);
        if (res.ok) {
          const data = await res.json();
          const principalType = data.find(st => st.id === 3);
          if (principalType?.minimum_amount) {
            setPrincipalAmount(Number(principalType.minimum_amount));
          }
        }
      } catch (err) {
        console.error('Error fetching principal amount:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    const fetchChannels = async () => {
      try {
        const res = await fetch(`${LOAN_API_BASE}/loans/payment_channels/`);
        if (res.ok) {
          const data = await res.json();
          setPaymentChannels(Array.isArray(data) ? data : []);
        } else {
          console.error('Failed to fetch payment channels');
        }
      } catch (err) {
        console.error('Error fetching payment channels:', err);
      } finally {
        setLoadingChannels(false);
      }
    };

    fetchChannels();
  }, []);

  const formatCurrency = useCallback((amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency', currency: 'IDR', minimumFractionDigits: 0,
    }).format(amount);
  }, []);

  const selectedChannel = paymentChannels.find((channel) => channel.channel_code === selectedMethod);
  const feePercentage = selectedChannel ? Number(selectedChannel.fee_percentage) : 0;
  const feeFixed = selectedChannel ? Number(selectedChannel.fee_fixed) : 0;
  const feeTotal = selectedChannel ? Math.round((principalAmount * feePercentage) / 100) + feeFixed : 0;
  const totalAmount = principalAmount + feeTotal;

  const handlePayment = async () => {
    if (!selectedMethod) {
      setError('Silakan pilih metode pembayaran terlebih dahulu.');
      return;
    }
    if (!memberId) {
      setError('ID anggota tidak ditemukan. Silakan kembali dan coba lagi.');
      return;
    }

    setError('');
    setProcessing(true);

    try {
      const response = await fetch(`${API_BASE}/members/create_payment_token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: memberId,
          payment_method: selectedMethod,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Gagal membuat token pembayaran.');
      }

      if (window.snap && data.snap_token) {
        window.snap.pay(data.snap_token, {
          onSuccess: (result) => {
            console.log('Payment success:', result);
            navigate('/register/payment-success');
          },
          onPending: (result) => {
            console.log('Payment pending:', result);
            navigate('/register/payment-success');
          },
          onError: (result) => {
            console.error('Payment error:', result);
            setError('Pembayaran gagal. Silakan coba lagi.');
            setProcessing(false);
          },
          onClose: () => {
            setProcessing(false);
          },
        });
      } else if (data.redirect_url) {
        window.location.href = data.redirect_url;
      } else {
        throw new Error('Snap.js belum dimuat atau token tidak tersedia.');
      }
    } catch (err) {
      console.error('Payment error:', err);
      setError(err.message || 'Terjadi kesalahan. Silakan coba lagi.');
      setProcessing(false);
    }
  };

  const orderRef = `KOP-PRINCIPAL-${memberId || 'XXXX'}-${Date.now()}`;

  return (
    <div className="activate-payment-page">
      {/* ── Header ── */}
      <div className="activate-header">
        <div className="activate-header-icon">
          <ShieldCheck size={32} />
        </div>
        <div>
          <h2 className="activate-title">Aktivasi Keanggotaan</h2>
          <p className="activate-subtitle">
            Selesaikan pembayaran simpanan pokok untuk mengaktifkan akun koperasi Anda
          </p>
        </div>
      </div>

      <div className="activate-layout">
        {/* ── Left: Payment Methods ── */}
        <div className="activate-main">
          <div className="activate-section-label">
            <span>Pilih Metode Pembayaran</span>
          </div>

          {error && (
            <div className="activate-error">
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          <div className="activate-methods">
            {loadingChannels ? (
              <div className="activate-loading-pill">Memuat channel pembayaran…</div>
            ) : paymentChannels.length === 0 ? (
              <div className="activate-error">
                <AlertCircle size={16} />
                <span>Data payment channel belum tersedia.</span>
              </div>
            ) : (
              paymentChannels.map((channel) => {
                const isSelected = selectedMethod === channel.channel_code;
                const channelFee = Math.round((principalAmount * Number(channel.fee_percentage)) / 100) + Number(channel.fee_fixed);

                return (
                  <div
                    key={channel.channel_code}
                    className={`activate-method-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedMethod(channel.channel_code);
                      setError('');
                    }}
                  >
                    <div className="activate-method-top">
                      <div className="activate-method-info" style={{ marginLeft: 0 }}>
                        <span className="activate-method-label">{channel.channel_name}</span>
                        <span className="activate-method-desc">
                          {channel.channel_code} · {Number(channel.fee_percentage) > 0 ? `${channel.fee_percentage}%` : '0%'}{Number(channel.fee_percentage) > 0 && Number(channel.fee_fixed) > 0 ? ' + ' : ''}{Number(channel.fee_fixed) > 0 ? formatCurrency(channel.fee_fixed) : ''}
                        </span>
                      </div>
                      <div className="activate-method-chevron">
                        {isSelected ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </div>

                    <div className={`activate-channels ${isSelected ? 'open' : ''}`}>
                      <div className="activate-channels-inner">
                        <div className="activate-channels-logos" style={{ color: '#475569', fontSize: '12px' }}>
                          Gross: {formatCurrency(principalAmount + channelFee)}
                        </div>
                        <button
                          id={`pay-btn-${channel.channel_code}`}
                          className="activate-pay-btn"
                          onClick={(e) => { e.stopPropagation(); handlePayment(); }}
                          disabled={processing || countdown.expired}
                        >
                          {processing ? (
                            <span className="activate-spinner" />
                          ) : (
                            <>
                              <Lock size={15} />
                              {processing ? 'Memproses...' : `Bayar ${formatCurrency(principalAmount + channelFee)}`}
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Security note */}
          <div className="activate-security-note">
            <Lock size={13} />
            <span>
              Pembayaran diproses dengan aman melalui <strong>Midtrans</strong>.
              Data kartu/rekening Anda tidak disimpan di server kami.
            </span>
          </div>
        </div>

        {/* ── Right: Order Summary ── */}
        <div className="activate-sidebar">
          {/* Countdown */}
          <div className={`activate-countdown ${countdown.urgent ? 'urgent' : ''}`}>
            <Timer size={16} />
            <span>Selesaikan dalam&nbsp;<strong>{countdown.label}</strong></span>
          </div>

          {/* Summary card */}
          <div className="activate-summary-card">
            <div className="activate-summary-header">
              <CheckCircle2 size={16} />
              <span>Ringkasan Pembayaran</span>
            </div>

            <div className="activate-summary-body">
              <div className="activate-summary-row">
                <span>Jenis Simpanan</span>
                <span>Simpanan Pokok</span>
              </div>
              <div className="activate-summary-row">
                <span>Payment Channel</span>
                <span>{selectedChannel ? selectedChannel.channel_name : 'Pilih channel'}</span>
              </div>
              <div className="activate-summary-row">
                <span>Biaya Layanan</span>
                <span>{selectedMethod ? formatCurrency(feeTotal) : 'Rp 0'}</span>
              </div>
              <div className="activate-summary-divider" />
              <div className="activate-summary-total">
                <span>Total Pembayaran</span>
                <span>
                  {loading ? (
                    <span className="activate-loading-pill">Memuat…</span>
                  ) : (
                    formatCurrency(totalAmount)
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* Info */}
          <div className="activate-info-box">
            <p>
              Simpanan pokok adalah pembayaran <strong>satu kali</strong> yang wajib
              dilakukan untuk mengaktifkan keanggotaan Anda di Koperasi Sanoh.
            </p>
          </div>

          {/* CTA if no method selected */}
          {!selectedMethod && (
            <button
              className="activate-cta-hint"
              onClick={() => {
                const el = document.querySelector('.activate-method-card');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
            >
              ← Pilih metode di sebelah kiri
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ActivateMembership;
