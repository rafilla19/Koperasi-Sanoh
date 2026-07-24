import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import './GlobalPopup.css';

const VARIANT_ICONS = {
  danger: AlertTriangle,
  success: CheckCircle2,
  info: Info,
};

const normalizeOptions = (input, fallbackTitle = 'Notification') => {
  if (typeof input === 'string') {
    return { title: fallbackTitle, message: input };
  }
  return {
    title: input?.title || fallbackTitle,
    message: input?.message || '',
    confirmText: input?.confirmText,
    cancelText: input?.cancelText,
    variant: input?.variant || 'info',
    hideHeader: Boolean(input?.hideHeader),
  };
};

const GlobalPopup = () => {
  const [popup, setPopup] = useState(null);
  const queueRef = useRef([]);
  const activeResolveRef = useRef(null);

  const openNext = useCallback(() => {
    if (activeResolveRef.current || queueRef.current.length === 0) return;

    const next = queueRef.current.shift();
    activeResolveRef.current = next.resolve;
    setPopup(next.options);
  }, []);

  const enqueue = useCallback((options) => {
    return new Promise((resolve) => {
      queueRef.current.push({ options, resolve });
      openNext();
    });
  }, [openNext]);

  const closePopup = useCallback((result) => {
    const resolve = activeResolveRef.current;
    activeResolveRef.current = null;
    setPopup(null);
    if (resolve) resolve(result);
    setTimeout(openNext, 0);
  }, [openNext]);

  useEffect(() => {
    const originalAlert = window.alert;
    const originalConfirm = window.confirm;
    const originalAppAlert = window.appAlert;
    const originalAppConfirm = window.appConfirm;

    window.appAlert = (options) => enqueue({
      ...normalizeOptions(options),
      mode: 'alert',
      confirmText: normalizeOptions(options).confirmText || 'Oke',
    });

    window.appConfirm = (options) => enqueue({
      ...normalizeOptions(options, 'Konfirmasi'),
      mode: 'confirm',
      confirmText: normalizeOptions(options, 'Konfirmasi').confirmText || 'Lanjutkan',
      cancelText: normalizeOptions(options, 'Konfirmasi').cancelText || 'Batal',
    });

    window.alert = (message) => {
      const text = String(message ?? '');
      const lower = text.toLowerCase();
      let variant = 'info';
      let title = 'Pemberitahuan';

      if (/berhasil|sukses|success|terverifikasi|✓/.test(lower)) {
        variant = 'success';
        title = 'Berhasil';
      } else if (/gagal|error|tidak dapat|tidak bisa|kesalahan|sudah terdaftar|invalid|failed|ditolak|dibatalkan/.test(lower)) {
        variant = 'danger';
        title = 'Gagal';
      }

      window.appAlert({
        title,
        message: text,
        variant,
      });
    };

    window.confirm = (message) => {
      console.warn('window.confirm is disabled. Use await window.appConfirm(...) instead.', message);
      return false;
    };

    return () => {
      window.alert = originalAlert;
      window.confirm = originalConfirm;
      window.appAlert = originalAppAlert;
      window.appConfirm = originalAppConfirm;
    };
  }, [enqueue]);

  if (!popup) return null;

  const isConfirm = popup.mode === 'confirm';
  const variantClass = `gp-modal-icon ${popup.variant || 'info'}`;
  const VariantIcon = VARIANT_ICONS[popup.variant] || VARIANT_ICONS.info;

  return (
    <div className="gp-overlay" role="presentation">
      <div
        className="gp-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={popup.hideHeader ? undefined : 'gp-title'}
      >
        {!popup.hideHeader && (
          <>
            <div className={variantClass}>
              <VariantIcon size={20} strokeWidth={2.5} />
            </div>
            <div className="gp-modal-body">
              <p className="gp-modal-kicker">{isConfirm ? 'Konfirmasi tindakan' : 'Pesan sistem'}</p>
              <h3 id="gp-title" className="gp-modal-title">{popup.title}</h3>
              <p className="gp-modal-message">{popup.message}</p>
            </div>
          </>
        )}
        {popup.hideHeader && (
          <div className="gp-modal-body gp-modal-body--compact">
            <p className="gp-modal-message gp-modal-message--compact">{popup.message}</p>
          </div>
        )}
        <div className="gp-modal-actions">
          {isConfirm && (
            <button type="button" className="gp-btn gp-btn-secondary" onClick={() => closePopup(false)}>
              {popup.cancelText}
            </button>
          )}
          <button type="button" className="gp-btn gp-btn-primary" onClick={() => closePopup(true)}>
            {popup.confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GlobalPopup;
