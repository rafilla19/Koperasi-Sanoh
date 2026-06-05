import React, { useState, useEffect } from 'react';
import { DownloadCloud, FileText, Loader } from 'lucide-react';
import { documentsApi } from '../../api/documentsApi';
import './TermsAndConditions.css';

const TermsAndConditions = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchDocuments = async () => {
      try {
        setLoading(true);
        const data = await documentsApi.getDocumentsByType(3);
        setDocuments(data);
        setError(null);
      } catch (err) {
        setError('Gagal memuat dokumen. Silakan coba lagi.');
        console.error('Error fetching documents:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDocuments();
  }, []);

  const handleDownload = (document) => {
    if (document.document_url) {
      window.open(document.document_url, '_blank');
    }
  };

  return (
    <div className="tc-page">
      {/* HEADER */}
      <div className="tc-header">
        <div className="tc-header-left">
          <h1>Terms and Conditions</h1>
          <p>Everything you need to know about your koperasi membership</p>
        </div>
        {documents.length > 0 && (
          <div className="tc-header-actions">
            <button className="btn-download" onClick={() => handleDownload(documents[0])}>
              <DownloadCloud size={17} />
              Download TnC
            </button>
          </div>
        )}
      </div>

      {/* DOCUMENT VIEWER */}
      <div className="tc-document-viewer">
        {loading ? (
          <div className="tc-document-viewer-content">
            <Loader size={48} className="tc-doc-icon tc-loading" strokeWidth={1.5} />
            <h3>Memuat dokumen...</h3>
          </div>
        ) : error ? (
          <div className="tc-document-viewer-content">
            <FileText size={56} className="tc-doc-icon" strokeWidth={1.5} />
            <h3>Terjadi kesalahan</h3>
            <p>{error}</p>
          </div>
        ) : documents.length > 0 ? (
          <div className="tc-document-viewer-content">
            <iframe
              src={`${documents[0].document_url}#toolbar=1`}
              title="Terms and Conditions PDF"
              className="tc-pdf-viewer"
              style={{
                width: '100%',
                height: '100%',
                border: 'none',
                borderRadius: '8px',
              }}
            />
          </div>
        ) : (
          <div className="tc-document-viewer-content">
            <FileText size={56} className="tc-doc-icon" strokeWidth={1.5} />
            <h3>Terms & Conditions document viewer</h3>
            <p>Dokumen belum tersedia</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TermsAndConditions;