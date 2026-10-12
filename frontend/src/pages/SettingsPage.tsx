import React, { useState, useEffect } from 'react';
import { PermissionGate } from '../auth/PermissionGate';
import { UserManagementTab } from './settings/UserManagementTab';
import { aiScenarioApi } from '../services/aiScenarioApi';
import { AIProvider, AISettings } from '../types/models';

const AI_PROVIDERS: { value: AIProvider; label: string; desc: string }[] = [
  { value: 'rule_based', label: 'Rule-based (no API key)', desc: 'Deterministic generation using airport procedure data. No external API call needed.' },
  { value: 'claude',     label: 'Claude (Anthropic)',      desc: 'Uses claude-sonnet-4-6 via Anthropic API. Requires a valid API key.' },
  { value: 'gemini',     label: 'Gemini 2.5 Flash (Google)', desc: 'Uses gemini-2.5-flash via Google AI API. Requires a valid API key.' },
];

const inputStyle: React.CSSProperties = {
  width: '100%', maxWidth: '420px', padding: '10px',
  backgroundColor: '#2a2a2a', border: '1px solid #555',
  color: 'white', borderRadius: '4px', fontSize: '14px',
  fontFamily: 'monospace',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '13px', color: '#aaa', marginBottom: '6px',
};

function AIGenerationTab() {
  const [provider, setProvider] = useState<AIProvider>('rule_based');
  const [claudeKey, setClaudeKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    aiScenarioApi.getSettings().then(d => {
      const ai = d.aiGeneration;
      setProvider(ai.provider ?? 'rule_based');
      setClaudeKey(ai.claudeApiKey ?? '');
      setGeminiKey(ai.geminiApiKey ?? '');
    }).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true); setError(''); setSaved(false);
    try {
      const payload: Partial<AISettings> = { provider };
      if (provider === 'claude')  payload.claudeApiKey = claudeKey;
      if (provider === 'gemini')  payload.geminiApiKey = geminiKey;
      await aiScenarioApi.saveSettings(payload);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h3 style={{ margin: '0 0 20px 0', borderBottom: '1px solid #333', paddingBottom: '10px' }}>
        AI Scenario Generation
      </h3>

      <div style={{ marginBottom: '24px' }}>
        <label style={labelStyle}>Generation Provider</label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxWidth: '480px' }}>
          {AI_PROVIDERS.map(p => (
            <label key={p.value} style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', cursor: 'pointer',
              padding: '12px 14px', borderRadius: '6px', border: `1px solid ${provider === p.value ? '#1976d2' : '#444'}`,
              backgroundColor: provider === p.value ? 'rgba(25,118,210,0.08)' : 'transparent' }}>
              <input
                type="radio"
                name="provider"
                value={p.value}
                checked={provider === p.value}
                onChange={() => setProvider(p.value)}
                style={{ marginTop: '2px', accentColor: '#1976d2' }}
              />
              <div>
                <div style={{ color: provider === p.value ? '#64b5f6' : '#ddd', fontWeight: 500, fontSize: '14px' }}>{p.label}</div>
                <div style={{ color: '#888', fontSize: '12px', marginTop: '2px' }}>{p.desc}</div>
              </div>
            </label>
          ))}
        </div>
      </div>

      {provider === 'claude' && (
        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>Anthropic API Key</label>
          <input
            type="password"
            value={claudeKey}
            onChange={e => setClaudeKey(e.target.value)}
            placeholder="sk-ant-..."
            style={inputStyle}
            autoComplete="off"
          />
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            Stored server-side only. Never exposed to the browser after save.
          </div>
        </div>
      )}

      {provider === 'gemini' && (
        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>Google AI API Key</label>
          <input
            type="password"
            value={geminiKey}
            onChange={e => setGeminiKey(e.target.value)}
            placeholder="AIza..."
            style={inputStyle}
            autoComplete="off"
          />
          <div style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
            Stored server-side only. Never exposed to the browser after save.
          </div>
        </div>
      )}

      {error && <div style={{ color: '#f44336', fontSize: '13px', marginBottom: '12px' }}>{error}</div>}

      <button
        onClick={handleSave}
        disabled={saving}
        style={{ backgroundColor: '#1976d2', color: 'white', border: 'none',
          padding: '10px 24px', borderRadius: '4px', cursor: saving ? 'default' : 'pointer',
          opacity: saving ? 0.6 : 1, fontSize: '14px' }}
      >
        {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
      </button>
    </>
  );
}

