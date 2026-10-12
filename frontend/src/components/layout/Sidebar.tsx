import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { NAVIGATION_GROUPS, NavItem } from '../../app/navigation';
import { useI18n } from '../../i18n';

const isItemActive = (item: NavItem, pathname: string): boolean => {
  if (item.children) return item.children.some(c => isItemActive(c, pathname));
  return pathname === item.path || pathname.startsWith(item.path + '/');
};

const Sidebar = () => {
  const { t } = useI18n();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    NAVIGATION_GROUPS.forEach(group => group.items.forEach(item => {
      if (item.children && isItemActive(item, location.pathname)) initial[item.path] = true;
    }));
    return initial;
  });

  const toggleExpanded = (path: string) => {
    setExpanded(prev => ({ ...prev, [path]: !prev[path] }));
  };

  const renderLeaf = (item: NavItem, indent: boolean) => (
    <NavLink
      key={item.path}
      to={item.path}
      end={item.path === '/scenarios'}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        padding: collapsed ? '12px 0' : indent ? '8px 20px 8px 44px' : '10px 20px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        color: isActive ? 'var(--primary)' : 'var(--text-muted)',
        textDecoration: 'none',
        backgroundColor: isActive ? 'var(--primary-light)' : 'transparent',
        borderRight: isActive && !collapsed ? '3px solid var(--primary)' : '3px solid transparent',
        transition: 'all 0.2s ease',
        fontWeight: isActive ? 600 : 500,
        fontSize: indent ? '13px' : '14px',
        gap: '12px'
      })}
    >
      <i className={item.icon} style={{ width: indent ? '16px' : '20px', textAlign: 'center', fontSize: collapsed ? '18px' : indent ? '14px' : '16px' }}></i>
      {!collapsed && <span>{t(item.i18nKey)}</span>}
    </NavLink>
  );

  const renderItem = (item: NavItem) => {
    if (!item.children) return renderLeaf(item, false);

    const active = isItemActive(item, location.pathname);
    const isOpen = collapsed ? false : (expanded[item.path] ?? active);

    return (
      <div key={item.path}>
        <button
          onClick={() => toggleExpanded(item.path)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: '12px',
            padding: collapsed ? '12px 0' : '10px 20px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            background: active ? 'var(--primary-light)' : 'transparent',
            border: 'none', cursor: 'pointer', textAlign: 'left',
            color: active ? 'var(--primary)' : 'var(--text-muted)',
            borderRight: active && !collapsed ? '3px solid var(--primary)' : '3px solid transparent',
            fontWeight: active ? 600 : 500, fontSize: '14px', fontFamily: 'inherit',
          }}
        >
          <i className={item.icon} style={{ width: '20px', textAlign: 'center', fontSize: collapsed ? '18px' : '16px' }}></i>
          {!collapsed && (
            <>
              <span style={{ flex: 1 }}>{t(item.i18nKey)}</span>
              <i className={`fa-solid ${isOpen ? 'fa-chevron-up' : 'fa-chevron-down'}`} style={{ fontSize: '11px' }}></i>
            </>
          )}
        </button>
        {!collapsed && isOpen && (
          <div>{item.children.map(child => renderLeaf(child, true))}</div>
        )}
      </div>
    );
  };

  return (
    <aside className={`fts-sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div style={{ height: '64px', display: 'flex', alignItems: 'center', padding: collapsed ? '0' : '0 20px', justifyContent: collapsed ? 'center' : 'flex-start', borderBottom: '1px solid var(--sidebar-border)' }}>
        {collapsed ? (
          <i className="fa-solid fa-plane-departure" style={{ fontSize: '24px', color: 'var(--primary)' }}></i>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <i className="fa-solid fa-plane-departure" style={{ fontSize: '24px', color: 'var(--primary)' }}></i>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 800, fontSize: '18px', lineHeight: 1, letterSpacing: '0.5px' }}>WebFTS</span>
              <span style={{ fontSize: '10px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginTop: '2px' }}>VATM Platform</span>
            </div>
          </div>
        )}
      </div>

      <nav className="fts-nav" style={{ flex: 1, overflowY: 'auto', padding: '16px 0' }}>
        {NAVIGATION_GROUPS.map((group) => (
          <div key={group.key} style={{ marginBottom: '20px' }}>
            {!collapsed && (
              <div style={{ padding: '0 20px', fontSize: '11px', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '8px', letterSpacing: '1px' }}>
                {t(group.i18nKey)}
              </div>
            )}
            {group.items.map((item) => renderItem(item))}
          </div>
        ))}
      </nav>

      <div style={{ padding: '16px', borderTop: '1px solid var(--sidebar-border)', display: 'flex', justifyContent: collapsed ? 'center' : 'flex-end' }}>
        <button
          onClick={() => setCollapsed(!collapsed)}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '8px', borderRadius: '8px' }}
        >
          <i className={collapsed ? "fa-solid fa-chevron-right" : "fa-solid fa-chevron-left"}></i>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
