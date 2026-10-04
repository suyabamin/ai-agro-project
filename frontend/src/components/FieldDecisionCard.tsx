import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiService } from '../services/api';
import type { Field, FieldDecisionV2Result } from '../types';
import { useI18n } from '../i18n';

interface FieldDecisionCardProps {
  fields: Field[];
}

export const FieldDecisionCard: React.FC<FieldDecisionCardProps> = ({ fields }) => {
  const navigate = useNavigate();
  const { translateEnum, formatNumber } = useI18n();

  const [selectedFieldId, setSelectedFieldId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<FieldDecisionV2Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Default telemetry inputs if field is selected or manually adjusted
  // N/P/K fallback means are derived from the V2 training dataset agronomic distribution
  const [crop, setCrop] = useState<string>('rice');
  const [N, setN] = useState<number>(59);
  const [P, setP] = useState<number>(54);
  const [K, setK] = useState<number>(48);
  const [temp, setTemp] = useState<number>(20.8);
  const [humidity, setHumidity] = useState<number>(82.0);
  const [ph, setPh] = useState<number>(6.5);
  const [rainfall, setRainfall] = useState<number>(202.9);
  const [soilMoisture, setSoilMoisture] = useState<number>(46.9);

  // Sync ALL telemetry inputs (including N/P/K) when selected field changes
  useEffect(() => {
    if (fields && fields.length > 0) {
      const current = fields.find((f) => f.id === selectedFieldId || f.fieldId === selectedFieldId) || fields[0];
      if (current) {
        if (!selectedFieldId) setSelectedFieldId(current.id || current.fieldId || '');
        setCrop(current.crop || 'rice');
        setSoilMoisture(current.soilMoisture ?? 45.0);
        setPh(current.soilPH ?? 6.5);
        setTemp(current.temperature ?? 28.0);
        setHumidity(current.humidity ?? 65.0);
        setRainfall(current.rainfall ?? 100.0);
        // Sync NPK from field data (nitrogen/phosphorus/potassium)
        // Fallbacks are agronomic dataset V2 means (not arbitrary hardcoded values)
        setN(current.nitrogen ?? 59);
        setP(current.phosphorus ?? 54);
        setK(current.potassium ?? 48);
      }
    }
  }, [fields, selectedFieldId]);

  // Fetch prediction from Decision Tree V2 backend API
  const fetchDecision = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiService.predictFieldDecision({
        crop,
        N,
        P,
        K,
        temperature: temp,
        humidity,
        ph,
        rainfall,
        soil_moisture: soilMoisture
      });
      if (res.success) {
        setResult(res);
      } else {
        setError(res.error || 'Decision Tree prediction failed.');
      }
    } catch (err: any) {
      setError('Unable to connect to Decision Tree V2 API endpoint.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDecision();
  }, [selectedFieldId, crop, N, P, K, temp, humidity, ph, rainfall, soilMoisture]);

  const handleFieldChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const fId = e.target.value;
    setSelectedFieldId(fId);
    const targetField = fields.find((f) => f.id === fId || f.fieldId === fId);
    if (targetField) {
      setCrop(targetField.crop || 'rice');
      setSoilMoisture(targetField.soilMoisture ?? 45.0);
      setPh(targetField.soilPH ?? 6.5);
      setTemp(targetField.temperature ?? 28.0);
      setHumidity(targetField.humidity ?? 65.0);
      setRainfall(targetField.rainfall ?? 100.0);
      // Sync NPK from field telemetry data
      setN(targetField.nitrogen ?? 59);
      setP(targetField.phosphorus ?? 54);
      setK(targetField.potassium ?? 48);
    }
  };

  const getStatusBadgeClass = (statusStr?: string) => {
    switch (statusStr) {
      case 'Critical':
        return 'bg-error/15 text-error border-error/30';
      case 'Attention':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'Healthy':
      default:
        return 'bg-secondary/15 text-secondary border-secondary/30';
    }
  };

  const getWaterNeedBadgeClass = (waterStr?: string) => {
    switch (waterStr) {
      case 'Urgent':
        return 'bg-error/15 text-error border-error/30';
      case 'High':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'Moderate':
        return 'bg-blue-100 text-blue-800 border-blue-300';
      case 'Low':
      default:
        return 'bg-secondary/15 text-secondary border-secondary/30';
    }
  };

  const getActionButtonClass = (actionStr?: string) => {
    switch (actionStr) {
      case 'Pathogen AI':
        return 'bg-error text-on-error hover:opacity-90 shadow-sm';
      case 'Queue Run':
        return 'bg-amber-700 text-white hover:bg-amber-800 shadow-sm';
      case 'Inspect':
      default:
        return 'bg-secondary text-on-secondary hover:bg-primary shadow-sm';
    }
  };

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/40 rounded-2xl p-5 shadow-xs flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-outline-variant/30">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center font-bold">
            <span className="material-symbols-outlined text-[24px]">account_tree</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-bold text-base text-on-surface">FIELD AI DECISION</h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-secondary/15 text-secondary uppercase tracking-wider">
                Decision Tree V2
              </span>
            </div>
            <p className="text-xs text-on-surface-variant">Dual-Model ML Field Inference (Status & Water Need)</p>
          </div>
        </div>

        {/* Field Selector */}
        {fields && fields.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-on-surface-variant">Select Sector:</span>
            <select
              value={selectedFieldId}
              onChange={handleFieldChange}
              className="bg-surface-container-low border border-outline-variant/50 rounded-xl px-3 py-1.5 text-xs font-semibold text-on-surface focus:outline-none focus:ring-1 focus:ring-secondary"
            >
              {fields.map((f) => (
                <option key={f.id || f.fieldId} value={f.id || f.fieldId}>
                  {f.name} ({f.crop})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Main Decision Matrix Display */}
      {loading ? (
        <div className="py-8 flex flex-col items-center justify-center gap-2 text-on-surface-variant text-xs">
          <span className="material-symbols-outlined animate-spin text-secondary text-[28px]">sync</span>
          <span>Running Decision Tree V2 Inference...</span>
        </div>
      ) : error ? (
        <div className="p-4 rounded-xl bg-error/10 border border-error/20 text-error text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={fetchDecision}
            className="px-2 py-1 bg-error text-on-error rounded-lg font-bold text-[11px] hover:opacity-90 cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : result ? (
        <div className="flex flex-col gap-4">

          {/* Decision Cards Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">

            {/* CARD 1: STATUS */}
            <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant">
                  STATUS
                </span>
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                  {result.status === 'Critical' ? 'emergency' : result.status === 'Attention' ? 'warning' : 'check_circle'}
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className={`px-3 py-1 rounded-xl text-lg font-extrabold border ${getStatusBadgeClass(result.status)}`}>
                  {translateEnum('status', result.status, result.status)}
                </span>
                <span className="text-xs font-bold text-on-surface-variant">
                  {formatNumber(result.status_confidence)}% Conf.
                </span>
              </div>
              <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden mt-1">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${result.status === 'Critical' ? 'bg-error' : result.status === 'Attention' ? 'bg-amber-600' : 'bg-secondary'}`}
                  style={{ width: `${result.status_confidence}%` }}
                />
              </div>
            </div>

            {/* CARD 2: WATER NEED */}
            <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant">
                  WATER NEED
                </span>
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                  water_drop
                </span>
              </div>
              <div className="flex items-baseline justify-between">
                <span className={`px-3 py-1 rounded-xl text-lg font-extrabold border ${getWaterNeedBadgeClass(result.water_need)}`}>
                  {translateEnum('common.enums.waterRequirements', result.water_need, result.water_need)}
                </span>
                <span className="text-xs font-bold text-on-surface-variant">
                  {formatNumber(result.water_need_confidence)}% Conf.
                </span>
              </div>
              <div className="w-full bg-surface-container-high rounded-full h-1.5 overflow-hidden mt-1">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${result.water_need === 'Urgent' ? 'bg-error' : result.water_need === 'High' ? 'bg-amber-600' : 'bg-secondary'}`}
                  style={{ width: `${result.water_need_confidence}%` }}
                />
              </div>
            </div>

            {/* CARD 3: ACTION POLICY */}
            <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] uppercase tracking-wider font-bold text-on-surface-variant">
                  RECOMMENDED ACTION
                </span>
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">
                  bolt
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-extrabold text-on-surface">
                  {translateEnum('common.enums.recommendations', result.action, result.action)}
                </span>
                <button
                  type="button"
                  onClick={() => navigate(result.action_route || '/fields')}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1 cursor-pointer transition-all ${getActionButtonClass(result.action)}`}
                >
                  <span>Execute</span>
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </button>
              </div>
              <p className="text-[11px] text-on-surface-variant truncate mt-1">
                {result.action === 'Pathogen AI'
                  ? 'Triggers su0.1 Disease & Pathogen AI Studio'
                  : result.action === 'Queue Run'
                  ? 'Triggers Genetic Irrigation Planner'
                  : 'Requires routine manual field check'}
              </p>
            </div>

          </div>

          {/* Model Confidence & Telemetry Context Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded-xl bg-surface-container-low text-xs border border-outline-variant/20">
            <div className="flex items-center gap-2 text-on-surface-variant">
              <span className="material-symbols-outlined text-[16px] text-secondary">analytics</span>
              <span className="font-semibold">Model Confidence Scores:</span>
              <span className="font-mono bg-surface-container px-2 py-0.5 rounded text-on-surface">
                Status: {formatNumber(result.status_confidence)}%
              </span>
              <span className="font-mono bg-surface-container px-2 py-0.5 rounded text-on-surface">
                Water Need: {formatNumber(result.water_need_confidence)}%
              </span>
            </div>

            <div className="flex items-center gap-2 text-on-surface-variant">
              <span className="text-[10px] text-outline font-medium">
                Soil Moisture ({formatNumber(soilMoisture)}%): Synthetic / Derived Dataset V2
              </span>
            </div>
          </div>

          {/* Warning Banner if Low Confidence */}
          {result.is_low_confidence && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2 font-medium">
              <span className="material-symbols-outlined text-amber-600 text-[18px]">warning</span>
              <span>AI confidence is low. Please inspect the field manually before executing automated decisions.</span>
            </div>
          )}

        </div>
      ) : null}
    </div>
  );
};
