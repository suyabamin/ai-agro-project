import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { apiService } from '../services/api';
import { useAuth } from '../context/AuthContext';
import type { Field } from '../types';
import type { AssignmentRequest } from '../services/ecosystem';
import {
  ECOSYSTEM_UPDATED_EVENT,
  getFarms,
  getOwnerIncomingApplications,
  approveAssignmentRequest,
  rejectAssignmentRequest,
  notifyEcosystemChange,
} from '../services/ecosystem';
import { evaluateFieldDecision } from '../utils/decisionEngine';
import { useI18n } from '../i18n';
import { CropRecommendationModal } from '../components/CropRecommendationModal';

export const Dashboard: React.FC = () => {
  const { user, userProfile, userRole } = useAuth();
  const { t, translateEnum, formatNumber } = useI18n();
  const [fields, setFields] = useState<Field[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLiveData, setIsLiveData] = useState<boolean>(false);
  const [farmName, setFarmName] = useState<string>('');
  const [farmArea, setFarmArea] = useState<number>(0);
  const [isCropModalOpen, setIsCropModalOpen] = useState<boolean>(false);

  // Incoming Specialist Applications for Farm Owner
  const [incomingApplications, setIncomingApplications] = useState<AssignmentRequest[]>([]);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [approvalToast, setApprovalToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const loadData = () => {
    setIsLoading(true);
    apiService.getFields().then((data) => {
      console.log('[Dashboard] field fetch result:', data?.length, data?.map((f: Field) => `${f.id} — ${f.name}`));
      setFields(data || []);
      setIsLiveData(Boolean(data && data.length > 0));
      setIsLoading(false);
    }).catch(() => {
      setFields([]);
      setIsLiveData(false);
      setIsLoading(false);
    });
    getFarms().then((farms) => {
      if (farms && farms.length > 0) {
        setFarmName(farms[0].name);
        setFarmArea(farms[0].areaHectares);
      }
    });

    // Load incoming applications for owner
    if (userRole === 'owner' || !userRole) {
      getOwnerIncomingApplications(user?.uid || 'owner_demo').then((apps) => {
        setIncomingApplications(apps || []);
      });
    }
  };

  useEffect(() => {
    loadData();
    window.addEventListener(ECOSYSTEM_UPDATED_EVENT, loadData);
    return () => window.removeEventListener(ECOSYSTEM_UPDATED_EVENT, loadData);
  }, [user, userRole]);

  const handleOwnerAccept = async (app: AssignmentRequest) => {
    setActionLoadingId(app.id);
    try {
      const res = await approveAssignmentRequest(app.id);
      if (res.success) {
        setApprovalToast({
          message: t(
            'farmers.applicationAccepted',
            `Application approved! ${app.farmerName} is now assigned to ${app.fieldName}.`,
            { farmerName: app.farmerName, fieldName: app.fieldName }
          ),
          type: 'success',
        });
        notifyEcosystemChange();
        loadData();
      } else {
        setApprovalToast({ message: res.error || 'Failed to approve application', type: 'error' });
      }
    } catch (err: any) {
      setApprovalToast({ message: err?.message || 'Error approving application', type: 'error' });
    } finally {
      setActionLoadingId(null);
      setTimeout(() => setApprovalToast(null), 5000);
    }
  };

  const handleOwnerDecline = async (requestId: string) => {
    setActionLoadingId(requestId);
    try {
      const res = await rejectAssignmentRequest(requestId);
      if (res.success) {
        setApprovalToast({
          message: t('farmers.rejectSuccess', 'Assignment application declined.'),
          type: 'info',
        });
        notifyEcosystemChange();
        loadData();
      } else {
        setApprovalToast({ message: res.error || 'Failed to decline application', type: 'error' });
      }
    } catch (err: any) {
      setApprovalToast({ message: err?.message || 'Error declining application', type: 'error' });
    } finally {
      setActionLoadingId(null);
      setTimeout(() => setApprovalToast(null), 5000);
    }
  };

  const evaluatedFields = fields.map((f) => ({
    field: f,
    decision: evaluateFieldDecision(f),
  }));

  const totalFields = fields.length;
  const healthyFields = evaluatedFields.filter((ef) => ef.decision.status === 'Healthy').length;
  const dryFields = evaluatedFields.filter((ef) => ef.decision.status === 'Attention').length;
  const criticalFields = evaluatedFields.filter((ef) => ef.decision.status === 'Critical').length;
  const waterAvailability = 64200; // Reservoir capacity liters

  const translateDecisionReason = (reason: string) => {
    let match = reason.match(/^Soil moisture \(([^)]+)\) is severely dry \(<30%\)\. Immediate irrigation required\.$/);
    if (match) {
      const value = formatNumber(Number(match[1]));
      return t('dashboard.decisionReasons.severeDry', `Soil moisture (${value}%) is severely dry (<30%). Immediate irrigation required.`, { value });
    }
    match = reason.match(/^Soil moisture \(([^)]+)\) is below optimal target \(([^)]+)%–([^)]+)%\) for (.+)\.$/);
    if (match) {
      const value = formatNumber(Number(match[1]));
      const min = formatNumber(Number(match[2]));
      const max = formatNumber(Number(match[3]));
      const crop = translateEnum('common.enums.crops', match[4], match[4]);
      return t('dashboard.decisionReasons.belowOptimal', `Soil moisture (${value}%) is below optimal target (${min}%–${max}%) for ${crop}.`, { value, min, max, crop });
    }
    match = reason.match(/^Soil moisture \(([^)]+)\) is moderate for (.+)\.$/);
    if (match) {
      const value = formatNumber(Number(match[1]));
      const crop = translateEnum('common.enums.crops', match[2], match[2]);
      return t('dashboard.decisionReasons.moderateMoisture', `Soil moisture (${value}%) is moderate for ${crop}.`, { value, crop });
    }
    match = reason.match(/^Soil is saturated \(([^)]+)% > max ([^)]+)%\)\. Hold irrigation to prevent root hypoxia\.$/);
    if (match) {
      const value = formatNumber(Number(match[1]));
      const max = formatNumber(Number(match[2]));
      return t('dashboard.decisionReasons.saturated', `Soil is saturated (${value}% > max ${max}%). Hold irrigation to prevent root hypoxia.`, { value, max });
    }
    match = reason.match(/^Soil moisture \(([^)]+)\) is optimal for (.+) \(([^)]+)%–([^)]+)%\)\.$/);
    if (match) {
      const value = formatNumber(Number(match[1]));
      const crop = translateEnum('common.enums.crops', match[2], match[2]);
      const min = formatNumber(Number(match[3]));
      const max = formatNumber(Number(match[4]));
      return t('dashboard.decisionReasons.optimalMoisture', `Soil moisture (${value}%) is optimal for ${crop} (${min}%–${max}%).`, { value, crop, min, max });
    }
    match = reason.match(/^High ambient temperature \(([^)]+)°C\) accelerates evapotranspiration, elevating water need\.$/);
    if (match) {
      const value = formatNumber(Number(match[1]));
      return t('dashboard.decisionReasons.highTemperature', `High ambient temperature (${value}°C) accelerates evapotranspiration, elevating water need.`, { value });
    }
    match = reason.match(/^Recent rainfall \(([^)]+) mm\) provides adequate water; delaying scheduled irrigation cycle\.$/);
    if (match) {
      const value = formatNumber(Number(match[1]));
      return t('dashboard.decisionReasons.rainfallAdequate', `Recent rainfall (${value} mm) provides adequate water; delaying scheduled irrigation cycle.`, { value });
    }
    match = reason.match(/^High humidity \(([^)]+)%\) and elevated temperature \(([^)]+)°C\) create high fungal pathogen\/blight risk\.$/);
    if (match) {
      const humidity = formatNumber(Number(match[1]));
      const temperature = formatNumber(Number(match[2]));
      return t('dashboard.decisionReasons.diseaseRisk', `High humidity (${humidity}%) and elevated temperature (${temperature}°C) create high fungal pathogen/blight risk.`, { humidity, temperature });
    }
    match = reason.match(/^Waterlogged soil \(([^)]+)%\) increases susceptibility to root rot & soil-borne pathogens\.$/);
    if (match) {
      const value = formatNumber(Number(match[1]));
      return t('dashboard.decisionReasons.waterlogged', `Waterlogged soil (${value}%) increases susceptibility to root rot & soil-borne pathogens.`, { value });
    }
    match = reason.match(/^Soil pH \(([^)]+)\) is too acidic for (.+) \(preferred min ([^)]+)\)\.$/);
    if (match) {
      const value = formatNumber(Number(match[1]));
      const crop = translateEnum('common.enums.crops', match[2], match[2]);
      const min = formatNumber(Number(match[3]));
      return t('dashboard.decisionReasons.phAcidic', `Soil pH (${value}) is too acidic for ${crop} (preferred min ${min}).`, { value, crop, min });
    }
    match = reason.match(/^Soil pH \(([^)]+)\) is too alkaline for (.+) \(preferred max ([^)]+)\)\.$/);
    if (match) {
      const value = formatNumber(Number(match[1]));
      const crop = translateEnum('common.enums.crops', match[2], match[2]);
      const max = formatNumber(Number(match[3]));
      return t('dashboard.decisionReasons.phAlkaline', `Soil pH (${value}) is too alkaline for ${crop} (preferred max ${max}).`, { value, crop, max });
    }
    match = reason.match(/^Soil pH \(([^)]+)\) is balanced for (.+) \(([^)]+)–([^)]+)\)\.$/);
    if (match) {
      const value = formatNumber(Number(match[1]));
      const crop = translateEnum('common.enums.crops', match[2], match[2]);
      const min = formatNumber(Number(match[3]));
      const max = formatNumber(Number(match[4]));
      return t('dashboard.decisionReasons.phBalanced', `Soil pH (${value}) is balanced for ${crop} (${min}–${max}).`, { value, crop, min, max });
    }
    if (reason === 'Soil moisture telemetry unavailable or probe offline.') {
      return t('dashboard.decisionReasons.moistureUnavailable', reason);
    }
    if (reason === 'Soil pH telemetry missing.') {
      return t('dashboard.decisionReasons.phMissing', reason);
    }
    if (reason === 'No field data provided for evaluation.') {
      return t('dashboard.decisionReasons.noFieldData', reason);
    }
    return reason;
  };


  return (
    <div className="flex flex-col w-full">
      <div className="w-full max-w-[1640px] mx-auto px-margin md:px-margin-lg py-space-xl flex flex-col gap-space-xl">

        {/* Top Greeting & Operational Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md pb-space-xs">
          <div className="flex flex-col gap-space-xs">
            <div className="flex items-center gap-space-xs">
              <span className="font-label-sm text-secondary uppercase tracking-widest font-semibold">
                {farmName} — {t('dashboard.sectorNumber', 'Sector {number}', { number: formatNumber(4) })}
              </span>
              <span className="text-outline-variant font-label-sm">•</span>
              <span className="inline-flex items-center gap-1 font-label-sm text-on-surface-variant">
                <span className={`w-1.5 h-1.5 rounded-full inline-block ${isLiveData ? 'bg-secondary animate-pulse' : 'bg-outline'}`} />
                {isLoading ? t('dashboard.loadingFieldData') : isLiveData ? t('dashboard.liveDatabaseFields') : t('dashboard.demoFields')}
              </span>
            </div>
            <h1 className="font-headline-lg text-on-surface font-semibold tracking-tight">
              {t('dashboard.morningGreeting', { name: userProfile?.fullName || translateEnum('common.enums.roles', 'systemOperator') })}
            </h1>
            <p className="font-body-md text-on-surface-variant">
              {t('dashboard.monitoredSummary', {
                area: formatNumber(farmArea),
                count: formatNumber(totalFields),
                critical: formatNumber(criticalFields),
              })}
            </p>
          </div>
          <div className="flex items-center gap-space-sm self-start lg:self-auto shrink-0">
            <Link
              to="/fields"
              className="flex items-center gap-space-xs px-space-md h-9 bg-surface-container-lowest text-on-surface font-label-md rounded-lg shadow-sm transition-all duration-150"
              style={{ border: '1px solid rgba(193,200,194,0.4)' }}
            >
              <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '18px' }}>
                radar
              </span>
              <span>{t('dashboard.quickFieldScan')}</span>
            </Link>
            <Link
              to="/ai-analysis"
              className="flex items-center gap-space-xs px-space-md h-9 bg-primary-container text-on-primary font-label-md rounded-lg shadow-sm transition-all duration-150 hover:opacity-90"
            >
              <span className="material-symbols-outlined text-primary-fixed" style={{ fontSize: '18px' }}>
                auto_awesome
              </span>
              <span>{t('dashboard.aiAnalysis')}</span>
            </Link>
          </div>
        </div>

        {/* Floating / Inline Approval Feedback Toast */}
        {approvalToast && (
          <div
            className={`p-space-md rounded-xl shadow-md border flex items-center justify-between transition-all animate-fadeIn ${
              approvalToast.type === 'success'
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                : approvalToast.type === 'error'
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                : 'bg-primary-500/10 border-primary-500/30 text-primary-300'
            }`}
          >
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-xl">
                {approvalToast.type === 'success' ? 'check_circle' : approvalToast.type === 'error' ? 'error' : 'info'}
              </span>
              <span className="font-label-md font-medium">{approvalToast.message}</span>
            </div>
            <button
              onClick={() => setApprovalToast(null)}
              className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg"
            >
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
        )}

        {/* Incoming Specialist Applications (Owner Action Hub) */}
        {(userRole === 'owner' || !userRole) && incomingApplications.length > 0 && (
          <div className="bg-surface-container-lowest border border-amber-500/30 rounded-2xl p-space-lg shadow-sm relative overflow-hidden">
            <div className="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-amber-500 via-primary to-emerald-500" />
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md pb-space-md border-b border-outline-variant/30">
              <div className="flex items-center gap-space-md">
                <div className="w-11 h-11 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20 shadow-inner">
                  <span className="material-symbols-outlined text-2xl">person_add</span>
                </div>
                <div>
                  <div className="flex items-center gap-space-xs">
                    <h2 className="font-title-md text-on-surface font-semibold tracking-tight">
                      {t('layout.reviewAndAssign', 'Review & Assign Field Specialists')}
                    </h2>
                    <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                      {incomingApplications.length} {incomingApplications.length === 1 ? 'New Application' : 'New Applications'}
                    </span>
                  </div>
                  <p className="font-body-sm text-on-surface-variant mt-0.5">
                    {t(
                      'farmers.reviewDescription',
                      'Agricultural specialists have applied to take charge of your field operations. Review qualifications and assign directly to field telemetry.'
                    )}
                  </p>
                </div>
              </div>
              <Link
                to="/farmers"
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-primary-focus transition-colors shrink-0 self-start md:self-auto px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container"
              >
                <span>{t('farmers.filterRequests', 'View All Applications')}</span>
                <span className="material-symbols-outlined text-sm">arrow_forward</span>
              </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-md mt-space-md">
              {incomingApplications.map((app) => (
                <div
                  key={app.id}
                  className="bg-surface-container-low/70 border border-outline-variant/40 rounded-xl p-space-md flex flex-col justify-between hover:border-outline-variant transition-all hover:shadow-md"
                >
                  <div>
                    <div className="flex items-start justify-between gap-space-xs mb-space-sm">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                          {app.farmerName?.charAt(0) || 'F'}
                        </div>
                        <div>
                          <div className="font-label-lg font-semibold text-on-surface flex items-center gap-1.5">
                            {app.farmerName}
                            <span className="material-symbols-outlined text-xs text-primary" title="Verified Specialist">
                              verified
                            </span>
                          </div>
                          <div className="font-body-xs text-on-surface-variant">
                            {app.createdAt ? new Date(app.createdAt).toLocaleDateString() : 'Recent application'}
                          </div>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-amber-500/10 text-amber-300 border border-amber-500/20">
                        {app.status === 'pending' ? 'Pending Approval' : app.status}
                      </span>
                    </div>

                    <div className="space-y-1.5 py-2 my-2 border-y border-outline-variant/30 text-xs">
                      <div className="flex items-center justify-between text-on-surface-variant">
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm text-primary">landscape</span>
                          {t('farmers.assignedField', 'Target Field')}:
                        </span>
                        <span className="font-semibold text-on-surface">{app.fieldName}</span>
                      </div>
                      <div className="flex items-center justify-between text-on-surface-variant">
                        <span className="flex items-center gap-1">
                          <span className="material-symbols-outlined text-sm text-amber-400">psychology</span>
                          {t('farmers.workType', 'Role / Responsibility')}:
                        </span>
                        <span className="font-medium text-on-surface truncate max-w-[160px]" title={app.workType}>
                          {app.workType}
                        </span>
                      </div>
                      {app.dailyRate ? (
                        <div className="flex items-center justify-between text-on-surface-variant">
                          <span className="flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm text-emerald-400">payments</span>
                            {t('farmers.dailyRate', 'Daily Rate')}:
                          </span>
                          <span className="font-semibold text-emerald-400">৳{app.dailyRate} / day</span>
                        </div>
                      ) : null}
                    </div>

                    {app.notes && (
                      <p className="font-body-xs text-on-surface-variant/90 italic bg-surface-container-lowest/60 p-2 rounded-lg border border-outline-variant/20 mb-3 line-clamp-2">
                        "{app.notes}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <button
                      onClick={() => handleOwnerAccept(app)}
                      disabled={actionLoadingId === app.id}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-label-sm font-semibold shadow-sm transition-all disabled:opacity-50"
                    >
                      {actionLoadingId === app.id ? (
                        <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                      ) : (
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                      )}
                      <span>{t('layout.acceptAndAssign', 'Accept & Assign')}</span>
                    </button>
                    <button
                      onClick={() => handleOwnerDecline(app.id)}
                      disabled={actionLoadingId === app.id}
                      className="px-3 py-2 rounded-lg border border-outline-variant/60 hover:bg-surface-container text-on-surface-variant hover:text-on-surface font-label-sm font-medium transition-all disabled:opacity-50"
                    >
                      <span>{t('layout.decline', 'Decline')}</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* KPI Metric Summary Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-space-md">
          {/* Monitored Fields */}
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="font-label-sm uppercase tracking-wider font-semibold">{t('dashboard.monitoredFields')}</span>
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>grid_view</span>
            </div>
            <div className="my-space-xs">
              <div className="font-display-lg text-on-surface font-semibold tracking-tight">
                {formatNumber(totalFields)}{' '}
                <span className="font-headline-sm text-on-surface-variant font-normal">{t('dashboard.field')}</span>
              </div>
              <div className="font-body-sm text-on-surface-variant mt-0.5">{t('dashboard.allSectorsActive')}</div>
            </div>
            <div className="flex items-center gap-1.5 pt-space-xs font-label-sm font-medium" style={{ color: isLiveData ? '#296b3c' : undefined }}>
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{isLiveData ? 'cloud_done' : 'add_circle'}</span>
              <span>{isLiveData ? t('dashboard.liveDatabase') : t('dashboard.demoDataset')}</span>
            </div>
          </div>

          {/* Healthy Status */}
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="font-label-sm uppercase tracking-wider font-semibold">{t('dashboard.healthyStatus')}</span>
              <span className="material-symbols-outlined text-secondary" style={{ fontSize: '18px' }}>check_circle</span>
            </div>
            <div className="my-space-xs">
              <div className="font-display-lg text-on-surface font-semibold tracking-tight">
                {formatNumber(healthyFields)}{' '}
                <span className="font-headline-sm text-on-surface-variant font-normal">{t('dashboard.field')}</span>
              </div>
              <div className="font-body-sm text-on-surface-variant mt-0.5">{t('dashboard.optimalConditions')}</div>
            </div>
            <div className="pt-space-xs">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-on-secondary-container font-label-sm font-semibold"
                style={{ backgroundColor: 'rgba(173,243,184,0.4)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-secondary inline-block" />
                {t('dashboard.normalGrowth')}
              </span>
            </div>
          </div>

          {/* Needs Attention */}
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="font-label-sm uppercase tracking-wider font-semibold">{t('dashboard.needsAttention')}</span>
              <span className="material-symbols-outlined text-amber-700" style={{ fontSize: '18px' }}>warning</span>
            </div>
            <div className="my-space-xs">
              <div className="font-display-lg text-on-surface font-semibold tracking-tight">
                {formatNumber(dryFields)}{' '}
                <span className="font-headline-sm text-on-surface-variant font-normal">{t('dashboard.field')}</span>
              </div>
              <div className="font-body-sm text-on-surface-variant mt-0.5">
                {fields.filter(f => f.status === 'Dry' || f.status === 'Moderate').map(f => f.name).join(' & ') || t('dashboard.noDryFields')}
              </div>
            </div>
            <div className="pt-space-xs">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-amber-800 bg-amber-100 font-label-sm font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-600 inline-block" />
                {t('dashboard.waterDeficit')}
              </span>
            </div>
          </div>

          {/* Critical Status */}
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="font-label-sm uppercase tracking-wider font-semibold">{t('dashboard.criticalAction')}</span>
              <span className="material-symbols-outlined text-error" style={{ fontSize: '18px' }}>emergency</span>
            </div>
            <div className="my-space-xs">
              <div className="font-display-lg text-error font-semibold tracking-tight">
                {formatNumber(criticalFields)}{' '}
                <span className="font-headline-sm text-on-surface-variant font-normal">{t('dashboard.field')}</span>
              </div>
              <div className="font-body-sm text-on-surface font-medium mt-0.5">
                {fields.filter(f => f.status === 'Critical').map(f => `${f.name} (${translateEnum('common.enums.crops', f.crop, f.crop)})`).join(', ') || t('dashboard.noneCritical')}
              </div>
            </div>
            <div className="pt-space-xs">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-error font-label-sm font-semibold"
                style={{ backgroundColor: 'rgba(255,218,214,0.6)' }}>
                <span className="w-1.5 h-1.5 rounded-full bg-error inline-block animate-pulse" />
                {t('dashboard.urgentAttention')}
              </span>
            </div>
          </div>

          {/* Water Reserves */}
          <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-on-surface-variant">
              <span className="font-label-sm uppercase tracking-wider font-semibold">{t('dashboard.reservoirReserves')}</span>
              <span className="material-symbols-outlined text-secondary" style={{ fontSize: '18px' }}>water</span>
            </div>
            <div className="my-space-xs">
              <div className="font-display-lg text-on-surface font-semibold tracking-tight">
                {formatNumber(waterAvailability / 1000, { maximumFractionDigits: 1 })}{'k'}{' '}
                <span className="font-headline-sm text-on-surface-variant font-normal">{t('dashboard.litersAbbreviation', 'L')}</span>
              </div>
              <div className="font-body-sm text-on-surface-variant mt-0.5">{t('dashboard.totalCapacity')}</div>
            </div>
            <div className="flex items-center justify-between pt-space-xs">
              <div className="w-full bg-surface-container-high rounded-full mr-2 overflow-hidden" style={{ height: '6px' }}>
                <div className="bg-secondary h-full rounded-full" style={{ width: '78%' }} />
              </div>
              <span className="font-data-mono text-label-sm text-secondary shrink-0">{t('dashboard.plusHours', '+{count}h', { count: formatNumber(14) })}</span>
            </div>
          </div>
        </div>


        {/* Two-Column Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-gutter-lg items-start">

          {/* LEFT COLUMN: Field Conditions Table */}
          <div className="xl:col-span-7 flex flex-col gap-space-xl">

            {/* Live Field Conditions Table */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div className="px-space-lg py-space-md flex items-center justify-between"
                style={{ backgroundColor: 'rgba(239,244,255,0.4)' }}>
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-secondary" style={{ fontSize: '20px' }}>tune</span>
                  <h2 className="font-headline-sm text-on-surface font-semibold">{t('dashboard.liveFieldConditions')}</h2>
                </div>
                <span className="font-label-sm text-on-surface-variant">{t('dashboard.realTimeMatrix')}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ borderCollapse: 'collapse' }}>
                  <thead>
                    <tr className="bg-surface-container-low text-on-surface-variant font-label-sm uppercase tracking-wider">
                      <th className="py-2.5 px-space-md font-semibold">{t('dashboard.field')}</th>
                      <th className="py-2.5 px-space-md font-semibold">{t('dashboard.crop')}</th>
                      <th className="py-2.5 px-space-md font-semibold w-40">{t('dashboard.soilMoisture')}</th>
                      <th className="py-2.5 px-space-md font-semibold">{t('dashboard.ph')}</th>
                      <th className="py-2.5 px-space-md font-semibold">{t('dashboard.status')}</th>
                      <th className="py-2.5 px-space-md font-semibold">{t('dashboard.waterNeed')}</th>
                      <th className="py-2.5 px-space-md font-semibold text-right">{t('common.action')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y text-on-surface font-body-sm" style={{ borderColor: '#eff4ff' }}>
                    {isLoading ? (
                      <tr><td colSpan={7} className="py-8 text-center text-on-surface-variant font-body-sm">{t('dashboard.loadingFields')}</td></tr>
                    ) : fields.length === 0 ? (
                      <tr><td colSpan={7} className="py-8 text-center text-on-surface-variant font-body-sm">{t('dashboard.noFieldsCreate')}</td></tr>
                    ) : null}
                    {!isLoading && evaluatedFields.map(({ field, decision }) => {
                      const isCritical = decision.status === 'Critical';
                      const isAttention = decision.status === 'Attention';
                      const isHealthy = decision.status === 'Healthy';
                      const moistureColor = isCritical ? '#ba1a1a' : isAttention ? '#b45309' : '#296b3c';
                      const displayMoisture = decision.soilMoistureVal !== null ? `${formatNumber(decision.soilMoistureVal)}%` : t('common.notAvailable');
                      const displayPH = decision.soilPHVal !== null ? `${formatNumber(decision.soilPHVal)} ${t('dashboard.ph')}` : t('common.notAvailable');

                      return (
                        <tr
                          key={field.id || field.fieldId || field.docId || field.name}
                          className="transition-colors"
                          style={{
                            backgroundColor: isCritical ? 'rgba(255,218,214,0.15)' : isAttention ? 'rgba(254,243,199,0.15)' : 'transparent'
                          }}
                        >
                          <td className="py-3 px-space-md font-data-mono font-semibold" style={{ color: isCritical ? '#ba1a1a' : '#121c2a' }}>
                            {field.name}
                          </td>
                          <td className="py-3 px-space-md">{translateEnum('common.enums.crops', field.crop, field.crop)}</td>
                          <td className="py-3 px-space-md">
                            <div className="flex items-center gap-2">
                              <div className="w-20 bg-surface-container-high rounded-full overflow-hidden" style={{ height: '6px' }}>
                                <div className="h-full rounded-full" style={{ width: `${decision.soilMoistureVal ?? 0}%`, backgroundColor: moistureColor }} />
                              </div>
                              <span className="font-data-mono text-label-sm" style={{ color: moistureColor }}>
                                {displayMoisture}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-space-md font-data-mono">
                            {displayPH}
                          </td>
                          <td className="py-3 px-space-md">
                            {isCritical ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-error font-label-sm font-semibold"
                                style={{ backgroundColor: 'rgba(255,218,214,0.8)' }}
                                title={decision.reasons.map(translateDecisionReason).join('\n')}>
                                {t('status.critical')}
                              </span>
                            ) : isAttention ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-amber-800 bg-amber-100 font-label-sm font-semibold"
                                title={decision.reasons.map(translateDecisionReason).join('\n')}>
                                {t('status.attention')}
                              </span>
                            ) : isHealthy ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-on-secondary-container font-label-sm font-semibold"
                                style={{ backgroundColor: 'rgba(173,243,184,0.4)' }}
                                title={decision.reasons.map(translateDecisionReason).join('\n')}>
                                {t('status.healthy')}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-on-surface-variant bg-surface-container font-label-sm font-semibold"
                                title={decision.reasons.map(translateDecisionReason).join('\n')}>
                                {translateEnum('status', decision.status, decision.status)}
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-space-md text-on-surface font-medium">
                            {translateEnum('common.enums.waterRequirements', decision.waterNeed, decision.waterNeed)}
                          </td>
                          <td className="py-3 px-space-md text-right">
                            {decision.action === 'Pathogen AI' ? (
                              <button
                                className="px-2 py-0.5 rounded bg-error text-on-error font-label-sm font-semibold hover:opacity-90 cursor-pointer"
                                type="button"
                                title={decision.reasons.map(translateDecisionReason).join('\n')}
                                onClick={() => window.location.href = decision.actionRoute}
                              >
                                {translateEnum('common.enums.recommendations', decision.action, decision.action)}
                              </button>
                            ) : decision.action === 'Queue Run' ? (
                              <button
                                className="text-amber-800 hover:text-amber-900 font-label-sm font-semibold cursor-pointer"
                                type="button"
                                title={decision.reasons.map(translateDecisionReason).join('\n')}
                                onClick={() => window.location.href = decision.actionRoute}
                              >
                                {translateEnum('common.enums.recommendations', decision.action, decision.action)}
                              </button>
                            ) : (
                              <button
                                className="text-secondary hover:text-primary font-label-sm font-semibold cursor-pointer"
                                type="button"
                                title={decision.reasons.map(translateDecisionReason).join('\n')}
                                onClick={() => window.location.href = decision.actionRoute}
                              >
                                {translateEnum('common.enums.recommendations', decision.action, decision.action)}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Task Feed + AI Modules */}
          <div className="xl:col-span-5 flex flex-col gap-space-xl">

            {/* Today's Task Feed */}
            <div className="bg-surface-container-lowest rounded-xl shadow-sm overflow-hidden flex flex-col">
              <div className="px-space-lg py-space-md flex items-center justify-between"
                style={{ backgroundColor: 'rgba(239,244,255,0.4)' }}>
                <div className="flex items-center gap-space-xs">
                  <span className="material-symbols-outlined text-secondary" style={{ fontSize: '20px' }}>calendar_today</span>
                  <h2 className="font-headline-sm text-on-surface font-semibold">{t('dashboard.taskActivityFeed')}</h2>
                </div>
                <span className="px-2 py-0.5 rounded bg-primary-container text-on-primary font-label-sm font-semibold">
                  {t('common.items', { count: formatNumber(fields.length) })}
                </span>
              </div>
              <div className="p-space-lg flex flex-col gap-space-md">
                {fields.length > 0 ? (
                  <>
                    {/* Feed Item 1: Primary field check */}
                    <div className="flex items-start gap-space-md relative pb-space-md">
                      <div className="w-7 h-7 rounded-full bg-secondary-container text-secondary flex items-center justify-center shrink-0 mt-0.5 z-10">
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>check</span>
                      </div>
                      <div className="absolute left-3.5 top-7 bottom-0 w-0.5 bg-surface-container" />
                      <div className="flex flex-col min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-label-sm font-semibold text-secondary">06:00 — {t('status.completed')}</span>
                          <span className="font-data-mono text-label-sm text-on-surface-variant">{fields[0]?.name}</span>
                        </div>
                        <div className="font-body-sm text-on-surface font-medium mt-0.5">{t('dashboard.automatedMoistureCheck')}</div>
                        <div className="font-body-sm text-on-surface-variant mt-0.5">
                          {t('dashboard.standardMoisture', {
                            value: fields[0]?.soilMoisture !== undefined && fields[0]?.soilMoisture !== null
                              ? formatNumber(fields[0].soilMoisture)
                              : t('dashboard.standardMoistureLabel', 'Standard'),
                            crop: translateEnum('common.enums.crops', fields[0]?.crop, fields[0]?.crop),
                          })}
                        </div>
                      </div>
                    </div>
                    {/* Feed Item 2: Status check */}
                    <div className="flex items-start gap-space-md relative pb-space-md">
                      <div className={`w-7 h-7 rounded-full ${fields[fields.length - 1]?.status === 'Critical' ? 'bg-error-container text-error' : 'bg-surface-container text-secondary'} flex items-center justify-center shrink-0 mt-0.5 z-10`}>
                        <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
                          {fields[fields.length - 1]?.status === 'Critical' ? 'notification_important' : 'opacity'}
                        </span>
                      </div>
                      <div className="absolute left-3.5 top-7 bottom-0 w-0.5 bg-surface-container" />
                      <div className="flex flex-col min-w-0 flex-1 p-space-sm rounded-lg" style={{ backgroundColor: fields[fields.length - 1]?.status === 'Critical' ? 'rgba(255,218,214,0.2)' : 'transparent' }}>
                        <div className="flex items-center justify-between gap-2">
                          <span className={`font-label-sm font-bold ${fields[fields.length - 1]?.status === 'Critical' ? 'text-error' : 'text-on-surface'}`}>
                            08:30 — {fields[fields.length - 1]?.status === 'Critical' ? t('status.aiAlert') : t('status.statusUpdate')}
                          </span>
                          <span className="font-data-mono text-label-sm text-on-surface-variant font-semibold">{fields[fields.length - 1]?.name}</span>
                        </div>
                        <div className="font-body-sm text-on-surface font-semibold mt-0.5">{t('dashboard.soilStatus', 'Soil Status: {value}', { value: translateEnum('status', fields[fields.length - 1]?.status, fields[fields.length - 1]?.status) })}</div>
                        <div className="font-body-sm text-on-surface-variant mt-0.5">
                          {t('dashboard.telemetryReadingWithLabel', '{value} moisture reading for {crop}.', {
                            value: fields[fields.length - 1]?.soilMoisture !== undefined && fields[fields.length - 1]?.soilMoisture !== null
                              ? `${formatNumber(fields[fields.length - 1]?.soilMoisture ?? 0)}%`
                              : t('dashboard.telemetryLabel', 'Telemetry'),
                            crop: translateEnum('common.enums.crops', fields[fields.length - 1]?.crop, fields[fields.length - 1]?.crop),
                          })}
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-center py-6 text-on-surface-variant font-body-sm">
                    {t('dashboard.noFieldTasks')}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <CropRecommendationModal
        isOpen={isCropModalOpen}
        onClose={() => setIsCropModalOpen(false)}
        selectedField={fields.length > 0 ? fields[0] : null}
      />
    </div>
  );
};
