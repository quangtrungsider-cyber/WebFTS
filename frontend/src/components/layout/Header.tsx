import React, { useState } from 'react';
import { useI18n } from '../../i18n';
import { useTheme } from '../../theme/ThemeProvider';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../../auth/AuthProvider';

const Header = () => {
  const { t, language, setLanguage } = useI18n();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  
  const { user, logout } = useAuth();

  const handleSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchQuery) {
      if (searchQuery.toLowerCase().includes('scenario')) navigate('/scenarios');
      else if (searchQuery.toLowerCase().includes('kpi')) navigate('/kpi-reports');
      else if (searchQuery.toLowerCase().includes('study')) navigate('/studies');
      else navigate('/dashboard');
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <header className="fts-header">
      <div style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
        <div style={{ position: 'relative', width: '300px' }}>
          <i className="fa-solid fa-search" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }}></i>
          <input 
            type="text" 
            placeholder={language === 'vi' ? 'Tìm studies, scenarios, recordings...' : 'Search studies, scenarios, recordings...'}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={handleSearch}
            style={{ 
              width: '100%', 
              padding: '8px 12px 8px 36px', 
              borderRadius: '20px', 
              border: '1px solid var(--input-border)', 
              backgroundColor: 'var(--input-bg)',
              color: 'var(--text)',
              fontSize: '14px',
              outline: 'none'
            }} 
          />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => navigate('/studies')} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>+ {t('nav.studies')}</button>
          <button onClick={() => navigate('/scenarios')} style={{ background: 'none', border: '1px solid var(--primary)', color: 'var(--primary)', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px' }}>+ {t('nav.scenarios')}</button>
          <button onClick={() => navigate('/simulations/live')} style={{ backgroundColor: 'var(--primary)', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600 }}>{t('nav.liveSimulation')}</button>
        </div>

        <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border)' }}></div>

        <button 
          onClick={() => setLanguage(language === 'vi' ? 'en' : 'vi')}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '14px' }}
        >
          <i className="fa-solid fa-globe"></i>
          {language === 'vi' ? 'VI' : 'EN'}
        </button>

        <button 
          onClick={toggleTheme}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '16px' }}
        >
          <i className={theme === 'dark' ? "fa-solid fa-moon" : "fa-solid fa-sun"}></i>
        </button>

        <div style={{ width: '1px', height: '24px', backgroundColor: 'var(--border)' }}></div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: 'var(--primary)', color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600 }}>
              {user?.displayName?.[0]?.toUpperCase() || 'U'}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{user?.displayName || 'User'}</span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'capitalize' }}>{user?.role || 'Guest'}</span>
            </div>
          </div>
          
          <button 
            onClick={handleLogout}
            title="Logout"
            style={{ background: 'none', border: 'none', color: 'var(--error, #d32f2f)', cursor: 'pointer', fontSize: '16px', marginLeft: '8px' }}
          >
            <i className="fa-solid fa-sign-out-alt"></i>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Header;
