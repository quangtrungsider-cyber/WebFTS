import React, { useEffect, useState } from 'react';
import { airportProceduresApi } from '../services/airportProceduresApi';
import { scenarioApi } from '../services/scenarioApi';
import { scenarioScnApi } from '../services/scenarioScnApi';
import { AirportProcedures, Scenario } from '../types/models';

interface ExportResult {
  icCommand: string;
  scenarioPath: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '10px 12px', backgroundColor: 'var(--input-bg)',
  border: '1px solid var(--input-border)', color: 'var(--text)', borderRadius: '8px', outline: 'none',
};
const labelStyle: React.CSSProperties = { display: 'block', fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 };

interface Props {
  studyId: string;
  onCreated: (scenario: Scenario) => void;
}

/** Lightweight "1 aircraft" scenario builder: pick an airport, a real STAR
 * transition, and (when the airport publishes more than one) an IAP label,
 * then create+freeze+export in one click. Under the hood this is just the
 * SAME real procedure_capacity engine (capacity_scenario_engine.py) the
 * advanced "Sức chứa" form uses, with sidMix={} (no departures) and
 * starMix={star: 1} (exactly one arrival) -- not a separate/simpler engine,
 * so the flown route is the real one, not a shortcut. */
const SimpleScenarioBuilder: React.FC<Props> = ({ studyId, onCreated }) => {
  const [airports, setAirports] = useState<string[]>([]);
  const [airport, setAirport] = useState('');
  const [procs, setProcs] = useState<AirportProcedures | null>(null);
  const [star, setStar] = useState('');
  const [iap, setIap] = useState('');
  const [loadingProcs, setLoadingProcs] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ExportResult | null>(null);

  useEffect(() => {
    airportProceduresApi.listAirports()
      .then(list => {
        setAirports(list);
        if (list.length > 0) setAirport(list[0]);
      })
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    if (!airport) { setProcs(null); return; }
    setLoadingProcs(true);
    setError('');
    airportProceduresApi.getProcedures(airport)
      .then(p => {
        setProcs(p);
        setStar(p.starTransitions[0] || '');
        setIap((p.iapOptions && p.iapOptions[0]) || '');
      })
      .catch(e => setError(e.message))
      .finally(() => setLoadingProcs(false));
  }, [airport]);

  const handleCreate = async () => {
    if (!studyId || !airport || !star) return;
    setSubmitting(true);
    setError('');
    setResult(null);
    try {
      const name = `${airport} - 1 tàu bay - STAR ${star}${iap ? ' - ' + iap : ''}`;
      const created = await scenarioApi.createScenario({
        studyId,
        name,
        type: 'baseline',
        status: 'draft',
        airport,
        procedureConfig: {
          sidStarMode: 'manual',
          selectedStars: [star],
          ...(iap ? { selectedIaps: [iap] } : {}),
        },
        trafficDemand: {
          source: 'procedure_capacity',
          capacityConfig: {
            sidMix: {},
            starMix: { [star]: 1 },
            hours: 1,
            seed: 20260727,
            asasOn: false,
            minArrArrGapSec: 180,
            depAfterArrGapSec: 30,
            minRunwayGapSec: 60,
            // The hourly scheduler otherwise places a lone arrival near
            // minute 30 (it's built to spread N arrivals across the hour),
            // so the aircraft wouldn't even spawn until ~15-20 simulated
            // minutes after IC -- shift the whole (single-flight) schedule
            // so it starts at t=0 instead.
            alignFirstSpawnToZero: true,
          },
        },
      });
      await scenarioApi.freezeScenario(created.id);
      // export-scn already WRITES the real .scn file into FTS Server/
      // scenario/ server-side -- no need to also push a browser download,
      // the file is already there to run (Scenario Launcher, or the
      // printed "IC ..." command) exactly like any other exported scenario.
      const exported = await scenarioScnApi.exportScenarioScn(created.id);
      setResult({ icCommand: exported.icCommand, scenarioPath: exported.scenarioPath });
      onCreated(created);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '20px' }}>
        Dựng nhanh một kịch bản 1 chuyến bay: bay đúng theo STAR và IAP đã chọn, hạ cánh tại sân bay.
        Cùng engine mô phỏng với form Nâng cao, chỉ rút gọn thao tác thiết lập.
      </div>

      {error && <div style={{ color: 'var(--danger)', fontSize: '13px', marginBottom: '16px' }}>{error}</div>}

      {result && (
        <div style={{ fontSize: '13px', color: 'var(--success)', marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', backgroundColor: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)' }}>
          Đã lưu kịch bản vào <code>{result.scenarioPath}</code>. Chạy bằng lệnh <code>{result.icCommand}</code> (hoặc mở qua Trình chạy kịch bản).
        </div>
      )}

      <div style={{ marginBottom: '18px' }}>
        <label style={labelStyle}>Sân bay</label>
        <select value={airport} onChange={e => setAirport(e.target.value)} style={inputStyle}>
          {airports.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>

      {loadingProcs && <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Đang tải dữ liệu thủ tục…</div>}

      {procs && (
        <>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>
            {procs.icao}: hạ cánh RWY{procs.arrRunway} · cất cánh RWY{procs.depRunway}
          </div>

          <div style={{ marginBottom: '18px' }}>
            <label style={labelStyle}>STAR (điểm bắt đầu tiếp cận)</label>
            <select value={star} onChange={e => setStar(e.target.value)} style={inputStyle}>
              {procs.starTransitions.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          {procs.iapOptions && procs.iapOptions.length > 0 && (
            <div style={{ marginBottom: '18px' }}>
              <label style={labelStyle}>IAP (phương thức tiếp cận)</label>
              <select value={iap} onChange={e => setIap(e.target.value)} style={inputStyle}>
                {procs.iapOptions.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          )}
        </>
      )}

      <button
        onClick={handleCreate}
        disabled={submitting || !studyId || !airport || !star}
        style={{
          marginTop: '8px', backgroundColor: 'var(--primary)', color: 'white', border: 'none',
          padding: '10px 20px', borderRadius: '8px', fontWeight: 600,
          cursor: submitting || !studyId ? 'not-allowed' : 'pointer', opacity: submitting ? 0.7 : 1,
        }}
      >
        {submitting ? 'Đang tạo…' : 'Tạo & Xuất kịch bản'}
      </button>
    </div>
  );
};

export default SimpleScenarioBuilder;
