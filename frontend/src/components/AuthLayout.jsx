import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { MapPin, Mail, Phone } from 'lucide-react';
import { apiUrl } from '../services/api';
import './AuthLayout.css';

const AuthLayout = () => {
  const [contact, setContact] = useState({ email: '...', phone: '...' });

  useEffect(() => {
    fetch(apiUrl('/member/members/footer_contact/'))
      .then(res => res.json())
      .then(data => {
        if (data.email || data.phone || data.phone_number) {
          setContact({
            email: data.email || '...',
            phone: data.phone || data.phone_number || '...'
          });
        }
      })
      .catch(err => console.error('Failed to fetch contact Info', err));
  }, []);

  return (
    <div className="auth-layout">
      {/* Left side Image Pane */}
      <div className="auth-image-pane">
        <div className="auth-overlay">
          <h1>KOPERASI PT SANOH INDONESIA<br /><span>SINERGI BERSAMA</span></h1>
          <ul className="auth-contact-list">
            <li>
              <MapPin size={18} />
              <span>JL. INTI II, BLOK C-4, NO-10, KAWASAN INDUSTRI HYUNDAI CIKARANG RT. 000 RW.000, SUKARESMI, CIKARANG SELATAN, KAB.BEKASI, JAWA BARAT</span>
            </li>
            <li>
              <Mail size={18} />
              <span>{contact.email}</span>
            </li>
            <li>
              <Phone size={18} />
              <span>{contact.phone}</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Right side Form Pane */}
      <div className="auth-form-pane">
        <Outlet />
      </div>
    </div>
  );
};

export default AuthLayout;