const SettingsPage = () => {
  const [activeTab, setActiveTab] = useState('system');

  const tabStyle = (tab: string): React.CSSProperties => ({
    padding: '15px 20px',
    borderBottom: '1px solid #333',
    backgroundColor: activeTab === tab ? 'rgba(25, 118, 210, 0.1)' : 'transparent',
    color: activeTab === tab ? '#64b5f6' : '#aaaaaa',
    fontWeight: activeTab === tab ? 'bold' : 'normal',
    cursor: 'pointer',
  });

  return (
    <div className="settings-page">
      <h2>Platform Settings</h2>

      <div style={{ display: 'grid', gridTemplateColumns: '250px 1fr', gap: '30px', marginTop: '20px' }}>
        <div style={{ backgroundColor: '#1e1e1e', borderRadius: '8px', border: '1px solid #333', overflow: 'hidden' }}>
          <div onClick={() => setActiveTab('system')} style={tabStyle('system')}>
            System Configuration
          </div>

          <PermissionGate permission="users.read">
            <div onClick={() => setActiveTab('users')} style={tabStyle('users')}>
              User Management
            </div>
          </PermissionGate>

          <PermissionGate permission="scenarios.write">
            <div onClick={() => setActiveTab('ai')} style={tabStyle('ai')}>
              AI Scenario Generation
            </div>
          </PermissionGate>

          <div style={{ padding: '15px 20px', borderBottom: '1px solid #333', color: '#555', cursor: 'default' }}>
            Roles &amp; RBAC
          </div>
          <div style={{ padding: '15px 20px', borderBottom: '1px solid #333', color: '#555', cursor: 'default' }}>
            Simulation Engine API
          </div>
          <div style={{ padding: '15px 20px', color: '#555', cursor: 'default' }}>
            Storage &amp; Backup
          </div>
        </div>

        <div style={{ backgroundColor: '#1e1e1e', padding: '30px', borderRadius: '8px', border: '1px solid #333' }}>
          {activeTab === 'system' && (
            <>
              <h3 style={{ margin: '0 0 20px 0', borderBottom: '1px solid #333', paddingBottom: '10px' }}>System Configuration</h3>

              <div style={{ marginBottom: '25px' }}>
                <label style={{ display: 'block', fontSize: '14px', color: '#aaaaaa', marginBottom: '8px' }}>Simulation Node API URL</label>
                <input type="text" value="http://localhost:5000" disabled style={{ width: '100%', maxWidth: '400px', padding: '10px', backgroundColor: '#333', border: '1px solid #555', color: 'white', borderRadius: '4px' }} />
                <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>The URL of the backend engine (Vatm-Engine/Socket.IO)</div>
              </div>

              <div style={{ marginBottom: '25px' }}>
                <label style={{ display: 'block', fontSize: '14px', color: '#aaaaaa', marginBottom: '8px' }}>Default Map Style</label>
                <select disabled style={{ width: '100%', maxWidth: '400px', padding: '10px', backgroundColor: '#333', border: '1px solid #555', color: 'white', borderRadius: '4px' }}>
                  <option>Dark Matter (No Labels)</option>
                  <option>Offline Dark (Local PMTiles)</option>
                </select>
              </div>

              <div style={{ marginBottom: '25px' }}>
                <label style={{ display: 'block', fontSize: '14px', color: '#aaaaaa', marginBottom: '8px' }}>Persistent UI State</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', color: '#ddd' }}>
                  <input type="checkbox" checked disabled />
                  Save map viewport and panel sizes locally
                </label>
              </div>

              <button style={{ backgroundColor: '#1976d2', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '4px', cursor: 'pointer', opacity: 0.5 }}>Save Changes</button>
            </>
          )}

          {activeTab === 'users' && <UserManagementTab />}

          {activeTab === 'ai' && <AIGenerationTab />}
        </div>
      </div>
    </div>
  );
};

export default SettingsPage;
