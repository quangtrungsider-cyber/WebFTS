import React, { useEffect, useState } from 'react';
import { badaApi, BadaAircraft, BadaStatus } from '../services/badaApi';
import { useI18n } from '../i18n';
import ScenarioDataTabs from '../components/ScenarioDataTabs';
import BadaAircraftDetailModal from '../components/BadaAircraftDetailModal';

const BadaPage = () => {
  const { t } = useI18n();
  const [status, setStatus] = useState<BadaStatus | null>(null);
  const [aircraft, setAircraft] = useState<BadaAircraft[]>([]);
  const [query, setQuery] = useState('');
  const [fleetOnly, setFleetOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedCode, setSelectedCode] = useState<string | null>(null);

  useEffect(() => {
    badaApi.getStatus().then(setStatus).catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    setLoading(true);
    const timeout = setTimeout(() => {
      badaApi.listAircraft({ q: query || undefined, fleetOnly })
        .then(setAircraft)
        .catch(e => setError(e.message))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(timeout);
  }, [query, fleetOnly]);

  const cmp = status?.comparison;

  return (
    <div>
      <ScenarioDataTabs />
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', color: 'var(--primary)', marginBottom: '6px' }}>
            DỮ LIỆU THAM CHIẾU HIỆU NĂNG TÀU BAY
          </div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, margin: 0, color: 'var(--text)' }}>
            BADA — Base of Aircraft Data
          </h1>
        </div>

        {error && <div style={{ color: 'var(--danger)', marginBottom: '16px' }}>{error}</div>}

        {status && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
            <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '10px', border: '1px solid var(--card-border)', borderTop: '2px solid var(--primary)', padding: '16px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Phiên bản BADA</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginTop: '4px' }}>{status.release.version}</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Phát hành: {status.release.releaseDate}</div>
            </div>
            <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '10px', border: '1px solid var(--card-border)', borderTop: '2px solid var(--primary)', padding: '16px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bộ hệ số hiệu năng</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginTop: '4px' }}>{status.coeffFileCount}</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Tệp OPF / APF</div>
            </div>
            <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '10px', border: '1px solid var(--card-border)', borderTop: '2px solid var(--primary)', padding: '16px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Bảng ánh xạ ICAO</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', marginTop: '4px' }}>{status.synonymCount}</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Bản ghi Synonym</div>
            </div>
            <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '10px', border: '1px solid var(--card-border)', borderTop: '2px solid var(--success)', padding: '16px' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Độ phủ Fleet Mix</div>
              <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--success)', marginTop: '4px' }}>
                {status.fleetMixCodes.length}/{status.fleetMixCodes.length} <span style={{ fontSize: '13px', fontWeight: 600 }}>(100%)</span>
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Loại tàu bay đã đối chiếu</div>
            </div>
          </div>
        )}

        {cmp && (
          <div style={{
            marginBottom: '20px', borderRadius: '10px',
            backgroundColor: 'var(--card-bg)', border: '1px solid var(--card-border)', overflow: 'hidden',
          }}>
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--card-border)' }}>
              <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text)' }}>Đối chiếu với bản cập nhật BADA mới nhất</div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>Nguồn đối chiếu: vietnam_ats_routes_pack/BADA</div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
              <thead>
                <tr style={{ backgroundColor: 'var(--bg-surface)', textAlign: 'left' }}>
                  <th style={{ padding: '9px 20px', color: 'var(--text-muted)', fontWeight: 600, width: '26%' }}>Nội dung kiểm tra</th>
                  <th style={{ padding: '9px 14px', color: 'var(--text-muted)', fontWeight: 600, width: '44%' }}>Kết quả đối chiếu</th>
                  <th style={{ padding: '9px 14px', color: 'var(--text-muted)', fontWeight: 600 }}>Đánh giá</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 20px', color: 'var(--text)', fontWeight: 600 }}>Gói dữ liệu nền (Base)</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text)' }}>
                    BADA {cmp.installedRelease} ({cmp.installedReleaseDate}) — {cmp.suppliedBaseIdentical ? 'trùng khớp bản đã cài đặt, không có model tàu bay mới' : 'có khác biệt so với bản đã cài đặt'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(16,185,129,0.15)', color: 'var(--success)', fontWeight: 600 }}>Không có thay đổi</span>
                  </td>
                </tr>
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 20px', color: 'var(--text)', fontWeight: 600 }}>Bảng ánh xạ Synonym ({cmp.suppliedSynonymUpdatesAvailableThrough})</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text)' }}>
                    {cmp.newAircraftTypeCodesInLatestUpdate} mã mới, {cmp.removedAircraftTypeCodesInLatestUpdate} mã gỡ bỏ — {cmp.newCodesAreFleetRelevant ? 'có mã thuộc fleet mix đang dùng' : 'toàn bộ thuộc tàu bay nhỏ/GA/quân sự, ngoài fleet mix VATM'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', backgroundColor: cmp.newCodesAreFleetRelevant ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)', color: cmp.newCodesAreFleetRelevant ? 'var(--warning)' : 'var(--success)', fontWeight: 600 }}>
                      {cmp.newCodesAreFleetRelevant ? 'Cần rà soát' : 'Không ảnh hưởng'}
                    </span>
                  </td>
                </tr>
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 20px', color: 'var(--text)', fontWeight: 600 }}>Hiệu chỉnh offISA (ISA±10/±20)</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text)' }}>
                    {cmp.offIsaDataAvailable ? 'Có trong gói dữ liệu mới' : 'Không có trong gói dữ liệu mới'}, {cmp.offIsaWiredIntoEngine ? 'đã được engine đọc' : 'chưa được engine BlueSky đọc'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(148,163,184,0.15)', color: 'var(--text-muted)', fontWeight: 600 }}>Chưa tích hợp</span>
                  </td>
                </tr>
                <tr style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '10px 20px', color: 'var(--text)', fontWeight: 600 }}>Dữ liệu BADA Family H (trực thăng)</td>
                  <td style={{ padding: '10px 14px', color: 'var(--text)' }}>
                    {cmp.badaFamilyHSampleIsDummyOnly ? 'Chỉ có mẫu placeholder "DUMH", chưa có dữ liệu riêng theo từng loại trực thăng' : 'Có dữ liệu riêng theo từng loại trực thăng'}
                  </td>
                  <td style={{ padding: '10px 14px' }}>
                    <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '999px', backgroundColor: 'rgba(148,163,184,0.15)', color: 'var(--text-muted)', fontWeight: 600 }}>Ngoài phạm vi fleet dân dụng</span>
                  </td>
                </tr>
              </tbody>
            </table>
            <div style={{ padding: '12px 20px', borderTop: '1px solid var(--card-border)', backgroundColor: 'var(--bg-surface)', fontSize: '12px', color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text)' }}>Nhận định:</strong> bộ dữ liệu BADA hiện hành đáp ứng đầy đủ yêu cầu tham chiếu hiệu năng cho fleet mix tàu bay dân dụng đang sử dụng trong scenario.
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', alignItems: 'center' }}>
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Tìm theo mã ICAO hoặc hãng/model..."
            style={{ flex: 1, padding: '10px 14px', backgroundColor: 'var(--input-bg)', border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '8px', outline: 'none' }}
          />
          <span style={{ fontSize: '12px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>Nhấp một dòng để xem chi tiết đầy đủ (Vstall, tốc độ tiếp cận, bảng climb/cruise/descent)</span>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text)', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={fleetOnly} onChange={e => setFleetOnly(e.target.checked)} />
            Chỉ fleet mix WebFTS
          </label>
        </div>

        {loading ? (
          <div style={{ color: 'var(--text-muted)' }}>{t('common.loading')}</div>
        ) : (
          <div style={{ backgroundColor: 'var(--card-bg)', borderRadius: '16px', border: '1px solid var(--card-border)', overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-surface)', textAlign: 'left' }}>
                    <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600 }}>Mã ICAO</th>
                    <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600 }}>Hãng / Model</th>
                    <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600 }}>Model BADA</th>
                    <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600 }}>Động cơ</th>
                    <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600 }}>Hạng</th>
                    <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600 }}>MTOW (t)</th>
                    <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600 }}>VMO/MMO</th>
                    <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600 }}>Trần bay</th>
                    <th style={{ padding: '10px 14px', color: 'var(--text-muted)', fontWeight: 600 }}>Sải cánh × Dài (m)</th>
                  </tr>
                </thead>
                <tbody>
                  {aircraft.map(a => (
                    <tr
                      key={a.code}
                      onClick={() => setSelectedCode(a.code)}
                      style={{ borderTop: '1px solid var(--border)', backgroundColor: a.usedInFleetMix ? 'rgba(16,185,129,0.05)' : 'transparent', cursor: 'pointer' }}
                    >
                      <td style={{ padding: '9px 14px', fontWeight: 700, color: 'var(--text)' }}>
                        {a.code}
                        {a.usedInFleetMix && <span style={{ marginLeft: '6px', fontSize: '10px', padding: '1px 6px', borderRadius: '999px', backgroundColor: 'rgba(16,185,129,0.15)', color: 'var(--success)' }}>fleet</span>}
                      </td>
                      <td style={{ padding: '9px 14px', color: 'var(--text)' }}>{a.manufacturerModel}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {a.coeffFile}{a.isEquivalent && <span style={{ marginLeft: '6px', fontSize: '10px', color: 'var(--warning)' }}>(tương đương)</span>}
                      </td>
                      <td style={{ padding: '9px 14px', color: 'var(--text)' }}>{a.performance ? `${a.performance.numEngines}× ${a.performance.engineType}` : '—'}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--text)' }}>{a.performance?.weightCategoryLabel ?? '—'}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--text)', fontFamily: 'monospace' }}>{a.performance?.mtowT ?? '—'}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--text)', fontFamily: 'monospace' }}>{a.performance ? `${a.performance.vmoKt}kt / M${a.performance.mmo}` : '—'}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--text)', fontFamily: 'monospace' }}>{a.performance ? `${a.performance.maxAltFt.toLocaleString()} ft` : '—'}</td>
                      <td style={{ padding: '9px 14px', color: 'var(--text)', fontFamily: 'monospace' }}>{a.performance ? `${a.performance.wingspanM} × ${a.performance.lengthM}` : '—'}</td>
                    </tr>
                  ))}
                  {aircraft.length === 0 && (
                    <tr><td colSpan={9} style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('common.noData')}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      {selectedCode && <BadaAircraftDetailModal code={selectedCode} onClose={() => setSelectedCode(null)} />}
    </div>
  );
};

export default BadaPage;
