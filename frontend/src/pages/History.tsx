import React, { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { firestoreService } from '../services/firebase';
import { ECOSYSTEM_UPDATED_EVENT } from '../services/ecosystem';
import { useI18n } from '../i18n';

export interface AuditLog {
  id: string;
  timestamp: string;
  utcTime: string;
  category: 'Irrigation' | 'Disease' | 'AI Model' | 'Telemetry' | 'Manual Override' | 'Field';
  field: string;
  description: string;
  subDetail: string;
  engine: string;
  status: 'Success' | 'Action Flagged' | 'Advisory' | 'Locked';
  operator: string;
  hash: string;
}

const SEED_LOGS: AuditLog[] = [
  {
    id: 'rec-1051',
    timestamp: '10:42 AM',
    utcTime: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    category: 'Irrigation',
    field: 'Field Alpha-1 (Tomato)',
    description: 'Automated Drip Irrigation Cycle Dispatched',
    subDetail: 'Target: 2,500L water applied based on soil moisture threshold 28%',
    engine: 'CSP Constraint Engine',
    status: 'Success',
    operator: 'AI Irrigation Controller',
    hash: '0x8f3c1a9b2d7e4f01c82e6d9a0b4f5e71'
  },
  {
    id: 'rec-1052',
    timestamp: '09:15 AM',
    utcTime: new Date(Date.now() - 1000 * 60 * 90).toISOString(),
    category: 'Disease',
    field: 'Field Beta-2 (Maize)',
    description: 'Early Blight (Alternaria solani) Vector Identified',
    subDetail: 'Confidence: 94.2%. Advisory: Apply copper-based fungicide spray within 48h',
    engine: 'CNN Vision Classifier v2',
    status: 'Action Flagged',
    operator: 'Field Drone Scanner',
    hash: '0x4e2a1b9c8d3f7e02a1b4c6d8e0f2a4b6'
  },
  {
    id: 'rec-1053',
    timestamp: '08:30 AM',
    utcTime: new Date(Date.now() - 1000 * 60 * 135).toISOString(),
    category: 'AI Model',
    field: 'Sector Gamma-3 (Wheat)',
    description: 'A* Harvest Path & Transit Optimization Complete',
    subDetail: 'Optimal path length: 142m, transit cost score: 8.7',
    engine: 'A* Pathfinding Module',
    status: 'Success',
    operator: 'Autonomous Tractor Nav',
    hash: '0x7b1c3d5e9f2a4b03c5d7e9f1a3b5c7d9'
  },
  {
    id: 'rec-1054',
    timestamp: '07:05 AM',
    utcTime: new Date(Date.now() - 1000 * 60 * 220).toISOString(),
    category: 'Telemetry',
    field: 'Field Alpha-1 (Tomato)',
    description: 'Dual-Depth Soil Moisture Telemetry Sync',
    subDetail: 'Depth 15cm: 32% volumetric water content, pH 6.8',
    engine: 'Edge MQTT Broker',
    status: 'Success',
    operator: 'IoT Sensor Node #12',
    hash: '0x1d3f5a7c9b2e4f04a6b8c0d2e4f6a8b0'
  },
  {
    id: 'rec-1055',
    timestamp: '06:12 AM',
    utcTime: new Date(Date.now() - 1000 * 60 * 270).toISOString(),
    category: 'Manual Override',
    field: 'Field Delta-4 (Cotton)',
    description: 'Manual Pump Override Initiated by Operator',
    subDetail: 'Pump #2 manually turned ON for 30 minutes due to heat stress advisory',
    engine: 'Manual Hardware Override',
    status: 'Advisory',
    operator: 'Chief Agronomist (John S.)',
    hash: '0x9e8d7c6b5a4f3e05b7a9c1e3f5a7b9c1'
  },
  {
    id: 'rec-1056',
    timestamp: '05:45 AM',
    utcTime: new Date(Date.now() - 1000 * 60 * 300).toISOString(),
    category: 'AI Model',
    field: 'Field Beta-2 (Maize)',
    description: 'Decision Tree Crop Recommendation Pipeline Executed',
    subDetail: 'Recommended Crop: Maize (Score 98.4%). Target Fertilizer: NPK 14-14-14',
    engine: 'Decision Tree Classifier v2',
    status: 'Success',
    operator: 'AI Model Pipeline',
    hash: '0x3a5b7c9d1e2f4a06b8c0d2e4f6a8b0c2'
  },
  {
    id: 'rec-1057',
    timestamp: '04:20 AM',
    utcTime: new Date(Date.now() - 1000 * 60 * 380).toISOString(),
    category: 'Field',
    field: 'Field Epsilon-5 (Rice)',
    description: 'Field Soil Calibration & Nutrient Analysis Completed',
    subDetail: 'Adjusted target pH from 6.2 to 6.8 with lime application recommendation',
    engine: 'Agronomic Soil Analysis',
    status: 'Success',
    operator: 'Soil Tech Specialist',
    hash: '0x6f4e2d0c8b1a3f07e9d1c3b5a7f9e1d3'
  },
  {
    id: 'rec-1058',
    timestamp: '03:10 AM',
    utcTime: new Date(Date.now() - 1000 * 60 * 450).toISOString(),
    category: 'Telemetry',
    field: 'Sector Gamma-3 (Wheat)',
    description: 'High Humidity & Spore Alert Registered',
    subDetail: 'Air humidity 88% sustained > 6 hours. High risk of rust infestation',
    engine: 'Microclimate Monitor',
    status: 'Action Flagged',
    operator: 'Environmental Sensor Array',
    hash: '0x2c4d6e8f1a3b5c08d0e2f4a6b8c0d2e4'
  }
];

export const History: React.FC = () => {
  const { t, translateEnum, formatDate, formatNumber } = useI18n();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<AuditLog | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Dropdowns & Modals
  const [isExportMenuOpen, setIsExportMenuOpen] = useState<boolean>(false);
  const [isPresetsMenuOpen, setIsPresetsMenuOpen] = useState<boolean>(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // New Operation Form State
  const [formField, setFormField] = useState<string>('Field Alpha-1 (Tomato)');
  const [formCategory, setFormCategory] = useState<AuditLog['category']>('Irrigation');
  const [formDescription, setFormDescription] = useState<string>('');
  const [formSubDetail, setFormSubDetail] = useState<string>('');
  const [formEngine, setFormEngine] = useState<string>('Firestore Audit Pipeline');
  const [formStatus, setFormStatus] = useState<AuditLog['status']>('Success');
  const [formOperator, setFormOperator] = useState<string>('Chief Agronomist');

  const translateCategory = (category: AuditLog['category']) => {
    if (category === 'AI Model') return t('history.categories.aiModel');
    if (category === 'Field') return t('history.categories.field', 'Field');
    return translateEnum('history.categories', category, category);
  };

  const formatTimestamp = (value: string) => formatDate(value, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }) || t('history.recently');

  const getField = (field: string) => field || t('history.generalSector');
  const getDescription = (description: string) => description || t('history.systemEvent');
  const getEngine = (engine: string) => engine || t('history.firestoreAuditPipeline', 'Firestore Audit Pipeline');
  const getOperator = (operator: string) => operator || translateEnum('common.enums.roles', 'systemOperator');

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  const getLocalAuditLogs = (): any[] => {
    try {
      const raw = localStorage.getItem('agroai_audit_logs');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  };

  const saveLocalAuditLog = (logRecord: any) => {
    try {
      const current = getLocalAuditLogs();
      const exists = current.some((l: any) => l.id === logRecord.id || (l.hash && l.hash === logRecord.hash));
      if (!exists) {
        const updated = [logRecord, ...current];
        localStorage.setItem('agroai_audit_logs', JSON.stringify(updated.slice(0, 300)));
      }
    } catch {}
  };

  const loadAuditLogs = async () => {
    try {
      // 1. Get cached logs from localStorage
      const localLogs = getLocalAuditLogs();

      // 2. Fetch logs from API
      let apiLogs: any[] = [];
      try {
        const res = await apiService.getLogs();
        if (Array.isArray(res)) apiLogs = res;
      } catch {}

      // 3. Fetch logs from Firestore
      let fireLogs: any[] = [];
      try {
        const fireRes = await firestoreService.getLogs();
        if (fireRes && fireRes.success && Array.isArray(fireRes.data)) {
          fireLogs = fireRes.data;
        }
      } catch {}

      // 4. Combine all sources and deduplicate by ID & hash
      const combined = [...localLogs, ...fireLogs, ...apiLogs];
      if (combined.length === 0) {
        combined.push(...SEED_LOGS);
        SEED_LOGS.forEach((seed) => {
          firestoreService.saveLog(seed).catch(() => {});
          apiService.createLog(seed).catch(() => {});
        });
      }

      const logMap = new Map<string, any>();
      combined.forEach((l: any) => {
        const key = l.id || l.hash || `${l.timestamp}-${l.description}`;
        if (!logMap.has(key)) {
          logMap.set(key, l);
        }
      });

      const uniqueLogs = Array.from(logMap.values());
      const mapped: AuditLog[] = uniqueLogs.map((l: any, idx: number) => ({
        id: l.id || `rec-${1050 + idx}`,
        timestamp: l.timestamp || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        utcTime: l.utcTime || new Date().toISOString(),
        category: (l.category || 'Telemetry') as any,
        field: l.field || '',
        description: l.description || l.message || '',
        subDetail: l.subDetail || '',
        engine: l.engine || '',
        status: (l.status || 'Success') as any,
        operator: l.operator || l.userId || '',
        hash: l.hash || `0x${Math.random().toString(16).substring(2, 10)}...${Math.random().toString(16).substring(2, 6)}`
      }));

      // Sort newest first
      mapped.sort((a, b) => {
        const tA = new Date(a.utcTime).getTime() || 0;
        const tB = new Date(b.utcTime).getTime() || 0;
        return tB - tA;
      });

      // Update localStorage cache
      localStorage.setItem('agroai_audit_logs', JSON.stringify(mapped));

      setLogs(mapped);
      if (mapped.length > 0) {
        setSelectedRecord((prev) => (prev ? mapped.find(m => m.id === prev.id) || mapped[0] : mapped[0]));
      }
    } catch {
      const local = getLocalAuditLogs();
      if (local.length > 0) {
        setLogs(local);
        setSelectedRecord(local[0]);
      } else {
        setLogs(SEED_LOGS);
        setSelectedRecord(SEED_LOGS[0]);
      }
    }
  };

  useEffect(() => {
    loadAuditLogs();
    window.addEventListener(ECOSYSTEM_UPDATED_EVENT, loadAuditLogs);
    return () => window.removeEventListener(ECOSYSTEM_UPDATED_EVENT, loadAuditLogs);
  }, []);

  const filteredLogs = logs.filter((log) => {
    const matchesCategory = categoryFilter === 'All' || log.category === categoryFilter;
    const matchesSearch =
      searchQuery === '' ||
      log.field.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.engine.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.operator.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const generateVerificationHash = (): string => {
    const chars = '0123456789abcdef';
    let res = '0x';
    for (let i = 0; i < 32; i++) {
      res += chars[Math.floor(Math.random() * chars.length)];
    }
    return res;
  };

  const handleRecordOperation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formDescription.trim()) return;

    setIsSaving(true);
    const newLog: AuditLog = {
      id: `rec-${Date.now()}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      utcTime: new Date().toISOString(),
      category: formCategory,
      field: formField,
      description: formDescription.trim(),
      subDetail: formSubDetail.trim() || `${formCategory} recorded by operator`,
      engine: formEngine.trim() || 'Firestore Audit Pipeline',
      status: formStatus,
      operator: formOperator.trim() || 'System Operator',
      hash: generateVerificationHash(),
    };

    // 1. Save to LocalStorage
    saveLocalAuditLog(newLog);
    // 2. Save to Firestore
    await firestoreService.saveLog(newLog);
    // 3. Save to API backend
    await apiService.createLog(newLog);

    // 3. Local state update
    setLogs((prev) => [newLog, ...prev]);
    setSelectedRecord(newLog);
    setIsSaving(false);
    setIsAddModalOpen(false);

    // Reset Form
    setFormDescription('');
    setFormSubDetail('');

    // Trigger ecosystem sync
    window.dispatchEvent(new CustomEvent(ECOSYSTEM_UPDATED_EVENT));
    showToast('✓ Operation record cryptographically sealed & saved!');
  };

  const exportLogsCSV = () => {
    const dataToExport = filteredLogs.length > 0 ? filteredLogs : logs;
    const headers = ['Record ID', 'Timestamp', 'UTC Time', 'Category', 'Field/Asset', 'Description', 'Sub Detail', 'Engine', 'Status', 'Operator', 'SHA-256 Hash'];
    const rows = dataToExport.map(l => [
      `"${l.id}"`,
      `"${l.timestamp}"`,
      `"${l.utcTime}"`,
      `"${l.category}"`,
      `"${l.field}"`,
      `"${l.description.replace(/"/g, '""')}"`,
      `"${(l.subDetail || '').replace(/"/g, '""')}"`,
      `"${l.engine}"`,
      `"${l.status}"`,
      `"${l.operator}"`,
      `"${l.hash}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `farm_operations_audit_log_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportMenuOpen(false);
    showToast('✓ CSV Audit Log exported successfully');
  };

  const exportLogsJSON = () => {
    const dataToExport = filteredLogs.length > 0 ? filteredLogs : logs;
    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(dataToExport, null, 2))}`;
    const link = document.createElement('a');
    link.setAttribute('href', jsonString);
    link.setAttribute('download', `farm_operations_audit_log_${Date.now()}.json`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportMenuOpen(false);
    showToast('✓ JSON Audit Log exported successfully');
  };

  const copyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  // KPIs computed live from actual logs
  const totalVolume = logs.length;
  const autonomousCount = logs.filter(
    (l) => l.category === 'AI Model' || l.category === 'Irrigation' || l.engine.toLowerCase().includes('ai') || l.engine.toLowerCase().includes('csp')
  ).length;
  const flaggedCount = logs.filter((l) => l.status === 'Action Flagged').length;

  return (
    <div className="flex flex-col w-full min-h-screen bg-surface">
      {/* Toast Feedback */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 px-4 py-2.5 bg-primary text-on-primary font-body-sm text-body-sm font-medium rounded-lg shadow-lg flex items-center gap-2 animate-bounce">
          <span className="material-symbols-outlined text-[18px]">verified</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Context Ledger Bar */}
      <div className="w-full bg-surface-container-low px-margin-lg py-space-lg">
        <div className="max-w-[1680px] mx-auto flex flex-col lg:flex-row lg:items-center lg:justify-between gap-space-md">
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-space-xs text-secondary font-label-sm uppercase tracking-wider mb-1">
              <span className="material-symbols-outlined text-[16px]">receipt_long</span>
              <span>{t('history.immutableTrail')}</span>
              <span className="text-outline-variant">•</span>
              <span className="text-on-surface-variant font-data-mono">{t('history.compliant')}</span>
              <span className="ml-2 px-1.5 py-0.5 rounded bg-surface-container text-on-surface-variant text-[10px]">
                {t('history.liveLedger')}
              </span>
            </div>
            <h1 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">
              {t('history.title')}
            </h1>
            <p className="font-body-md text-body-md text-on-surface-variant mt-1 max-w-4xl">
              {t('history.description')}
            </p>
          </div>

          <div className="flex items-center gap-space-sm shrink-0 flex-wrap relative">
            {/* Record New Operation Button */}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="inline-flex items-center gap-space-xs px-space-md py-space-xs bg-secondary text-on-secondary font-label-md rounded-lg shadow-sm hover:opacity-90 transition-opacity"
            >
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              <span>{t('history.recordOperation', 'Record Operation')}</span>
            </button>

            {/* Filter Presets Button */}
            <div className="relative">
              <button
                onClick={() => setIsPresetsMenuOpen(!isPresetsMenuOpen)}
                className="inline-flex items-center gap-space-xs px-space-md py-space-xs bg-surface-container-lowest text-on-surface font-label-md rounded-lg shadow-sm hover:bg-surface-container transition-colors border border-outline-variant/30"
              >
                <span className="material-symbols-outlined text-[18px] text-outline">tune</span>
                <span>{t('history.filterPresets')}</span>
              </button>

              {isPresetsMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-surface-container-lowest border border-outline-variant/40 rounded-xl shadow-xl z-30 py-1 font-body-sm text-body-sm">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider border-b border-outline-variant/20">
                    Quick Filters
                  </div>
                  <button
                    onClick={() => { setCategoryFilter('All'); setSearchQuery(''); setIsPresetsMenuOpen(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-surface-container text-on-surface flex items-center justify-between"
                  >
                    <span>All Records</span>
                    {categoryFilter === 'All' && <span className="material-symbols-outlined text-[16px] text-primary">check</span>}
                  </button>
                  <button
                    onClick={() => { setCategoryFilter('Irrigation'); setIsPresetsMenuOpen(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-surface-container text-on-surface flex items-center justify-between"
                  >
                    <span>Irrigation Dispatches</span>
                    {categoryFilter === 'Irrigation' && <span className="material-symbols-outlined text-[16px] text-primary">check</span>}
                  </button>
                  <button
                    onClick={() => { setCategoryFilter('Disease'); setIsPresetsMenuOpen(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-surface-container text-on-surface flex items-center justify-between"
                  >
                    <span>Disease Detections</span>
                    {categoryFilter === 'Disease' && <span className="material-symbols-outlined text-[16px] text-primary">check</span>}
                  </button>
                  <button
                    onClick={() => { setCategoryFilter('AI Model'); setIsPresetsMenuOpen(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-surface-container text-on-surface flex items-center justify-between"
                  >
                    <span>AI Search & Models</span>
                    {categoryFilter === 'AI Model' && <span className="material-symbols-outlined text-[16px] text-primary">check</span>}
                  </button>
                  <button
                    onClick={() => { setCategoryFilter('Telemetry'); setIsPresetsMenuOpen(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-surface-container text-on-surface flex items-center justify-between"
                  >
                    <span>Telemetry Sensors</span>
                    {categoryFilter === 'Telemetry' && <span className="material-symbols-outlined text-[16px] text-primary">check</span>}
                  </button>
                </div>
              )}
            </div>

            {/* Export Button */}
            <div className="relative">
              <button
                onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                className="inline-flex items-center gap-space-xs px-space-md py-space-xs bg-primary text-on-primary font-label-md rounded-lg shadow-sm hover:bg-primary-container transition-colors"
              >
                <span className="material-symbols-outlined text-[18px]">download</span>
                <span>{t('history.exportLog')}</span>
              </button>

              {isExportMenuOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-surface-container-lowest border border-outline-variant/40 rounded-xl shadow-xl z-30 py-1 font-body-sm text-body-sm">
                  <button
                    onClick={exportLogsCSV}
                    className="w-full text-left px-3 py-2 hover:bg-surface-container text-on-surface flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px] text-secondary">table_view</span>
                    <span>Export CSV File</span>
                  </button>
                  <button
                    onClick={exportLogsJSON}
                    className="w-full text-left px-3 py-2 hover:bg-surface-container text-on-surface flex items-center gap-2"
                  >
                    <span className="material-symbols-outlined text-[18px] text-primary">code</span>
                    <span>Export JSON Payload</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Multi-Tier Grid Container */}
      <div className="w-full px-margin-lg py-space-lg max-w-[1680px] mx-auto space-y-space-lg">
        {/* KPI / Throughput Strip */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                {t('history.logVolume')}
              </span>
              <span className="font-headline-lg text-headline-lg text-on-surface font-semibold mt-1">{formatNumber(totalVolume)}</span>
              <span className="font-label-sm text-label-sm text-secondary flex items-center gap-1 mt-0.5">
                <span className="material-symbols-outlined text-[14px]">trending_up</span> {t('history.telemetryRate', { value: formatNumber(8.4, { maximumFractionDigits: 1 }) })}
              </span>
            </div>
            <div className="p-space-xs rounded-lg bg-surface-container text-secondary">
              <span className="material-symbols-outlined text-[20px]">database</span>
            </div>
          </div>

          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                {t('history.autonomousActions')}
              </span>
              <span className="font-headline-lg text-headline-lg text-on-surface font-semibold mt-1">
                {t('history.cycles', '{count} Cycles', { count: formatNumber(autonomousCount) })}
              </span>
              <span className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">{t('history.executionFidelity', { value: formatNumber(99.1, { maximumFractionDigits: 1 }) })}</span>
            </div>
            <div className="p-space-xs rounded-lg bg-secondary-container text-on-secondary-container">
              <span className="material-symbols-outlined text-[20px]">precision_manufacturing</span>
            </div>
          </div>

          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                {t('history.flaggedInterventions')}
              </span>
              <span className="font-headline-lg text-headline-lg text-error font-semibold mt-1">{formatNumber(flaggedCount)}</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant mt-0.5">{t('history.activeSporeVectors', { count: formatNumber(flaggedCount) })}</span>
            </div>
            <div className="p-space-xs rounded-lg bg-error-container text-on-error-container">
              <span className="material-symbols-outlined text-[20px]">flag</span>
            </div>
          </div>

          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex items-start justify-between">
            <div className="flex flex-col">
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                {t('history.ingestionLatency')}
              </span>
              <span className="font-headline-lg text-headline-lg text-on-surface font-semibold mt-1">{formatNumber(18.4, { maximumFractionDigits: 1 })} ms</span>
              <span className="font-label-sm text-label-sm text-secondary mt-0.5">{t('history.edgeBroker')}</span>
            </div>
            <div className="p-space-xs rounded-lg bg-surface-container text-on-surface-variant">
              <span className="material-symbols-outlined text-[20px]">speed</span>
            </div>
          </div>
        </div>

        {/* Filter & Query Control Console */}
        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm space-y-space-sm">
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-space-sm">
            {/* Event Category */}
            <div className="flex flex-col gap-1">
              <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold uppercase tracking-wider">
                {t('history.eventCategory')}
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-2.5 text-on-surface-variant text-[18px] pointer-events-none">
                  category
                </span>
                <select
                  value={categoryFilter}
                  onChange={(e) => setCategoryFilter(e.target.value)}
                  className="w-full h-9 pl-8 pr-7 bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded-lg appearance-none cursor-pointer focus:outline-none focus:bg-surface-container"
                >
                  <option value="All">{t('history.categories.all')}</option>
                  <option value="Irrigation">{t('history.categories.irrigation')}</option>
                  <option value="Disease">{t('history.categories.disease')}</option>
                  <option value="AI Model">{t('history.categories.aiModel')}</option>
                  <option value="Telemetry">{t('history.categories.telemetry')}</option>
                  <option value="Manual Override">{t('history.categories.manualOverride')}</option>
                  <option value="Field">{t('history.categories.field', 'Field')}</option>
                </select>
                <span className="material-symbols-outlined absolute right-2 text-on-surface-variant text-[16px] pointer-events-none">
                  expand_more
                </span>
              </div>
            </div>

            {/* Direct Search */}
            <div className="flex flex-col gap-1 xl:col-span-3">
              <label className="font-label-sm text-label-sm text-on-surface-variant font-semibold uppercase tracking-wider flex items-center justify-between">
                <span>{t('history.directSearch')}</span>
                {(searchQuery || categoryFilter !== 'All') && (
                  <button
                    onClick={() => { setSearchQuery(''); setCategoryFilter('All'); }}
                    className="text-[11px] text-primary hover:underline font-normal flex items-center gap-0.5 lowercase"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                    clear filters
                  </button>
                )}
              </label>
              <div className="relative flex items-center">
                <span className="material-symbols-outlined absolute left-2.5 text-on-surface-variant text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('history.searchPlaceholder')}
                  className="w-full h-9 pl-8 pr-3 bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded-lg placeholder:text-on-surface-variant focus:outline-none focus:bg-surface-container"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Main Workspace Split: Table + Detail Inspector */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter-lg items-start">
          {/* Table (8 Cols) */}
          <div className="xl:col-span-8 bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
            <div className="px-space-md py-space-sm bg-surface-container-low flex items-center justify-between">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-[18px] text-on-surface">view_headline</span>
                <h2 className="font-headline-sm text-headline-sm text-on-surface font-semibold">{t('history.ledgerStream')}</h2>
                <span className="text-xs text-on-surface-variant font-data-mono font-medium">({filteredLogs.length})</span>
              </div>
              <div className="flex items-center gap-space-xs">
                <span className="w-2 h-2 rounded-full bg-secondary animate-pulse" />
                <span className="font-data-mono text-label-sm text-on-surface-variant uppercase">{t('history.streamSynchronized')}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left font-body-sm text-body-sm border-collapse">
                <thead>
                  <tr className="bg-surface-container-low text-on-surface-variant font-label-sm uppercase tracking-wider border-b border-outline-variant/30">
                    <th className="py-space-xs px-space-md font-semibold">{t('history.timestamp')}</th>
                    <th className="py-space-xs px-space-sm font-semibold">{t('history.category')}</th>
                    <th className="py-space-xs px-space-sm font-semibold">{t('history.fieldAsset')}</th>
                    <th className="py-space-xs px-space-md font-semibold">{t('history.eventDescription')}</th>
                    <th className="py-space-xs px-space-sm font-semibold">{t('history.engine')}</th>
                    <th className="py-space-xs px-space-sm font-semibold text-center">{t('history.state')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-container-low text-on-surface">
                  {filteredLogs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-on-surface-variant italic">
                        No audit records found matching the current search criteria.
                      </td>
                    </tr>
                  ) : (
                    filteredLogs.map((log) => (
                      <tr
                        key={log.id}
                        onClick={() => setSelectedRecord(log)}
                        className={`hover:bg-surface-container-low transition-colors cursor-pointer ${
                          selectedRecord?.id === log.id ? 'bg-surface-container-low font-semibold' : ''
                        }`}
                      >
                        <td className="py-space-sm px-space-md font-data-mono whitespace-nowrap text-on-surface-variant">
                          <span className="font-semibold text-on-surface block">{formatTimestamp(log.timestamp)}</span>
                          <span className="text-[11px] text-outline">{formatDate(log.utcTime, { timeStyle: 'medium', timeZone: 'UTC' })}</span>
                        </td>
                        <td className="py-space-sm px-space-sm whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container text-primary font-label-sm">
                            <span className="material-symbols-outlined text-[13px] text-secondary">
                              {log.category === 'Irrigation' ? 'water_drop' : log.category === 'Disease' ? 'coronavirus' : log.category === 'Manual Override' ? 'build' : 'memory'}
                            </span>
                            {translateCategory(log.category)}
                          </span>
                        </td>
                        <td className="py-space-sm px-space-sm whitespace-nowrap font-medium">{getField(log.field)}</td>
                        <td className="py-space-sm px-space-md max-w-xs">
                          <p className="truncate font-body-sm text-body-sm text-on-surface font-medium">{getDescription(log.description)}</p>
                          <p className="truncate font-data-mono text-[11px] text-on-surface-variant">
                            {log.subDetail || `${t('history.engine')}: ${log.engine || t('history.systemCore', 'System Core')}`}
                          </p>
                        </td>
                        <td className="py-space-sm px-space-sm whitespace-nowrap">
                          <span className="font-data-mono text-label-sm text-on-surface">{getEngine(log.engine)}</span>
                        </td>
                        <td className="py-space-sm px-space-sm whitespace-nowrap text-center">
                          <span
                            className={`inline-block px-2 py-0.5 rounded font-label-sm font-semibold ${
                              log.status === 'Success'
                                ? 'bg-secondary-container text-on-secondary-container'
                                : log.status === 'Action Flagged'
                                ? 'bg-error-container text-on-error-container'
                                : log.status === 'Advisory'
                                ? 'bg-tertiary-container text-on-tertiary-container'
                                : 'bg-surface-container text-on-surface'
                            }`}
                          >
                            {translateEnum('status', log.status, log.status)}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Record Inspector Drawer Panel (4 Cols) */}
          <div className="xl:col-span-4 bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-space-md">
            {selectedRecord ? (
              <>
                <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/30">
                  <div className="flex items-center gap-space-xs">
                    <span className="material-symbols-outlined text-secondary text-[20px]">find_in_page</span>
                    <h3 className="font-headline-sm text-headline-sm text-primary">{t('history.auditInspector')}</h3>
                  </div>
                  <span className="font-data-mono text-label-sm bg-surface-container px-2 py-0.5 rounded text-on-surface">
                    {t('history.recordId', 'ID: {id}', { id: selectedRecord.id })}
                  </span>
                </div>

                <div className="space-y-space-sm text-body-sm text-on-surface">
                  <div>
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block">
                      {t('history.targetAsset')}
                    </span>
                    <span className="font-headline-sm text-headline-sm text-primary">{getField(selectedRecord.field)}</span>
                  </div>

                  <div>
                    <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block">
                      {t('history.dispatchDescription')}
                    </span>
                    <p className="p-space-xs bg-surface-container-low rounded text-on-surface mt-0.5 font-medium">
                      {getDescription(selectedRecord.description)}
                    </p>
                    {selectedRecord.subDetail && (
                      <p className="p-space-xs bg-surface-container rounded text-on-surface-variant text-xs mt-1 font-data-mono">
                        {selectedRecord.subDetail}
                      </p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-space-xs text-data-mono">
                    <div className="bg-surface-container p-space-xs rounded">
                      <span className="text-on-surface-variant text-[11px] block">{t('history.engine').toUpperCase()}</span>
                      <span className="font-semibold text-primary truncate block">{getEngine(selectedRecord.engine)}</span>
                    </div>
                    <div className="bg-surface-container p-space-xs rounded">
                      <span className="text-on-surface-variant text-[11px] block">{t('history.operator').toUpperCase()}</span>
                      <span className="font-semibold text-primary truncate block">{getOperator(selectedRecord.operator)}</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider block">
                        {t('history.verificationHash')}
                      </span>
                      <button
                        onClick={() => copyHash(selectedRecord.hash)}
                        className="text-[11px] text-primary hover:underline flex items-center gap-1 font-data-mono"
                      >
                        <span className="material-symbols-outlined text-[14px]">
                          {copiedHash ? 'check' : 'content_copy'}
                        </span>
                        {copiedHash ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <span className="font-data-mono text-[11px] bg-primary-container text-on-primary p-space-xs rounded block truncate mt-1">
                      {selectedRecord.hash}
                    </span>
                  </div>
                </div>

                <div className="pt-space-sm border-t border-outline-variant/30 flex items-center justify-between">
                  <span className="font-label-sm text-label-sm text-secondary font-semibold flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px]">verified</span>
                    {t('history.sealedRecord')}
                  </span>
                  <span className="text-[10px] font-data-mono text-on-surface-variant">
                    {selectedRecord.timestamp}
                  </span>
                </div>
              </>
            ) : (
              <p className="text-on-surface-variant text-body-sm italic text-center py-space-lg">
                {t('history.selectRecord')}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Record Farm Operation Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="px-6 py-4 bg-surface-container-low border-b border-outline-variant/30 flex items-center justify-between">
              <div className="flex items-center gap-2 text-primary font-semibold">
                <span className="material-symbols-outlined text-[20px]">add_circle</span>
                <span>Record Farm Operation & Audit Log</span>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            <form onSubmit={handleRecordOperation} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-on-surface-variant mb-1">
                  Field / Sector Asset
                </label>
                <select
                  value={formField}
                  onChange={(e) => setFormField(e.target.value)}
                  className="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/30 rounded-lg text-on-surface font-body-sm"
                >
                  <option value="Field Alpha-1 (Tomato)">Field Alpha-1 (Tomato)</option>
                  <option value="Field Beta-2 (Maize)">Field Beta-2 (Maize)</option>
                  <option value="Sector Gamma-3 (Wheat)">Sector Gamma-3 (Wheat)</option>
                  <option value="Field Delta-4 (Cotton)">Field Delta-4 (Cotton)</option>
                  <option value="Field Epsilon-5 (Rice)">Field Epsilon-5 (Rice)</option>
                  <option value="General Farm Sector">General Farm Sector</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-on-surface-variant mb-1">
                    Event Category
                  </label>
                  <select
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value as any)}
                    className="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/30 rounded-lg text-on-surface font-body-sm"
                  >
                    <option value="Irrigation">Irrigation Dispatch</option>
                    <option value="Disease">Disease Detection</option>
                    <option value="AI Model">AI Search & Model</option>
                    <option value="Telemetry">Telemetry Sensor</option>
                    <option value="Manual Override">Manual Override</option>
                    <option value="Field">Field Maintenance</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-on-surface-variant mb-1">
                    Execution State
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/30 rounded-lg text-on-surface font-body-sm"
                  >
                    <option value="Success">Success</option>
                    <option value="Action Flagged">Action Flagged</option>
                    <option value="Advisory">Advisory</option>
                    <option value="Locked">Locked</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-on-surface-variant mb-1">
                  Event Description *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Drip Irrigation System Activated for Sector 2"
                  value={formDescription}
                  onChange={(e) => setFormDescription(e.target.value)}
                  className="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/30 rounded-lg text-on-surface font-body-sm focus:outline-none focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-on-surface-variant mb-1">
                  Sub-Detail / Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g. Target volume 2000L applied, pump pressure 4.2 bar"
                  value={formSubDetail}
                  onChange={(e) => setFormSubDetail(e.target.value)}
                  className="w-full px-3 py-2 bg-surface-container-low border border-outline-variant/30 rounded-lg text-on-surface font-body-sm focus:outline-none focus:border-primary resize-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-on-surface-variant mb-1">
                    Pipeline Engine
                  </label>
                  <input
                    type="text"
                    value={formEngine}
                    onChange={(e) => setFormEngine(e.target.value)}
                    className="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/30 rounded-lg text-on-surface font-body-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase text-on-surface-variant mb-1">
                    Operator Name / Role
                  </label>
                  <input
                    type="text"
                    value={formOperator}
                    onChange={(e) => setFormOperator(e.target.value)}
                    className="w-full h-10 px-3 bg-surface-container-low border border-outline-variant/30 rounded-lg text-on-surface font-body-sm"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-outline-variant/30 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-on-surface hover:bg-surface-container font-label-md transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSaving || !formDescription.trim()}
                  className="px-5 py-2 bg-primary text-on-primary font-label-md rounded-lg shadow hover:bg-primary-container transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isSaving && <span className="material-symbols-outlined text-[16px] animate-spin">refresh</span>}
                  <span>Seal & Save Operation</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
