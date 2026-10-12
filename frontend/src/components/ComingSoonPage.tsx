import React from 'react';
import ScenarioDataTabs from './ScenarioDataTabs';

interface Props {
  title: string;
  icon: string;
  description: string;
  plannedContent: string[];
}

/** Standard "not built yet" page for a Scenarios data-category sub-menu
 * item -- honest placeholder rather than a dead stub, states what the page
 * will manage once built (mirrors TAAM/IDIS's separate data files per
 * category: airports, sectors, waypoints, routes, traffic demand,
 * constraints, rules, weather). */
const ComingSoonPage: React.FC<Props> = ({ title, icon, description, plannedContent }) => (
  <div>
    <ScenarioDataTabs />
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: 700, margin: '0 0 8px 0', color: 'var(--text)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <i className={icon} style={{ color: 'var(--primary)', fontSize: '22px' }}></i>
          {title}
        </h1>
        <p style={{ color: 'var(--text-muted)', fontSize: '14px', margin: 0 }}>{description}</p>
      </div>

      <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', padding: '32px', textAlign: 'center' }}>
        <i className="fa-solid fa-hammer" style={{ fontSize: '32px', color: 'var(--text-muted)', opacity: 0.4, marginBottom: '16px', display: 'block' }}></i>
        <div style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text)', marginBottom: '6px' }}>Chưa xây dựng</div>
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>Trang này sẽ quản lý:</div>
        <ul style={{ listStyle: 'none', padding: 0, margin: '0 auto', maxWidth: '480px', textAlign: 'left' }}>
          {plannedContent.map((line, i) => (
            <li key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '8px 0', borderTop: i > 0 ? '1px dashed var(--border)' : 'none', fontSize: '14px', color: 'var(--text)' }}>
              <i className="fa-solid fa-circle-check" style={{ color: 'var(--text-muted)', opacity: 0.5, marginTop: '3px', fontSize: '12px' }}></i>
              {line}
            </li>
          ))}
        </ul>
      </div>
    </div>
  </div>
);

export default ComingSoonPage;
