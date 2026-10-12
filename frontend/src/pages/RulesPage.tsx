import React, { useEffect, useState } from 'react';
import { rulesApi } from '../services/rulesApi';
import { SeparationRule } from '../types/models';
import { useI18n } from '../i18n';
import ScenarioDataTabs from '../components/ScenarioDataTabs';

function clauseText(rule: SeparationRule): string {
  if (rule.clauses.length === 0) return 'Luôn khớp (không điều kiện)';
  const parts = rule.clauses.map(c =>
    c.right_field
      ? `${c.left_field} ${c.op} prev.${c.right_field}`
      : `${c.left_field} ${c.op} ${JSON.stringify(c.right_value)}`
  );
  return parts.join(` ${rule.join} `);
}

const RulesPage = () => {
  const { t } = useI18n();
  const [rules, setRules] = useState<SeparationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    rulesApi.list()
      .then(setRules)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <ScenarioDataTabs />
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ marginBottom: '20px' }}>
          <h1 style={{ fontSize: '24px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>Rules</h1>
        </div>

        <div style={{
          marginBottom: '20px', padding: '14px 18px', borderRadius: '10px',
          backgroundColor: 'rgba(251,191,36,0.08)', border: '1px solid var(--warning)',
        }}>
          <strong style={{ color: 'var(--warning)' }}>Chỉ đọc:</strong>{' '}
          <span style={{ color: 'var(--text)', fontSize: '13.5px' }}>
            Đây là rule đang chạy thật trong pipeline <code>seasonal_plan_parser → route_resolver → separation_rules →
            flightplan_scenario_builder</code> (dùng khi Traffic Demand source = seasonal_schedule). Trang này CHƯA hỗ trợ
            chỉnh sửa — sửa rule cần sửa trực tiếp file Python; scenario dùng nguồn "Sức chứa theo thủ tục thực"
            (procedure_capacity) không đi qua rule engine này mà dùng phân cách riêng trong Constraints.
          </span>
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: '16px' }}>{error}</div>}
        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</div>
        ) : (
          <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13.5px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface)', textAlign: 'left' }}>
                  <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>#</th>
                  <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Tên rule</th>
                  <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Movement</th>
                  <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Phân cách (phút)</th>
                  <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Điều kiện</th>
                  <th style={{ padding: '10px 16px', color: 'var(--text-muted)', fontWeight: 600 }}>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r, i) => (
                  <tr key={r.name} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)' }}>{i + 1}</td>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: 'var(--text)' }}>{r.name}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{
                        padding: '2px 10px', borderRadius: '999px', fontSize: '12px', fontWeight: 600,
                        backgroundColor: r.movement === 'dep' ? 'rgba(59,130,246,0.15)' : 'rgba(16,185,129,0.15)',
                        color: r.movement === 'dep' ? '#3b82f6' : '#10b981',
                      }}>
                        {r.movement === 'dep' ? 'Cất cánh' : 'Hạ cánh'}
                      </span>
                    </td>
                    <td style={{ padding: '10px 16px', color: 'var(--text)', fontFamily: 'monospace' }}>{r.minutes}</td>
                    <td style={{ padding: '10px 16px', color: 'var(--text-muted)', fontFamily: 'monospace', fontSize: '12.5px' }}>{clauseText(r)}</td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ color: r.active ? 'var(--success)' : 'var(--text-muted)', fontWeight: 600 }}>
                        {r.active ? 'Đang bật' : 'Tắt'}
                      </span>
                    </td>
                  </tr>
                ))}
                {rules.length === 0 && (
                  <tr><td colSpan={6} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('common.noData')}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default RulesPage;
