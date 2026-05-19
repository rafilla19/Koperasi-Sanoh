import React from 'react';
import { Outlet } from 'react-router-dom';
import { MapPin, Mail, Phone } from 'lucide-react';
import './AuthLayout.css';

const AuthLayout = () => {
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
              <span>sanohsinergikoperasi@gmail.com</span>
            </li>
            <li>
              <Phone size={18} />
              <span>+62</span>
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
