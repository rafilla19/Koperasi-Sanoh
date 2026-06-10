import React, { createContext, useState, useEffect, useContext } from 'react';
import id from '../locales/id.json';
import en from '../locales/en.json';

const LanguageContext = createContext();

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState('id');

  useEffect(() => {
    const savedLang = localStorage.getItem('app_language');
    if (savedLang) {
      setLanguage(savedLang);
    }
  }, []);

  const changeLanguage = (lang) => {
    setLanguage(lang);
    localStorage.setItem('app_language', lang);
  };

  const t = (key) => {
    const dict = language === 'en' ? en : id;
    const keys = key.split('.');
    let value = dict;
    for (let k of keys) {
      if (value[k] === undefined) {
        // Fallback to Indonesian if English key is missing
        if (language === 'en') {
          let fallback = id;
          for (let f of keys) {
             if (fallback[f] === undefined) return key;
             fallback = fallback[f];
          }
          return fallback;
        }
        return key; // Key not found
      }
      value = value[k];
    }
    return value;
  };

  return (
    <LanguageContext.Provider value={{ language, changeLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
