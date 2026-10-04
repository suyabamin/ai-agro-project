/**
 * AgroAI — Owner Enterprise Dashboard
 * Route: /owner-dashboard
 * Complete farm & field management, Mapbox GL JS geometry, farmer assignment, and monitoring feed.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import type { GeoPolygon, GeoLineString } from '../components/map/AgroMap';
import { AgroMap } from '../components/map/AgroMap';
import type { Farm, Field, FarmerProfile, FieldImageRecord, FieldLandData, FarmerRating, AssignmentRequest } from '../services/ecosystem';
import {
  getFarms,
  createFarm,
  deleteField,
  getOwnerFields,
  createField,
  updateField,
  getRegisteredFarmers,
  getFieldImages,
  getFieldData,
  submitFarmerRating,
  getFarmerRatings,
  getHiredFarmerIdsForOwner,
  getFieldAssignedWorkers,
  getOwnerIncomingApplications,
  approveAssignmentRequest,
  rejectAssignmentRequest,
  ECOSYSTEM_UPDATED_EVENT,
  notifyEcosystemChange,
  freeFarmerFromOwner,
} from '../services/ecosystem';

const growthStageTranslationKeys: Record<string, string> = {
  Germination: 'farmerDashboard.growthStages.germination',
  'Vegetative Growth': 'farmerDashboard.growthStages.vegetativeGrowth',
  'Flowering & Tasseling': 'farmerDashboard.growthStages.floweringTasseling',
  Maturation: 'farmerDashboard.growthStages.maturation',
};

export const OwnerDashboard: React.FC = () => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const { t, translateEnum, formatDate, formatNumber } = useI18n();
  const translateGrowthStage = (value: string) =>
    t(growthStageTranslationKeys[value] || 'farmerDashboard.growthStage', value || t('common.unknown'));

  const [farms, setFarms] = useState<Farm[]>([]);
  const [fields, setFields] = useState<Field[]>([]);
  const [farmers, setFarmers] = useState<FarmerProfile[]>([]);
  const [images, setImages] = useState<FieldImageRecord[]>([]);

  // Selected Field for Detailed Monitoring Panel
  const [selectedFieldForDetail, setSelectedFieldForDetail] = useState<Field | null>(null);
  const [selectedFieldSubmissions, setSelectedFieldSubmissions] = useState<FieldLandData[]>([]);
  const [selectedFieldPhotos, setSelectedFieldPhotos] = useState<FieldImageRecord[]>([]);

  // Modals
  const [showAddFarmModal, setShowAddFarmModal] = useState(false);
  const [showAddFieldWizard, setShowAddFieldWizard] = useState(false);
  const [editingField, setEditingField] = useState<Field | null>(null);
  const [fieldToDelete, setFieldToDelete] = useState<Field | null>(null);
  const [isDeletingField, setIsDeletingField] = useState(false);

  // New Farm State
  const [farmName, setFarmName] = useState('');
  const [farmLocation, setFarmLocation] = useState('');
  const [farmArea, setFarmArea] = useState('420');
  const [farmDesc, setFarmDesc] = useState('');

  // New / Edit Field State
  const [fieldName, setFieldName] = useState('');
  const [fieldCrop, setFieldCrop] = useState('Rice');
  const [fieldSoil, setFieldSoil] = useState('Salinas Silty Loam');
  const [fieldArea, setFieldArea] = useState('12.5');
  const [fieldLat, setFieldLat] = useState<number>(36.677);
  const [fieldLng, setFieldLng] = useState<number>(-121.655);
  const [fieldBoundary, setFieldBoundary] = useState<GeoPolygon | null>(null);
  const [fieldPath, setFieldPath] = useState<GeoLineString | null>(null);

  // Farmer Rating & Reviews State
  const [rateModalOpen, setRateModalOpen] = useState(false);
  const [reviewsModalOpen, setReviewsModalOpen] = useState(false);
  const [targetFarmerForRate, setTargetFarmerForRate] = useState<FarmerProfile | null>(null);
  const [targetFarmerForReviews, setTargetFarmerForReviews] = useState<FarmerProfile | null>(null);
  const [farmerReviews, setFarmerReviews] = useState<FarmerRating[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [ratingScore, setRatingScore] = useState<number>(5);
  const [ratingHover, setRatingHover] = useState<number>(0);
  const [ratingFeedback, setRatingFeedback] = useState<string>('');
  const [ratingFieldId, setRatingFieldId] = useState<string>('');
  const [isSubmittingRating, setIsSubmittingRating] = useState<boolean>(false);
  const [ratingModalSuccess, setRatingModalSuccess] = useState<string>('');
  const [ratingModalError, setRatingModalError] = useState<string>('');
  const [hiredFarmerIds, setHiredFarmerIds] = useState<Set<string>>(new Set());
  const [incomingApplications, setIncomingApplications] = useState<AssignmentRequest[]>([]);
  const [appActionLoadingId, setAppActionLoadingId] = useState<string | null>(null);
  const [appActionToast, setAppActionToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);

  const handleOwnerAccept = async (app: AssignmentRequest) => {
    setAppActionLoadingId(app.id);
    try {
      const res = await approveAssignmentRequest(app.id);
      if (res.success) {
        setAppActionToast({
          message: t('farmers.acceptSuccess', `${app.farmerName} approved and assigned to ${app.fieldName}!`, {
            farmerName: app.farmerName,
            fieldName: app.fieldName,
          }),
          type: 'success',
        });
        notifyEcosystemChange();
        loadEcosystemData();
      } else {
        setAppActionToast({ message: res.error || 'Failed to approve application', type: 'error' });
      }
    } catch (err: any) {
      setAppActionToast({ message: err?.message || 'Error approving application', type: 'error' });
    } finally {
      setAppActionLoadingId(null);
      setTimeout(() => setAppActionToast(null), 5000);
    }
  };

  const handleOwnerDecline = async (requestId: string) => {
    setAppActionLoadingId(requestId);
    try {
      const res = await rejectAssignmentRequest(requestId);
      if (res.success) {
        setAppActionToast({
          message: t('farmers.rejectSuccess', 'Assignment request declined.'),
          type: 'info',
        });
        notifyEcosystemChange();
        loadEcosystemData();
      } else {
        setAppActionToast({ message: res.error || 'Failed to decline application', type: 'error' });
      }
    } catch (err: any) {
      setAppActionToast({ message: err?.message || 'Error declining application', type: 'error' });
    } finally {
      setAppActionLoadingId(null);
      setTimeout(() => setAppActionToast(null), 5000);
    }
  };

  // Filter only farmers hired by this owner (actively assigned or with approved contracts)
  const hiredFarmers = useMemo(() => {
    return farmers.filter((farmer) => {
      const isAssigned = fields.some((f) =>
        getFieldAssignedWorkers(f).some((w) => w.farmerId === farmer.uid)
      );
      return isAssigned || hiredFarmerIds.has(farmer.uid);
    });
  }, [farmers, fields, hiredFarmerIds]);

  const handleDeleteFieldConfirm = async () => {
    if (!fieldToDelete) return;
    setIsDeletingField(true);
    await deleteField(fieldToDelete.fieldId || (fieldToDelete as any).id);
    setIsDeletingField(false);
    setFieldToDelete(null);
    notifyEcosystemChange();
    loadEcosystemData();
  };

  const handleOpenRateModal = (farmer: FarmerProfile, fieldId?: string) => {
    const isHired =
      fields.some((f) => getFieldAssignedWorkers(f).some((w) => w.farmerId === farmer.uid)) ||
      hiredFarmerIds.has(farmer.uid);
    if (!isHired) {
      alert(t('farmerRating.onlyHiredCanRate', 'Only farm owners who have hired this farmer for work can submit ratings and comments.'));
      return;
    }
    setTargetFarmerForRate(farmer);
    setRatingScore(5);
    setRatingHover(0);
    setRatingFeedback('');
    setRatingFieldId(fieldId || (fields[0]?.fieldId || ''));
    setRatingModalSuccess('');
    setRatingModalError('');
    setRateModalOpen(true);
  };

  const [freeingFarmerId, setFreeingFarmerId] = useState<string | null>(null);

  const handleFreeFarmer = async (farmer: FarmerProfile) => {
    const assignedFieldsList = fields.filter((f) =>
      getFieldAssignedWorkers(f).some((w) => w.farmerId === farmer.uid)
    );
    const fieldNames = assignedFieldsList.map((f) => f.name).join(', ');
    const confirmRelease = window.confirm(
      t(
        'farmers.freeFarmerConfirm',
        `Work finished? ${farmer.fullName} will be removed from your fields${fieldNames ? ` (${fieldNames})` : ''} and become available for other owners to hire.`,
        { farmerName: farmer.fullName, fields: fieldNames }
      )
    );
    if (!confirmRelease) return;

    setFreeingFarmerId(farmer.uid);
    try {
      const activeOwnerId = user?.uid || 'owner_demo';
      const res = await freeFarmerFromOwner(activeOwnerId, farmer.uid, farmer.fullName);
      if (res.success) {
        alert(
          t('farmers.freeFarmerSuccess', `${farmer.fullName} has been freed and is now available for hire.`, {
            farmerName: farmer.fullName,
          })
        );
        notifyEcosystemChange();
        await loadEcosystemData();
      } else {
        alert(res.error || 'Failed to free farmer');
      }
    } catch (err: any) {
      alert(err?.message || 'Error freeing farmer');
    } finally {
      setFreeingFarmerId(null);
    }
  };

  const handleOpenReviewsModal = async (farmer: FarmerProfile) => {
    setTargetFarmerForReviews(farmer);
    setReviewsModalOpen(true);
    setReviewsLoading(true);
    try {
      const list = await getFarmerRatings(farmer.uid);
      setFarmerReviews(list);
    } catch {
      setFarmerReviews([]);
    } finally {
      setReviewsLoading(false);
    }
  };

  const handleSubmitRating = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetFarmerForRate) return;
    if (!ratingFeedback.trim()) {
      setRatingModalError(t('farmerRating.commentRequired', 'Please provide a written comment about your experience with this farmer.'));
      return;
    }

    setIsSubmittingRating(true);
    setRatingModalError('');
    const relatedField = fields.find((f) => f.fieldId === ratingFieldId || (f as any).id === ratingFieldId);
    
    const res = await submitFarmerRating({
      farmerId: targetFarmerForRate.uid,
      farmerName: targetFarmerForRate.fullName,
      ownerId: user?.uid || 'owner_demo',
      ownerName: userProfile?.fullName || farms[0]?.name || 'Farm Owner',
      rating: ratingScore,
      feedback: ratingFeedback.trim(),
      fieldId: ratingFieldId || undefined,
      fieldName: relatedField ? relatedField.name : undefined,
    });

    setIsSubmittingRating(false);
    if (!res.success) {
      setRatingModalError(res.error || 'Failed to submit rating.');
      return;
    }

    setRatingModalSuccess(t('farmerRating.ratingSuccess', 'Rating and comment submitted successfully!'));
    loadEcosystemData();
    setTimeout(() => {
      setRateModalOpen(false);
      setRatingModalSuccess('');
      setRatingModalError('');
    }, 1200);
  };

  const loadEcosystemData = async () => {
    try {
      // Fetch all farms & fields from DB (no ownerId filter — show all DB records)
      const farmList = await getFarms();
      const fieldList = await getOwnerFields();
      const farmerList = await getRegisteredFarmers();
      setFarms(farmList);
      setFields(fieldList);
      setFarmers(farmerList);

      // Load hired farmer IDs for the active owner
      const hiredList = await getHiredFarmerIdsForOwner(user?.uid || 'owner_demo');
      setHiredFarmerIds(new Set(hiredList));

      // Load pending specialist work applications for this owner
      const incomingApps = await getOwnerIncomingApplications(user?.uid || 'owner_demo');
      setIncomingApplications(incomingApps || []);

      // Select first field by default for detailed inspection if none selected
      if (fieldList.length > 0) {
        const targetField = selectedFieldForDetail
          ? fieldList.find((f) => f.fieldId === selectedFieldForDetail.fieldId || (f as any).id === (selectedFieldForDetail as any).id) || fieldList[0]
          : fieldList[0];
        setSelectedFieldForDetail(targetField);
        loadFieldTelemetry(targetField.fieldId || (targetField as any).id);
      }

      // Load all images for count card
      if (fieldList.length > 0) {
        let allImgs: FieldImageRecord[] = [];
        for (const f of fieldList) {
          const targetId = f.fieldId || (f as any).id;
          const imgs = await getFieldImages(targetId);
          allImgs = [...allImgs, ...imgs];
        }
        setImages(allImgs);
      }
    } catch {
      // Memory fallback
    }
  };

  const loadFieldTelemetry = async (fieldId: string) => {
    const subData = await getFieldData(fieldId);
    const photoData = await getFieldImages(fieldId);
    setSelectedFieldSubmissions(subData);
    setSelectedFieldPhotos(photoData);
  };

  useEffect(() => {
    loadEcosystemData();
    window.addEventListener(ECOSYSTEM_UPDATED_EVENT, loadEcosystemData);
    return () => window.removeEventListener(ECOSYSTEM_UPDATED_EVENT, loadEcosystemData);
  }, [user]);

  // Handle Add / Edit Farm Submit
  const handleAddFarm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!farmName.trim()) return;
    await createFarm({
      ownerId: user?.uid || 'owner_demo',
      name: farmName.trim(),
      location: farmLocation.trim() || 'Sector 4, Salinas Valley',
      areaHectares: parseFloat(farmArea) || 100,
      description: farmDesc.trim(),
    });
    setShowAddFarmModal(false);
    setFarmName('');
    setFarmLocation('');
    setFarmDesc('');
    notifyEcosystemChange();
    loadEcosystemData();
  };

  // Open Edit Wizard
  const openEditFieldWizard = (f: Field) => {
    setEditingField(f);
    setFieldName(f.name || '');
    setFieldCrop(f.crop || 'Rice');
    setFieldSoil(f.soilType || 'Salinas Silty Loam');
    setFieldArea(f.areaAcres !== undefined && f.areaAcres !== null ? f.areaAcres.toString() : '10');
    setFieldLat(typeof f.latitude === 'number' && Number.isFinite(f.latitude) ? f.latitude : 36.677);
    setFieldLng(typeof f.longitude === 'number' && Number.isFinite(f.longitude) ? f.longitude : -121.655);
    setFieldBoundary(f.boundary || null);
    setFieldPath(f.path || null);
    setShowAddFieldWizard(true);
  };

  // Handle Add or Update Field Submit
  const handleSaveField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fieldName.trim()) return;

    if (editingField) {
      const targetId = editingField.fieldId || (editingField as any).id;
      await updateField(targetId, {
        name: fieldName.trim(),
        crop: fieldCrop,
        soilType: fieldSoil,
        areaAcres: parseFloat(fieldArea) || 10,
        boundary: fieldBoundary,
        path: fieldPath,
      });
    } else {
      await createField({
        farmId: farms[0]?.farmId || (farms[0] as any)?.id || 'farm_salinas_01',
        ownerId: user?.uid || 'owner_demo',
        name: fieldName.trim(),
        crop: fieldCrop,
        soilType: fieldSoil,
        areaAcres: parseFloat(fieldArea) || 10,
        latitude: fieldLat,
        longitude: fieldLng,
        boundary: fieldBoundary,
        path: fieldPath,
        status: 'Healthy',
      });
    }

    setShowAddFieldWizard(false);
    setEditingField(null);
    setFieldName('');
    setFieldBoundary(null);
    setFieldPath(null);
    notifyEcosystemChange();
    loadEcosystemData();
  };

  return (
    <div className="px-margin-lg py-margin flex flex-col gap-space-xl max-w-[1600px] w-full mx-auto">
      {/* Top Header & Overview Meta */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-md bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-outline-variant/30">
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-primary-container text-on-primary font-label-sm text-xs font-semibold uppercase tracking-wider">
              {t('ownerDashboard.workspace', 'Owner Workspace')}
            </span>
            <span className="font-label-sm text-xs text-on-surface-variant">• {t('ownerDashboard.enterpriseRoleActive', 'Enterprise Role Active')}</span>
          </div>
          <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight">
            {t('ownerDashboard.welcomeBack', 'Welcome back, {name}', { name: userProfile?.fullName || translateEnum('common.enums.roles', 'farm_owner') })}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-3xl">
            {t('ownerDashboard.description', 'Manage your farms, draw Mapbox spatial field boundaries, assign field workers, and monitor telemetry.')}
          </p>
        </div>

        <div className="flex items-center gap-space-sm flex-wrap self-start md:self-center">
          <button
            type="button"
            onClick={() => setShowAddFarmModal(true)}
            className="h-10 px-space-md rounded-xl bg-surface-container-highest text-on-surface font-headline-sm text-body-sm hover:bg-surface-container-high transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add_business</span>
            <span>{t('ownerDashboard.addFarm', '+ Add Farm')}</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setEditingField(null);
              setFieldName('');
              setFieldBoundary(null);
              setFieldPath(null);
              setShowAddFieldWizard(true);
            }}
            className="h-10 px-space-lg rounded-xl bg-primary text-on-primary font-headline-sm text-body-sm hover:bg-primary-container transition-all flex items-center gap-1.5 cursor-pointer shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add_location_alt</span>
            <span>{t('ownerDashboard.addNewField', '+ Add New Field')}</span>
          </button>
        </div>
      </div>

      {/* Toast Feedback */}
      {appActionToast && (
        <div
          className={`p-space-md rounded-xl shadow-md border flex items-center justify-between transition-all animate-fadeIn ${
            appActionToast.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : appActionToast.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              : 'bg-primary-500/10 border-primary-500/30 text-primary-300'
          }`}
        >
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-xl">
              {appActionToast.type === 'success' ? 'check_circle' : appActionToast.type === 'error' ? 'error' : 'info'}
            </span>
            <span className="font-label-md font-medium">{appActionToast.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setAppActionToast(null)}
            className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Incoming Specialist Applications Action Panel */}
      {incomingApplications.length > 0 && (
        <div className="p-space-lg rounded-2xl bg-surface-container-lowest border border-amber-500/30 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 left-0 h-1.5 w-full bg-gradient-to-r from-amber-500 via-primary to-emerald-500" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-space-md border-b border-outline-variant/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center shrink-0 border border-amber-500/20 shadow-inner">
                <span className="material-symbols-outlined text-[22px]">assignment_ind</span>
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-headline-sm text-body-md font-bold text-on-surface">
                    {t('farmers.incomingApplicationsTitle', 'Incoming Specialist Applications')}
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold animate-pulse">
                    {incomingApplications.length}
                  </span>
                </div>
                <p className="text-body-sm text-on-surface-variant">
                  {t(
                    'farmers.incomingApplicationsDesc',
                    'Specialists have applied to work on your farm fields. Review their rates and approve assignments.'
                  )}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/farmers?tab=assignments')}
              className="px-4 py-2 rounded-xl bg-surface-container-low hover:bg-surface-container text-primary text-xs font-semibold transition-all shadow-sm flex items-center gap-1.5 shrink-0 cursor-pointer self-start sm:self-auto"
            >
              <span>{t('farmers.reviewApplications', 'Manage All in Worker Hub')}</span>
              <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
            </button>
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
                      Pending
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
                        {t('farmers.workType', 'Role')}:
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
                    type="button"
                    onClick={() => handleOwnerAccept(app)}
                    disabled={appActionLoadingId === app.id}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-label-sm font-semibold shadow-sm transition-all disabled:opacity-50 cursor-pointer"
                  >
                    {appActionLoadingId === app.id ? (
                      <span className="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                    ) : (
                      <span className="material-symbols-outlined text-sm">check_circle</span>
                    )}
                    <span>{t('layout.acceptAndAssign', 'Accept & Assign')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleOwnerDecline(app.id)}
                    disabled={appActionLoadingId === app.id}
                    className="px-3 py-2 rounded-lg border border-outline-variant/60 hover:bg-surface-container text-on-surface-variant hover:text-on-surface font-label-sm font-medium transition-all disabled:opacity-50 cursor-pointer"
                  >
                    <span>{t('layout.decline', 'Decline')}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Metric Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-gutter">
        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-outline-variant/30 flex items-center gap-space-md">
          <div className="w-12 h-12 rounded-xl bg-primary-container text-on-primary flex items-center justify-center font-headline-md">
            <span className="material-symbols-outlined text-[26px]">agriculture</span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
              {t('ownerDashboard.managedFarms', 'Managed Farms')}
            </span>
            <span className="font-display-md text-display-md text-on-surface font-bold">
              {formatNumber(farms.length)}
            </span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-outline-variant/30 flex items-center gap-space-md">
          <div className="w-12 h-12 rounded-xl bg-secondary-container text-on-secondary-container flex items-center justify-center font-headline-md">
            <span className="material-symbols-outlined text-[26px]">square_foot</span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
              {t('ownerDashboard.activeFields', 'Active Fields')}
            </span>
            <span className="font-display-md text-display-md text-on-surface font-bold">
              {formatNumber(fields.length)}
            </span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-outline-variant/30 flex items-center gap-space-md">
          <div className="w-12 h-12 rounded-xl bg-tertiary-container text-on-tertiary-container flex items-center justify-center font-headline-md">
            <span className="material-symbols-outlined text-[26px]">badge</span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
              {t('ownerDashboard.hiredFarmers', 'Hired Farmers')}
            </span>
            <span className="font-display-md text-display-md text-on-surface font-bold">
              {formatNumber(hiredFarmers.length)}
            </span>
          </div>
        </div>

        <div className="bg-surface-container-lowest p-space-md rounded-xl shadow-sm border border-outline-variant/30 flex items-center gap-space-md">
          <div className="w-12 h-12 rounded-xl bg-surface-container text-secondary flex items-center justify-center font-headline-md">
            <span className="material-symbols-outlined text-[26px]">photo_library</span>
          </div>
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider font-semibold">
              {t('ownerDashboard.fieldImagesUploaded', 'Field Images Uploaded')}
            </span>
            <span className="font-display-md text-display-md text-on-surface font-bold">
              {formatNumber(images.length)}
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Mapbox GIS View */}
      <section className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-space-md">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-space-sm border-b border-outline-variant/20 gap-space-sm">
          <div className="flex items-center gap-space-xs">
            <span className="material-symbols-outlined text-secondary text-[22px]">map</span>
            <h2 className="font-headline-md text-headline-md text-on-surface">
              {t('ownerDashboard.interactiveMapTitle', 'Interactive Farm GIS Boundary Map: {field}', {
                field: selectedFieldForDetail?.name || t('ownerDashboard.allFieldsOverview', 'All Fields Overview'),
              })}
            </h2>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {fields.length > 0 && (
              <div className="flex items-center gap-1.5 bg-surface px-2.5 py-1 rounded-lg border border-outline-variant/40 text-xs">
                <span className="text-on-surface-variant font-medium">{t('fields.title', 'Field')}:</span>
                <select
                  value={selectedFieldForDetail?.fieldId || (selectedFieldForDetail as any)?.id || ''}
                  onChange={(e) => {
                    const target = fields.find((f) => f.fieldId === e.target.value || (f as any).id === e.target.value);
                    if (target) {
                      setSelectedFieldForDetail(target);
                      loadFieldTelemetry(target.fieldId || (target as any).id);
                    }
                  }}
                  className="bg-transparent font-semibold text-on-surface focus:outline-none cursor-pointer"
                >
                  {fields.map((f) => (
                    <option key={f.fieldId || (f as any).id} value={f.fieldId || (f as any).id}>
                      {f.name} ({f.crop})
                    </option>
                  ))}
                </select>
              </div>
            )}
            <button
              type="button"
              onClick={() => navigate('/farmers?tab=assignments')}
              className="h-8 px-2.5 rounded-lg bg-primary-container text-on-primary-container text-xs font-semibold hover:bg-primary hover:text-on-primary transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
              title={t('ownerDashboard.fieldAssignments', 'Field Parcels & Worker Assignments')}
            >
              <span className="material-symbols-outlined text-[16px]">assignment_ind</span>
              <span>{t('ownerDashboard.fieldAssignments', 'Field Parcels & Worker Assignments')}</span>
            </button>
            <span className="font-data-mono text-xs text-secondary bg-surface-container px-2.5 py-1 rounded-md">
              {t('ownerDashboard.mapboxEnabled', 'Mapbox GL JS Enabled')}
            </span>
          </div>
        </div>

        <AgroMap
          initialCenter={
            selectedFieldForDetail &&
            Number.isFinite(selectedFieldForDetail.longitude) &&
            Number.isFinite(selectedFieldForDetail.latitude)
              ? [selectedFieldForDetail.longitude, selectedFieldForDetail.latitude]
              : [-121.655, 36.677]
          }
          initialZoom={14}
          boundary={selectedFieldForDetail?.boundary || null}
          path={selectedFieldForDetail?.path || null}
          readOnly={true}
          fieldTitle={selectedFieldForDetail?.name || t('ownerDashboard.defaultMapFieldTitle', 'Salinas Valley Farm Sector')}
          height="450px"
        />
      </section>

      {/* Main Grid: Farmers Directory & Field Telemetry Drawer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg items-start">
        {/* Left Column (Left 7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-space-md">
          {/* Quick link banner to Farmers workforce page where assignments reside */}
          <div className="bg-primary/5 border border-primary/20 p-space-md rounded-xl flex items-center justify-between gap-space-md">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-container text-on-primary flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[22px]">assignment_ind</span>
              </div>
              <div className="min-w-0">
                <h4 className="font-headline-sm text-sm text-primary font-semibold truncate">
                  {t('ownerDashboard.fieldAssignments', 'Field Parcels & Worker Assignments')}
                </h4>
                <p className="text-xs text-on-surface-variant line-clamp-1">
                  Field parcels and worker assignments are now managed under the Farmers section.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/farmers?tab=assignments')}
              className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container transition-all flex items-center gap-1 shrink-0"
            >
              <span>Manage</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>

          {/* Hired Farmers & Specialists Directory */}
          <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-space-md">
            <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20 flex-wrap gap-2">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-[22px]">badge</span>
                <h3 className="font-headline-md text-headline-md text-on-surface">
                  {t('ownerDashboard.hiredFarmersDirectory', 'Hired Farmers & Specialists')}
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-on-surface-variant font-medium px-2.5 py-0.5 rounded-full bg-surface-container">
                  {t('ownerDashboard.hiredCount', '{count} Hired', { count: formatNumber(hiredFarmers.length) })}
                </span>
                <button
                  type="button"
                  onClick={() => navigate('/farmers?tab=directory')}
                  className="text-xs text-primary hover:underline font-semibold flex items-center gap-0.5 cursor-pointer ml-1"
                  title={t('ownerDashboard.browseAllFarmers', 'Browse All Farmers')}
                >
                  <span>{t('ownerDashboard.browseAllFarmers', 'Browse All')}</span>
                  <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                </button>
              </div>
            </div>

            {hiredFarmers.length === 0 ? (
              <div className="py-8 px-4 text-center flex flex-col items-center justify-center gap-3 bg-surface rounded-xl border border-outline-variant/20">
                <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                  <span className="material-symbols-outlined text-[24px]">group_off</span>
                </div>
                <div className="flex flex-col gap-1 max-w-sm">
                  <h4 className="font-semibold text-sm text-on-surface">
                    {t('ownerDashboard.noHiredFarmersTitle', 'No Hired Farmers Yet')}
                  </h4>
                  <p className="text-xs text-on-surface-variant">
                    {t('ownerDashboard.noHiredFarmers', 'You haven\'t hired any farmers for your fields yet. Browse available registered farmers to send work proposals or assign directly.')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate('/farmers?tab=directory')}
                  className="px-4 py-2 rounded-xl bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <span className="material-symbols-outlined text-[16px]">person_search</span>
                  <span>{t('ownerDashboard.browseAllFarmers', 'Browse Farmers Directory')}</span>
                </button>
              </div>
            ) : (
              <div className="flex flex-col space-y-2.5">
                {hiredFarmers.map((farmer) => {
                  const assignedFieldsList = fields.filter((f) =>
                    getFieldAssignedWorkers(f).some((w) => w.farmerId === farmer.uid)
                  );
                  const isAssigned = assignedFieldsList.length > 0;
                  return (
                    <div
                      key={farmer.uid}
                      className="bg-surface p-space-sm px-space-md rounded-lg border border-outline-variant/20 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-space-sm min-w-0">
                        <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-bold text-xs shrink-0">
                          {(farmer.fullName || 'Farmer').charAt(0).toUpperCase()}
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="font-headline-sm text-xs font-semibold text-on-surface truncate">{farmer.fullName || 'Farmer Worker'}</span>
                          <span className="font-body-sm text-[11px] text-on-surface-variant truncate">{farmer.email}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {/* Rating Badge */}
                        {farmer.totalRatings && farmer.totalRatings > 0 ? (
                          <button
                            type="button"
                            onClick={() => handleOpenReviewsModal(farmer)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/25 text-xs font-bold hover:bg-amber-500/20 transition-all cursor-pointer shadow-2xs"
                            title={t('farmerRating.viewReviews')}
                          >
                            <span className="text-amber-500 text-sm leading-none">★</span>
                            <span>{typeof farmer.averageRating === 'number' ? farmer.averageRating.toFixed(1) : '5.0'}</span>
                            <span className="text-[10px] text-on-surface-variant font-normal">({farmer.totalRatings})</span>
                          </button>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant text-[11px] font-medium">
                            {t('farmerRating.newWorker')}
                          </span>
                        )}

                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                            isAssigned
                              ? 'bg-secondary-container text-on-secondary-container border border-secondary'
                              : 'bg-primary-container/30 text-primary border border-primary/20'
                          }`}
                        >
                          {isAssigned
                            ? t('ownerDashboard.assignedToField', 'Assigned to {field}', { field: assignedFieldsList.map((f) => f.name).join(', ') })
                            : t('farmerRating.verifiedEmployer', 'Hired Specialist')}
                        </span>

                        {/* Rate Worker Button (Always active since they are hired) */}
                        <button
                          type="button"
                          onClick={() => handleOpenRateModal(farmer, assignedFieldsList[0]?.fieldId)}
                          className="h-8 px-2.5 rounded-lg bg-primary-container text-on-primary-container text-xs font-semibold hover:bg-primary hover:text-on-primary transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                          title={t('farmerRating.rateWorker', 'Rate & Comment on Farmer')}
                          aria-label={t('farmerRating.rateWorker', 'Rate & Comment on Farmer')}
                        >
                          <span className="material-symbols-outlined text-[15px]">rate_review</span>
                          <span>{t('farmerRating.rateFarmer', 'Rate & Comment')}</span>
                        </button>

                        {/* Finish Work & Free Farmer Button */}
                        <button
                          type="button"
                          disabled={freeingFarmerId === farmer.uid}
                          onClick={() => handleFreeFarmer(farmer)}
                          className="h-8 px-2.5 rounded-lg bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 border border-emerald-600/30 text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          title={t('farmers.freeFarmer', 'Finish Work & Free Farmer')}
                          aria-label={t('farmers.freeFarmer', 'Finish Work & Free Farmer')}
                        >
                          <span className="material-symbols-outlined text-[15px]">task_alt</span>
                          <span>{t('farmers.freeFarmerBtn', 'Finish & Free')}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => navigate(`/messages?user=${farmer.uid}`)}
                          className="h-8 px-2.5 rounded-lg bg-surface-container text-on-surface text-xs font-semibold hover:bg-surface-container-high transition-colors flex items-center gap-1 cursor-pointer"
                          title={t('ownerDashboard.chatWithFarmer', '1-to-1 Chat with Farmer')}
                          aria-label={t('ownerDashboard.chatWithFarmer', '1-to-1 Chat with Farmer')}
                        >
                          <span className="material-symbols-outlined text-[15px]">chat</span>
                          <span>{t('ownerDashboard.chat', 'Chat')}</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Detailed Telemetry & Submissions Panel (Right 5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-space-md">
          {selectedFieldForDetail ? (
            <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-space-md">
              <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
                <div className="flex flex-col">
                  <span className="font-label-sm text-xs text-secondary font-semibold uppercase tracking-wider">
                    {t('farm.fieldTelemetryInspector')}
                  </span>
                  <h3 className="font-headline-md text-headline-md text-on-surface">
                    {selectedFieldForDetail.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => openEditFieldWizard(selectedFieldForDetail)}
                  className="h-8 px-2.5 rounded-lg bg-surface-container text-on-surface text-xs font-semibold hover:bg-surface-container-high transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[15px]">edit</span>
                  <span>{t('ownerDashboard.editParcel', 'Edit Parcel')}</span>
                </button>
              </div>

              {/* Quick Field Summary */}
              <div className="grid grid-cols-2 gap-2 bg-surface p-3 rounded-lg border border-outline-variant/20 text-xs">
                <div>{t('fields.crop')}: <strong className="text-on-surface">{translateEnum('common.enums.crops', selectedFieldForDetail.crop, selectedFieldForDetail.crop)}</strong></div>
                <div>{t('fields.area')}: <strong className="text-on-surface">{formatNumber(selectedFieldForDetail.areaAcres ?? 0)} {t('farm.acres')}</strong></div>
                <div>{t('fields.soilType')}: <strong className="text-on-surface">{translateEnum('common.enums.soilTypes', selectedFieldForDetail.soilType, selectedFieldForDetail.soilType)}</strong></div>
                <div>{t('farm.worker')}: <strong className="text-on-surface">{getFieldAssignedWorkers(selectedFieldForDetail).length > 0 ? getFieldAssignedWorkers(selectedFieldForDetail).map((w) => w.farmerName).join(', ') : t('status.none')}</strong></div>
              </div>

              {/* Latest Submissions Feed */}
              <div className="flex flex-col gap-2">
                <h4 className="font-headline-sm text-xs font-semibold text-on-surface uppercase tracking-wider flex items-center justify-between">
                  <span>{t('ownerDashboard.farmerLandSubmissions', 'Farmer Land Submissions')}</span>
                  <span className="text-secondary font-data-mono">{t('common.records', { count: formatNumber(selectedFieldSubmissions.length) })}</span>
                </h4>

                {selectedFieldSubmissions.length === 0 ? (
                  <div className="p-4 text-center text-xs text-on-surface-variant bg-surface rounded-lg">
                    {t('ownerDashboard.noLandSubmissions', 'No field land data submitted yet for this field.')}
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5 max-h-[300px] overflow-y-auto pr-1">
                    {selectedFieldSubmissions.map((sub, idx) => (
                      <div key={sub.id || idx} className="bg-surface p-3 rounded-lg border border-outline-variant/20 flex flex-col gap-1.5 text-xs">
                        <div className="flex items-center justify-between text-on-surface-variant">
                          <span className="font-semibold text-on-surface">{sub.farmerName || translateEnum('common.enums.roles', 'farmer')}</span>
                          <span className="font-data-mono text-[11px]">
                            {sub.submittedAt ? formatDate(sub.submittedAt, { dateStyle: 'medium' }) : t('common.recent')}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-1 bg-surface-container-lowest p-2 rounded text-[11px]">
                          <div>{t('dashboard.moisture')}: <strong className="text-primary">{sub.soilMoisture !== undefined && sub.soilMoisture !== null ? `${formatNumber(sub.soilMoisture, { maximumFractionDigits: 2 })}%` : t('common.notAvailable')}</strong></div>
                          <div>{t('dashboard.ph')}: <strong>{sub.soilPH !== undefined && sub.soilPH !== null ? formatNumber(sub.soilPH, { maximumFractionDigits: 2 }) : t('common.notAvailable')}</strong></div>
                          <div>{t('ownerDashboard.temperature', 'Temp')}: <strong>{sub.temperature !== undefined && sub.temperature !== null ? `${formatNumber(sub.temperature, { maximumFractionDigits: 1 })}°C` : t('common.notAvailable')}</strong></div>
                          <div>{t('ownerDashboard.nitrogen', 'N')}: <strong>{sub.nitrogen !== undefined && sub.nitrogen !== null ? formatNumber(sub.nitrogen, { maximumFractionDigits: 2 }) : t('common.notAvailable')}</strong></div>
                          <div>{t('ownerDashboard.phosphorus', 'P')}: <strong>{sub.phosphorus !== undefined && sub.phosphorus !== null ? formatNumber(sub.phosphorus, { maximumFractionDigits: 2 }) : t('common.notAvailable')}</strong></div>
                          <div>{t('ownerDashboard.potassium', 'K')}: <strong>{sub.potassium !== undefined && sub.potassium !== null ? formatNumber(sub.potassium, { maximumFractionDigits: 2 }) : t('common.notAvailable')}</strong></div>
                        </div>
                        <div className="text-on-surface-variant text-[11px]">
                          {t('farmerDashboard.growthStage', 'Stage')}: <strong className="text-on-surface">{translateGrowthStage(sub.cropGrowthStage || '')}</strong>
                        </div>
                        {sub.notes && (
                          <p className="italic text-on-surface-variant text-[11px] bg-surface-container/30 p-1.5 rounded">
                            "{sub.notes}"
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Photos Gallery Feed */}
              <div className="flex flex-col gap-2 pt-2 border-t border-outline-variant/20">
                <h4 className="font-headline-sm text-xs font-semibold text-on-surface uppercase tracking-wider flex items-center justify-between">
                  <span>{t('ownerDashboard.fieldInspectionPhotos', 'Field Inspection Photos')}</span>
                  <span className="text-secondary font-data-mono">{t('ownerDashboard.photoCount', '{count} Photos', { count: formatNumber(selectedFieldPhotos.length) })}</span>
                </h4>

                {selectedFieldPhotos.length === 0 ? (
                  <div className="p-4 text-center text-xs text-on-surface-variant bg-surface rounded-lg">
                    {t('ownerDashboard.noPhotoObservations', 'No photo observations uploaded for this field.')}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto">
                    {selectedFieldPhotos.map((img, idx) => (
                      <div key={img.id || idx} className="group relative rounded-lg overflow-hidden border border-outline-variant/30 bg-surface-container/30">
                        <img
                          src={img.imageUrl}
                          alt={img.caption || t('accessibility.fieldObservation')}
                          className="w-full h-24 object-cover group-hover:scale-105 transition-transform"
                        />
                        <div className="p-1.5 bg-surface text-[10px] text-on-surface font-medium truncate">
                          {img.caption || translateEnum('common.enums.imageTypes', img.imageType, img.imageType)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-outline-variant/30 text-center text-xs text-on-surface-variant">
              {t('ownerDashboard.selectFieldForTelemetry', 'Select a field from the left panel to inspect detailed telemetry and farmer submissions.')}
            </div>
          )}
        </div>
      </div>

      {/* Add / Edit Farm Modal */}
      {showAddFarmModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest w-full max-w-md p-space-lg rounded-xl shadow-xl flex flex-col gap-space-md border border-outline-variant/30">
            <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
              <h3 className="font-headline-md text-headline-md text-on-surface">{t('ownerDashboard.createNewFarm', 'Create New Farm')}</h3>
              <button
                type="button"
                onClick={() => setShowAddFarmModal(false)}
                className="text-on-surface-variant hover:text-on-surface"
                aria-label={t('accessibility.closeDialog')}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleAddFarm} className="flex flex-col gap-space-sm">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface">{t('settings.farmName')}</label>
                <input
                  type="text"
                  required
                  placeholder={t('ownerDashboard.farmNamePlaceholder', 'Green Valley Farm')}
                  value={farmName}
                  onChange={(e) => setFarmName(e.target.value)}
                  className="w-full bg-surface h-9 px-3 rounded-lg text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface">{t('ownerDashboard.farmLocation', 'Farm Location')}</label>
                <input
                  type="text"
                  placeholder={t('ownerDashboard.farmLocationPlaceholder', 'Salinas Valley, CA')}
                  value={farmLocation}
                  onChange={(e) => setFarmLocation(e.target.value)}
                  className="w-full bg-surface h-9 px-3 rounded-lg text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface">{t('ownerDashboard.totalManagedHectares', 'Total Managed Hectares')}</label>
                <input
                  type="number"
                  value={farmArea}
                  onChange={(e) => setFarmArea(e.target.value)}
                  className="w-full bg-surface h-9 px-3 rounded-lg text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex items-center justify-end gap-space-sm pt-space-xs">
                <button
                  type="button"
                  onClick={() => setShowAddFarmModal(false)}
                  className="px-4 py-2 rounded-lg bg-surface-container text-on-surface text-xs font-semibold"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container"
                >
                  {t('settings.saveFarm')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add / Edit Field Wizard Modal */}
      {showAddFieldWizard && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest w-full max-w-3xl p-space-lg rounded-xl shadow-xl flex flex-col gap-space-md border border-outline-variant/30 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-secondary">add_location_alt</span>
                <h3 className="font-headline-md text-headline-md text-on-surface">
                  {editingField
                    ? t('ownerDashboard.editFieldTitle', 'Edit Field: {name}', { name: editingField.name })
                    : t('ownerDashboard.addFieldGeometryTitle', 'Add Field & Draw Mapbox Geometry')}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setShowAddFieldWizard(false);
                  setEditingField(null);
                }}
                className="text-on-surface-variant hover:text-on-surface"
                aria-label={t('accessibility.closeDialog')}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveField} className="flex flex-col gap-space-md">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface">{t('farm.fieldName')}</label>
                  <input
                    type="text"
                    required
                    placeholder={t('ownerDashboard.fieldNamePlaceholder', 'North Rice Field')}
                    value={fieldName}
                    onChange={(e) => setFieldName(e.target.value)}
                    className="w-full bg-surface h-9 px-3 rounded-lg text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface">{t('farm.cropType')}</label>
                  <select
                    value={fieldCrop}
                    onChange={(e) => setFieldCrop(e.target.value)}
                    className="w-full bg-surface h-9 px-3 rounded-lg text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary"
                  >
                    <option value="Rice">{t('common.enums.crops.rice')}</option>
                    <option value="Maize">{t('common.enums.crops.maize')}</option>
                    <option value="Wheat">{t('common.enums.crops.wheat')}</option>
                    <option value="Potato">{t('common.enums.crops.potato')}</option>
                    <option value="Tomato">{t('common.enums.crops.tomato')}</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface">{t('farm.soilClassification')}</label>
                  <input
                    type="text"
                    value={fieldSoil}
                    onChange={(e) => setFieldSoil(e.target.value)}
                    className="w-full bg-surface h-9 px-3 rounded-lg text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-xs font-semibold text-on-surface">{t('ownerDashboard.areaAcres', 'Area (Acres)')}</label>
                  <input
                    type="number"
                    value={fieldArea}
                    onChange={(e) => setFieldArea(e.target.value)}
                    className="w-full bg-surface h-9 px-3 rounded-lg text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              {/* Mapbox Boundary & Path Drawing Map */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface flex items-center justify-between">
                  <span>{t('ownerDashboard.drawBoundary', 'Draw Field Boundary (Polygon) & Route (Path)')}</span>
                  <span className="text-[11px] text-secondary font-data-mono">{t('ownerDashboard.mapboxDrawActive', 'Mapbox GL Draw Active')}</span>
                </label>
                <AgroMap
                  initialCenter={[
                    Number.isFinite(fieldLng) ? fieldLng : -121.655,
                    Number.isFinite(fieldLat) ? fieldLat : 36.677
                  ]}
                  initialZoom={14}
                  boundary={fieldBoundary}
                  path={fieldPath}
                  readOnly={false}
                  onGeometrySave={(b, p) => {
                    setFieldBoundary(b);
                    setFieldPath(p);
                  }}
                  fieldTitle={t('ownerDashboard.drawMapTitle', 'Draw Polygon Boundary / Path')}
                  height="320px"
                />
              </div>

              <div className="flex items-center justify-end gap-space-sm pt-space-xs border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddFieldWizard(false);
                    setEditingField(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-surface-container text-on-surface text-xs font-semibold"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container"
                >
                  {editingField
                    ? t('ownerDashboard.saveChanges', 'Save Changes')
                    : t('ownerDashboard.saveFieldGeometry', 'Save Field & Geometry')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}



      {/* Delete Field Confirmation Modal (Section 7) */}
      {fieldToDelete && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest w-full max-w-md p-space-lg rounded-xl shadow-xl flex flex-col gap-space-md border border-outline-variant/30">
            <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
              <div className="flex items-center gap-2 text-on-error-container">
                <span className="material-symbols-outlined text-[24px]">delete_forever</span>
                <h3 className="font-headline-md text-headline-md font-bold text-on-surface">{t('ownerDashboard.confirmFieldRemoval', 'Confirm Field Removal')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setFieldToDelete(null)}
                className="text-on-surface-variant hover:text-on-surface"
                aria-label={t('accessibility.closeDialog')}
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-on-surface-variant leading-relaxed">
              {t('validation.removeFieldConfirm', { name: fieldToDelete?.name || '' })}
            </p>
            <p className="text-xs text-on-surface-variant bg-surface p-3 rounded-lg border border-outline-variant/20">
              {t('ownerDashboard.fieldRemovalWarning', 'This field will be deleted from your farm database. Any active worker assignment will be cleared.')}
            </p>

            <div className="flex items-center justify-end gap-space-sm pt-2">
              <button
                type="button"
                onClick={() => setFieldToDelete(null)}
                className="h-9 px-4 rounded-lg bg-surface-container text-on-surface font-semibold text-xs hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={isDeletingField}
                onClick={handleDeleteFieldConfirm}
                className="h-9 px-4 rounded-lg bg-error text-on-error font-semibold text-xs hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">delete</span>
                <span>{isDeletingField ? t('common.loading') : t('ownerDashboard.removeField', 'Remove Field')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rate Farmer Modal */}
      {rateModalOpen && targetFarmerForRate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest w-full max-w-md p-space-lg rounded-xl shadow-2xl flex flex-col gap-space-md border border-outline-variant/30 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[24px] text-amber-500">hotel_class</span>
                <div className="flex flex-col">
                  <h3 className="font-headline-md text-headline-md font-bold text-on-surface">
                    {t('farmerRating.rateTitle', 'Rate & Review Farmer')}
                  </h3>
                  <span className="text-xs text-on-surface-variant font-medium">
                    {targetFarmerForRate.fullName} ({targetFarmerForRate.email})
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRateModalOpen(false)}
                className="text-on-surface-variant hover:text-on-surface text-lg cursor-pointer"
                aria-label={t('accessibility.closeDialog')}
              >
                ✕
              </button>
            </div>

            {ratingModalSuccess && (
              <div className="p-3 bg-secondary-container text-on-secondary-container rounded-lg text-xs font-semibold flex items-center gap-2 border border-secondary/30">
                <span className="material-symbols-outlined text-[18px]">check_circle</span>
                <span>{ratingModalSuccess}</span>
              </div>
            )}

            {ratingModalError && (
              <div className="p-3 bg-error-container text-error rounded-lg text-xs font-semibold flex items-center gap-2 border border-error/30">
                <span className="material-symbols-outlined text-[18px]">error</span>
                <span>{ratingModalError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitRating} className="flex flex-col gap-space-md">
              {/* Star Rating Selector */}
              <div className="flex flex-col gap-1.5 items-center text-center">
                <label className="text-xs font-semibold text-on-surface">
                  {t('farmerRating.selectScore', 'Select Rating Score')}
                </label>
                <div className="flex items-center gap-1 justify-center py-2 px-4 bg-surface rounded-xl border border-outline-variant/20 w-full">
                  {[1, 2, 3, 4, 5].map((star) => {
                    const filled = (ratingHover || ratingScore) >= star;
                    return (
                      <button
                        key={star}
                        type="button"
                        onClick={() => setRatingScore(star)}
                        onMouseEnter={() => setRatingHover(star)}
                        onMouseLeave={() => setRatingHover(0)}
                        className="p-1 text-3xl transition-transform hover:scale-125 cursor-pointer leading-none"
                        aria-label={`${star} Stars`}
                      >
                        <span className={filled ? 'text-amber-500' : 'text-outline-variant/40'}>★</span>
                      </button>
                    );
                  })}
                  <span className="ml-3 font-bold text-sm text-on-surface">
                    {ratingScore} / 5
                  </span>
                </div>
              </div>

              {/* Related Field Parcel */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface">
                  {t('farmerRating.associatedField', 'Associated Field Parcel')}
                </label>
                <select
                  value={ratingFieldId}
                  onChange={(e) => setRatingFieldId(e.target.value)}
                  className="w-full bg-surface h-9 px-3 rounded-lg text-xs border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  <option value="">{t('farmerRating.generalFarmWork', 'General Farm Work / All Fields')}</option>
                  {fields.map((f) => (
                    <option key={f.fieldId || (f as any).id} value={f.fieldId || (f as any).id}>
                      {f.name} ({f.crop})
                    </option>
                  ))}
                </select>
              </div>

              {/* Written Feedback & Comment */}
              <div className="flex flex-col gap-1">
                <label className="text-xs font-semibold text-on-surface">
                  {t('farmerRating.commentLabel', 'Written Comment & Performance Review')} *
                </label>
                <textarea
                  rows={3}
                  required
                  value={ratingFeedback}
                  onChange={(e) => setRatingFeedback(e.target.value)}
                  placeholder={t('farmerRating.commentPlaceholder', 'Write your comment and performance review (e.g. communication, crop care, irrigation execution, work quality)...')}
                  className="w-full bg-surface p-2.5 rounded-lg text-xs border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-space-sm pt-space-xs border-t border-outline-variant/20">
                <button
                  type="button"
                  disabled={isSubmittingRating}
                  onClick={() => setRateModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-surface-container text-on-surface text-xs font-semibold hover:bg-surface-container-high transition-colors"
                >
                  {t('common.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRating}
                  className="px-5 py-2 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-50 cursor-pointer"
                >
                  {isSubmittingRating ? (
                    <>
                      <span className="w-3.5 h-3.5 rounded-full border-2 border-on-primary border-t-transparent animate-spin inline-block" />
                      <span>{t('farmerRating.submittingRating', 'Submitting...')}</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-[16px]">check</span>
                      <span>{t('farmerRating.submitRating', 'Submit Rating')}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Farmer Reviews & Reputation Modal */}
      {reviewsModalOpen && targetFarmerForReviews && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest w-full max-w-lg p-space-lg rounded-xl shadow-2xl flex flex-col gap-space-md border border-outline-variant/30 animate-in fade-in zoom-in-95 max-h-[85vh]">
            <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-bold text-sm shrink-0">
                  {(targetFarmerForReviews.fullName || 'Farmer').charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <h3 className="font-headline-md text-headline-md font-bold text-on-surface">
                    {targetFarmerForReviews.fullName}
                  </h3>
                  <span className="text-xs text-on-surface-variant font-medium">
                    {targetFarmerForReviews.email}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReviewsModalOpen(false)}
                className="text-on-surface-variant hover:text-on-surface text-lg cursor-pointer"
                aria-label={t('accessibility.closeDialog')}
              >
                ✕
              </button>
            </div>

            {/* Score Banner */}
            <div className="flex items-center justify-between p-3.5 bg-surface rounded-xl border border-outline-variant/20">
              <div className="flex flex-col">
                <span className="text-xs text-on-surface-variant font-medium">{t('farmerRating.overallRating', 'Overall Rating')}</span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className="text-amber-500 text-lg leading-none">★</span>
                  <span className="text-lg font-bold text-on-surface">
                    {typeof targetFarmerForReviews.averageRating === 'number' ? targetFarmerForReviews.averageRating.toFixed(1) : '5.0'}
                  </span>
                  <span className="text-xs text-on-surface-variant font-normal">
                    / 5.0
                  </span>
                </div>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-container text-secondary">
                {t('farmerRating.basedOnReviews', '{count} Reviews', { count: formatNumber(farmerReviews.length) })}
              </span>
            </div>

            {/* Reviews List */}
            <div className="flex flex-col gap-3 overflow-y-auto max-h-[45vh] pr-1">
              {reviewsLoading ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2 text-on-surface-variant">
                  <span className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin inline-block" />
                  <span className="text-xs font-medium">{t('common.loading')}</span>
                </div>
              ) : farmerReviews.length === 0 ? (
                <div className="py-8 text-center flex flex-col items-center justify-center gap-2 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[32px] text-outline-variant">rate_review</span>
                  <p className="text-xs font-medium">{t('farmerRating.noReviewsYet', 'No reviews or ratings recorded yet for this farmer.')}</p>
                </div>
              ) : (
                farmerReviews.map((r) => (
                  <div
                    key={r.ratingId || r.id}
                    className="p-3 rounded-lg bg-surface border border-outline-variant/20 flex flex-col gap-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-xs text-on-surface">
                          {r.ownerName || 'Farm Owner'}
                        </span>
                        {r.fieldName && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container text-secondary font-medium">
                            {r.fieldName}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-on-surface-variant">
                        {r.createdAt ? formatDate(r.createdAt) : ''}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 text-amber-500 text-xs">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <span key={i} className={i < r.rating ? 'text-amber-500' : 'text-outline-variant/40'}>
                          ★
                        </span>
                      ))}
                      <span className="ml-1 text-[11px] font-bold text-on-surface">
                        {r.rating}.0
                      </span>
                    </div>

                    {r.feedback && (
                      <p className="text-xs text-on-surface-variant leading-relaxed bg-surface-container-lowest p-2 rounded border border-outline-variant/10">
                        "{r.feedback}"
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-between pt-space-xs border-t border-outline-variant/20">
              {fields.some((f) => getFieldAssignedWorkers(f).some((w) => w.farmerId === targetFarmerForReviews.uid)) ||
              hiredFarmerIds.has(targetFarmerForReviews.uid) ? (
                <button
                  type="button"
                  onClick={() => {
                    setReviewsModalOpen(false);
                    handleOpenRateModal(targetFarmerForReviews);
                  }}
                  className="h-8 px-3 rounded-lg bg-primary text-on-primary text-xs font-semibold hover:bg-primary-container transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                >
                  <span className="material-symbols-outlined text-[15px]">rate_review</span>
                  <span>{t('farmerRating.rateAndCommentFarmer', 'Rate & Comment on Farmer')}</span>
                </button>
              ) : (
                <span className="text-[11px] text-on-surface-variant flex items-center gap-1 italic">
                  <span className="material-symbols-outlined text-[14px] text-primary">info</span>
                  <span>{t('farmerRating.onlyHiredCanRate', 'Only owners who hired this farmer can rate.')}</span>
                </span>
              )}
              <button
                type="button"
                onClick={() => setReviewsModalOpen(false)}
                className="h-8 px-4 rounded-lg bg-surface-container text-on-surface text-xs font-semibold hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                {t('common.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


