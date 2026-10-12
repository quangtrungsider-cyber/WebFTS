import React from 'react';
import { useLocation } from 'react-router-dom';
import { NAVIGATION } from '../../app/navigation';
import { useI18n } from '../../i18n';

const Breadcrumb = () => {
  const location = useLocation();
  const { t } = useI18n();
  const currentNav = NAVIGATION.find(nav => location.pathname.startsWith(nav.path));

  if (!currentNav) return null;

  return (
    <div style={{ paddingBottom: '16px', fontSize: '13px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
      <i className="fa-solid fa-home"></i>
      <span>/</span>
      <span>{t(currentNav.i18nKey)}</span>
      {location.pathname !== currentNav.path && (
        <>
          <span>/</span>
          <span style={{ color: 'var(--text)' }}>Details</span>
        </>
      )}
    </div>
  );
};

export default Breadcrumb;
