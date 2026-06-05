import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, BadgeCheck, ArrowRight } from 'lucide-react';
import { apiUrl } from '../../services/api';
import './RegistrationPages.css';

const PaymentSuccess = () => {
  const navigate = useNavigate();
  const [principalAmount, setPrincipalAmount] = useState(100000);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const res = await fetch(apiUrl('/members/saving_types_info/'));
        if (res.ok) {
          const data = await res.json();
          const principalType = data.find(st => st.id === 3);
          if (principalType) {
            setPrincipalAmount(principalType.minimum_amount);
          }
        }
      } catch (error) {
        console.error('Error fetching principal amount:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('id-ID', {
      style: 'currency',
      currency: 'IDR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const handleDashboard = () => {
    navigate('/dashboard'); 
  };

  return (
    <div className="payment-success-page">
      <div className="payment-success-backdrop payment-success-backdrop-left" />
      <div className="payment-success-backdrop payment-success-backdrop-right" />

      <div className="payment-success-shell">
        <div className="payment-success-card">
          <div className="payment-success-hero">
            <div className="payment-success-icon-wrap">
              <CheckCircle2 size={34} />
            </div>
            <div className="payment-success-hero-copy">
              <span className="payment-success-pill">
                <BadgeCheck size={14} />
                Payment Verified
              </span>
              <h2>Account Activated</h2>
              <p>
                Your principal savings payment has been received and your membership is now active.
              </p>
            </div>
          </div>

          <div className="payment-success-message">
            Welcome to the cooperative. You can now access your dashboard to manage your savings and account activity.
          </div>

          <div className="payment-success-summary">
            <div className="payment-success-summary-header">
              <div>
                <span className="payment-success-label">Payment Summary</span>
                <h3>Principal Savings Confirmation</h3>
              </div>
              <span className="payment-success-status">Verified & Processed</span>
            </div>

            <div className="payment-success-rows">
              <div className="payment-success-row">
                <span>Amount Paid</span>
                <strong>{!loading ? formatCurrency(principalAmount) : 'Loading...'}</strong>
              </div>
              <div className="payment-success-row">
                <span>Payment Type</span>
                <strong>Mandatory Principal Savings</strong>
              </div>
              <div className="payment-success-row">
                <span>Status</span>
                <strong className="payment-success-status-text">Completed Successfully</strong>
              </div>
            </div>
          </div>

          <div className="payment-success-agreement">
            <h4>Membership Agreement</h4>
            <p>
              By registering as a member of the cooperative, you agree to maintain the mandatory principal savings contribution of{' '}
              <span>{!loading ? formatCurrency(principalAmount) : 'IDR 100,000'}</span>
              {' '}during active membership.
            </p>
          </div>

          <div className="payment-success-actions">
            <button className="payment-success-btn" onClick={handleDashboard}>
              Go to My Dashboard
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;
