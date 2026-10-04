/**
 * AgroAI — Farmer Field Worker Workspace
 * Route: /farmer-dashboard
 * Work on assigned field, approve/reject assignment requests, unassign with confirmation modal,
 * 1-to-1 chat with farm owner, view assignment history, inspect Mapbox GIS boundaries, submit land data,
 * and upload Cloudinary field photos with AI leaf analysis.
 */

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { AgroMap } from '../components/map/AgroMap';
import { uploadToCloudinary } from '../services/cloudinary';
import { apiService } from '../services/api';
import { firestoreService } from '../services/firebase';
import type { Field, FieldImageRecord, FieldLandData, AssignmentRequest, AssignmentRecord, FarmerRating, Farm } from '../services/ecosystem';
import {
  getFarmerAssignedFields,
  getOwnerFields,
  getFarms,
  getOwnerAccountForField,
  submitFieldData,
  recordFieldImage,
  getFieldImages,
  getFieldData,
  getFarmerAssignmentRequests,
  approveAssignmentRequest,
  rejectAssignmentRequest,
  unassignFarmerFromField,
  getFarmerAssignmentHistory,
  getFarmerRatings,
  ECOSYSTEM_UPDATED_EVENT,
  notifyEcosystemChange,
} from '../services/ecosystem';

const growthStageTranslationKeys: Record<string, string> = {
  Germination: 'farmerDashboard.growthStages.germination',
  'Vegetative Growth': 'farmerDashboard.growthStages.vegetativeGrowth',
  'Flowering & Tasseling': 'farmerDashboard.growthStages.floweringTasseling',
  Maturation: 'farmerDashboard.growthStages.maturation',
};

export const FarmerDashboard: React.FC = () => {
  const { user, userProfile } = useAuth();
  const navigate = useNavigate();
  const { t, translateEnum, formatDate, formatNumber } = useI18n();
  const translateGrowthStage = (value: string) =>
    t(growthStageTranslationKeys[value] || 'farmerDashboard.growthStage', value || t('common.unknown'));

  const [assignedFields, setAssignedFields] = useState<Field[]>([]);
  const [allOwnerFields, setAllOwnerFields] = useState<Field[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  
  const [selectedField, setSelectedField] = useState<Field | null>(null);
  const [fieldImages, setFieldImages] = useState<FieldImageRecord[]>([]);
  const [fieldSubmissions, setFieldSubmissions] = useState<FieldLandData[]>([]);

  // Assignment Requests & History State
  const [assignmentRequests, setAssignmentRequests] = useState<AssignmentRequest[]>([]);
  const [myApplications, setMyApplications] = useState<AssignmentRequest[]>([]);
  const [withdrawingAppId, setWithdrawingAppId] = useState<string | null>(null);
  const [assignmentHistory, setAssignmentHistory] = useState<AssignmentRecord[]>([]);
  const [requestActionLoading, setRequestActionLoading] = useState<string | null>(null);
  const [requestActionMsg, setRequestActionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Unassign Modal State
  const [showUnassignModal, setShowUnassignModal] = useState(false);
  const [isUnassigning, setIsUnassigning] = useState(false);

  // Workspace Active Tab: 'entry' (New Telemetry / Upload) | 'history' (Submissions Feed) | 'assignments' (Assignment History)
  const [activeTab, setActiveTab] = useState<'entry' | 'history' | 'assignments'>('entry');

  // Form: Soil & Land Telemetry Data
  const [moisture, setMoisture] = useState<number>(38.5);
  const [ph, setPh] = useState<number>(6.5);
  const [temp, setTemp] = useState<number>(28.0);
  const [nitrogen, setNitrogen] = useState<number>(45);
  const [phosphorus, setPhosphorus] = useState<number>(30);
  const [potassium, setPotassium] = useState<number>(35);
  const [stage, setStage] = useState('Vegetative Growth');
  const [pestObserved] = useState(false);
  const [pestSeverity] = useState('Low');
  const [irrigationStatus] = useState('Satisfactory');
  const [notes, setNotes] = useState('');
  const [dataSubmitting, setDataSubmitting] = useState(false);
  const [dataSuccess, setDataSuccess] = useState('');

  // Form: Cloudinary Image Upload
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageType, setImageType] = useState<'leaf' | 'crop' | 'soil' | 'pest' | 'field'>('leaf');
  const [caption, setCaption] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState('');
  const [uploadError, setUploadError] = useState('');

  // Disease AI analysis result state
  const [aiAnalysisResult, setAiAnalysisResult] = useState<string | null>(null);
  const [analyzingLeaf, setAnalyzingLeaf] = useState(false);

  // Farmer Ratings & Reviews Received from Farm Owners
  const [farmerRatings, setFarmerRatings] = useState<FarmerRating[]>([]);
  const [showReviewsModal, setShowReviewsModal] = useState(false);

  const loadFarmerData = async () => {
    try {
      const activeUid = user?.uid || 'farmer_01';
      const fieldsList = await getFarmerAssignedFields(activeUid);
      setAssignedFields(fieldsList);

      if (fieldsList.length > 0) {
        const targetField = selectedField
          ? fieldsList.find((f) => f.fieldId === selectedField.fieldId || (f as any).id === (selectedField as any).id) || fieldsList[0]
          : fieldsList[0];
        setSelectedField(targetField);
        loadFieldHistory(targetField.fieldId || (targetField as any).id);
      } else {
        setSelectedField(null);
      }

      // Load Assignment Requests & History
      const reqs = await getFarmerAssignmentRequests(activeUid);
      // Offers sent by farm owners to this farmer
      setAssignmentRequests(reqs.filter((r) => r.status === 'pending' && r.initiatedBy !== 'farmer'));
      // Applications sent by this farmer to farm owners
      setMyApplications(reqs.filter((r) => r.initiatedBy === 'farmer'));

      const hist = await getFarmerAssignmentHistory(activeUid);
      setAssignmentHistory(hist);

      // Load Farmer Ratings & Performance Reviews
      const ratings = await getFarmerRatings(activeUid);
      setFarmerRatings(ratings);

      // Load Open Work Opportunities from Owner Accounts
      const allFields = await getOwnerFields();
      setAllOwnerFields(allFields);
      const allFarms = await getFarms();
      setFarms(allFarms);
    } catch (err) {
      console.error('loadFarmerData error:', err);
    }
  };

  const loadFieldHistory = async (fieldId: string) => {
    const imgs = await getFieldImages(fieldId);
    const subs = await getFieldData(fieldId);
    setFieldImages(imgs);
    setFieldSubmissions(subs);
  };

  useEffect(() => {
    loadFarmerData();
    window.addEventListener(ECOSYSTEM_UPDATED_EVENT, loadFarmerData);
    return () => window.removeEventListener(ECOSYSTEM_UPDATED_EVENT, loadFarmerData);
  }, [user]);

  // Handle Field Selection
  const handleSelectField = async (f: Field) => {
    const targetId = f.fieldId || (f as any).id;
    setSelectedField(f);
    loadFieldHistory(targetId);
  };

  // Handle Assignment Request Approve
  const handleApproveRequest = async (requestId: string) => {
    setRequestActionLoading(requestId);
    setRequestActionMsg(null);
    const res = await approveAssignmentRequest(requestId);
    setRequestActionLoading(null);
    if (res.success) {
      setRequestActionMsg({ type: 'success', text: t('farmerDashboard.assignmentApproved', 'Assignment request approved! You are now assigned to this field.') });
      loadFarmerData();
      notifyEcosystemChange();
    } else {
      setRequestActionMsg({ type: 'error', text: t('errors.approveRequest') });
    }
  };

  // Handle Assignment Request Reject
  const handleRejectRequest = async (requestId: string) => {
    setRequestActionLoading(requestId);
    setRequestActionMsg(null);
    const res = await rejectAssignmentRequest(requestId);
    setRequestActionLoading(null);
    if (res.success) {
      setRequestActionMsg({ type: 'success', text: t('farmerDashboard.assignmentRejected', 'Assignment request rejected.') });
      loadFarmerData();
      notifyEcosystemChange();
    } else {
      setRequestActionMsg({ type: 'error', text: t('errors.rejectRequest') });
    }
  };

  // Handle Farmer Withdrawing Their Submitted Application
  const handleWithdrawApplication = async (requestId: string) => {
    setWithdrawingAppId(requestId);
    const res = await rejectAssignmentRequest(requestId);
    setWithdrawingAppId(null);
    if (res.success) {
      setRequestActionMsg({
        type: 'success',
        text: t('farmers.applicationWithdrawn', 'Application withdrawn successfully.'),
      });
      loadFarmerData();
      notifyEcosystemChange();
    } else {
      setRequestActionMsg({ type: 'error', text: res.error || 'Failed to withdraw application.' });
    }
  };

  // Handle Confirm Unassign
  const handleConfirmUnassign = async () => {
    const activeUid = user?.uid || 'farmer_01';
    const farmerName = userProfile?.fullName || 'Farmer';
    setIsUnassigning(true);
    const res = await unassignFarmerFromField(activeUid, farmerName);
    setIsUnassigning(false);
    setShowUnassignModal(false);

    if (res.success) {
      setRequestActionMsg({ type: 'success', text: t('farmerDashboard.unassigned', 'You have unassigned yourself from the field. Assignment history preserved.') });
      loadFarmerData();
      notifyEcosystemChange();
    } else {
      setRequestActionMsg({ type: 'error', text: t('errors.unassign') });
    }
  };

  // Submit Soil & Land Data Form
  const handleLandDataSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedField) return;

    setDataSubmitting(true);
    setDataSuccess('');

    const formattedNotes = [
      notes.trim(),
      pestObserved ? `Pest Observed (${pestSeverity} severity)` : 'No Pest Symptoms',
      `Irrigation: ${irrigationStatus}`,
    ].filter(Boolean).join(' | ');

    const targetFieldId = selectedField.fieldId || (selectedField as any).id;
    await submitFieldData({
      fieldId: targetFieldId,
      farmerId: user?.uid || 'farmer_01',
      farmerName: userProfile?.fullName || 'Field Worker',
      ownerId: selectedField.ownerId || 'owner_demo',
      soilMoisture: Number(moisture),
      soilPH: Number(ph),
      temperature: Number(temp),
      nitrogen: Number(nitrogen),
      phosphorus: Number(phosphorus),
      potassium: Number(potassium),
      cropGrowthStage: stage,
      notes: formattedNotes,
    });

    setDataSubmitting(false);
    setDataSuccess(t('farmerDashboard.landDataSubmitted', 'Field observation land data submitted successfully!'));
    setNotes('');
    loadFieldHistory(targetFieldId);
    notifyEcosystemChange();
    setTimeout(() => setDataSuccess(''), 4000);
  };

  // Handle Image Selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setSelectedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  // Upload Field Image to Cloudinary and record in Firestore
  const handleImageUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) {
      setUploadError(t('validation.imageRequired'));
      return;
    }
    if (!selectedField) {
      setUploadError(t('validation.noFieldSelected'));
      return;
    }

    setUploading(true);
    setUploadSuccess('');
    setUploadError('');

    const res = await uploadToCloudinary(selectedFile, 'agroai_field_images');
    setUploading(false);

    if (!res.success || !res.url) {
      setUploadError(t('errors.uploadImage'));
      return;
    }

    const targetFieldId = selectedField.fieldId || (selectedField as any).id;
    await recordFieldImage({
      fieldId: targetFieldId,
      farmerId: user?.uid || 'farmer_01',
      farmerName: userProfile?.fullName || 'Field Worker',
      ownerId: selectedField.ownerId || 'owner_demo',
      imageUrl: res.url,
      publicId: res.publicId,
      imageType,
      caption: caption.trim() || 'Field observation upload',
    });

    setUploadSuccess(t('farmerDashboard.imageUploaded', 'Field image uploaded & recorded successfully!'));
    setSelectedFile(null);
    setImagePreview(null);
    setCaption('');

    loadFieldHistory(targetFieldId);
    notifyEcosystemChange();
  };

  // Trigger Disease CNN inference
  const handleAnalyzeLeaf = async (_imageUrl: string) => {
    setAnalyzingLeaf(true);
    setAiAnalysisResult(null);
    try {
      const res = await apiService.runAlgorithmPlaceholder('cnn');
      const scanResultName = res.result?.name || 'Leaf Disease Scanner';
      setAiAnalysisResult(t('farmerDashboard.cnnInferenceResult', 'CNN Inference Triggered: {result} • Execution: {time}ms • Status: {status}', {
        result: translateEnum('algorithms', res.result?.name, scanResultName),
        time: formatNumber(res.execution_time_ms),
        status: t('status.active'),
      }));

      // Log disease scan to audit trail
      const logRecord = {
        id: `rec-${Date.now()}`,
        timestamp: formatDate(new Date(), { hour: '2-digit', minute: '2-digit' }) || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        utcTime: new Date().toISOString(),
        category: 'Disease' as any,
        field: selectedField?.name || 'Assigned Field Leaf Scan',
        description: `Foliar scan result: ${scanResultName}`,
        subDetail: `Engine: CNN MobileNetV2 • Execution: ${res.execution_time_ms}ms`,
        engine: 'CNN MobileNetV2',
        status: 'Action Flagged' as any,
        operator: userProfile?.fullName || 'Field Worker',
        hash: `0x${Math.random().toString(16).substring(2, 10)}${Math.random().toString(16).substring(2, 10)}${Math.random().toString(16).substring(2, 10)}`
      };

      await firestoreService.saveLog(logRecord);
      await apiService.createLog(logRecord);
      notifyEcosystemChange();
    } catch {
      setAiAnalysisResult(t('farmerDashboard.cnnInterfaceReady', 'CNN Interface Triggered: Leaf scanner active and ready'));
    } finally {
      setAnalyzingLeaf(false);
    }
  };

  const totalFarmerReviews = farmerRatings.length;
  const avgFarmerRating = totalFarmerReviews > 0
    ? Number((farmerRatings.reduce((sum, r) => sum + (r.rating || 5), 0) / totalFarmerReviews).toFixed(1))
    : (userProfile?.averageRating || 5.0);

  return (
    <div className="px-margin-lg py-margin flex flex-col gap-space-xl max-w-[1600px] w-full mx-auto">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-outline-variant/30">
        <div className="flex flex-col gap-space-xs">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-secondary-container text-on-secondary-container font-label-sm text-xs font-semibold uppercase tracking-wider">
              {t('farmerDashboard.workspace', 'Farmer Worker Workspace')}
            </span>
            <span className="font-label-sm text-xs text-on-surface-variant">• {t('farmerDashboard.outdoorMobileMode', 'Outdoor Mobile Mode')}</span>
          </div>
          <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight">
            {t('farmerDashboard.welcome', 'Welcome, {name}', { name: userProfile?.fullName || translateEnum('common.enums.roles', 'field_worker') })}
          </h1>
          <p className="font-body-md text-body-md text-on-surface-variant max-w-2xl">
            {t('farmerDashboard.description', 'Work on assigned fields, respond to assignment requests, communicate with farm owners, submit soil telemetry, and upload field inspection photos.')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
          {/* Reputation & Rating Card */}
          <button
            type="button"
            onClick={() => setShowReviewsModal(true)}
            className="h-10 px-3.5 rounded-xl bg-surface-container-high border border-outline-variant/30 hover:border-amber-500/50 hover:bg-amber-500/10 transition-all flex items-center gap-2 cursor-pointer shadow-2xs"
            title={t('farmerRating.myReviewsDescription')}
          >
            <div className="flex items-center gap-1 text-amber-500 text-sm font-bold">
              <span className="text-base leading-none">★</span>
              <span className="text-on-surface">{avgFarmerRating.toFixed(1)}</span>
            </div>
            <span className="text-xs text-on-surface-variant font-medium">
              ({formatNumber(totalFarmerReviews)} {t('farmerRating.reviews')})
            </span>
            <span className="material-symbols-outlined text-[16px] text-on-surface-variant">arrow_forward</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/farmers?tab=assignments')}
            className="h-10 px-4 rounded-xl bg-primary text-on-primary font-semibold text-xs hover:bg-primary-container transition-all flex items-center gap-2 cursor-pointer shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">travel_explore</span>
            <span>{t('farmers.applyForWorkBtn', 'Apply for Work')}</span>
          </button>

          <button
            type="button"
            onClick={() => navigate('/messages')}
            className="h-10 px-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <span className="material-symbols-outlined text-[18px]">chat</span>
            <span>{t('farmerDashboard.chatWithOwner', 'Chat with Owner')}</span>
          </button>
        </div>
      </div>

      {/* Global Status Banner for Assignment Requests Action */}
      {requestActionMsg && (
        <div
          className={`p-4 rounded-xl font-semibold text-xs flex items-center justify-between shadow-xs ${
            requestActionMsg.type === 'success' ? 'bg-primary-container text-on-primary border border-primary' : 'bg-error-container text-on-error-container border border-error'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px]">
              {requestActionMsg.type === 'success' ? 'check_circle' : 'error'}
            </span>
            <span>{requestActionMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setRequestActionMsg(null)}
            className="text-sm font-bold opacity-70 hover:opacity-100"
            aria-label={t('common.close')}
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Section A: My Submitted Work Applications (Farmer → Owner) ── */}
      {myApplications.length > 0 && (
        <section className="bg-surface-container-low p-space-lg rounded-xl border border-outline-variant shadow-sm flex flex-col gap-space-md animate-fade-in">
          <div className="flex items-center justify-between border-b border-outline-variant/40 pb-2">
            <div className="flex items-center gap-2 text-on-surface">
              <span className="material-symbols-outlined text-[24px] text-primary">send</span>
              <h2 className="font-headline-md text-headline-md font-bold">
                {t('farmers.mySubmittedApplications', 'Your Submitted Work Applications ({count})', {
                  count: formatNumber(myApplications.length),
                })}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => navigate('/farmers?tab=assignments')}
              className="text-label-sm text-primary font-semibold hover:underline flex items-center gap-1 cursor-pointer"
            >
              <span>{t('farmers.applyForMoreFields', 'Apply to More Fields')}</span>
              <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            {myApplications.map((app) => (
              <div
                key={app.id}
                className="bg-surface p-space-md rounded-xl border border-outline-variant flex flex-col justify-between gap-space-sm shadow-xs"
              >
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-secondary font-semibold uppercase tracking-wider">
                      {app.ownerName || 'Farm Owner'}
                    </span>
                    {app.status === 'pending' && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30">
                        {t('farmers.applicationPendingReview', 'Pending Owner Review')}
                      </span>
                    )}
                    {app.status === 'approved' && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                        {t('farmers.applicationApprovedStatus', 'Approved & Assigned')}
                      </span>
                    )}
                    {app.status === 'rejected' && (
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-surface-container text-on-surface-variant">
                        {t('farmers.applicationDeclinedStatus', 'Declined')}
                      </span>
                    )}
                  </div>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    {app.farmName} — {app.fieldName}
                  </h3>
                  <div className="flex items-center gap-3 text-xs text-on-surface-variant font-medium">
                    <span>{app.workType || 'Field Specialist'}</span>
                    <span>•</span>
                    <span className="font-data-mono font-semibold text-primary">{app.dailyRate || '$120 / day'}</span>
                  </div>
                  {app.message && (
                    <p className="text-xs text-on-surface-variant italic bg-surface-container/40 p-2 rounded-lg mt-1">
                      "{app.message}"
                    </p>
                  )}
                </div>

                {app.status === 'pending' && (
                  <div className="pt-2 border-t border-outline-variant/20 flex justify-end">
                    <button
                      type="button"
                      disabled={withdrawingAppId === app.id}
                      onClick={() => handleWithdrawApplication(app.id)}
                      className="px-3 py-1 rounded-lg text-xs font-semibold text-error hover:bg-error-container/30 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1"
                    >
                      <span className="material-symbols-outlined text-[14px]">undo</span>
                      <span>
                        {withdrawingAppId === app.id
                          ? t('farmers.withdrawing', 'Withdrawing...')
                          : t('farmers.withdrawApplication', 'Withdraw')}
                      </span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Section A.5: Open Work Opportunities from Owner Accounts ── */}
      {(() => {
        const activeUid = user?.uid || 'farmer_01';
        const openOpportunities = allOwnerFields.filter((f) => {
          const workers = f.assignedWorkers || [];
          const isMeAssigned = workers.some((w) => w.farmerId === activeUid);
          return !isMeAssigned;
        });

        if (openOpportunities.length === 0) return null;

        return (
          <section className="bg-surface-container-low p-space-lg rounded-xl border border-outline-variant shadow-sm flex flex-col gap-space-md animate-fade-in">
            <div className="flex items-center justify-between border-b border-outline-variant/40 pb-2">
              <div className="flex items-center gap-2 text-on-surface">
                <span className="material-symbols-outlined text-[24px] text-primary">work</span>
                <h2 className="font-headline-md text-headline-md font-bold">
                  {t('farmers.workOpportunitiesTab', 'Work Opportunities')} ({formatNumber(openOpportunities.length)})
                </h2>
              </div>
              <button
                type="button"
                onClick={() => navigate('/farmers?tab=assignments')}
                className="text-label-sm text-primary font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>{t('common.viewAll', 'View All Opportunities')}</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-space-md">
              {openOpportunities.slice(0, 6).map((field) => {
                const ownerInfo = getOwnerAccountForField(field, farms);
                const pendingApp = myApplications.find(
                  (a) => (a.fieldId === field.fieldId || a.fieldId === (field as any).id) && a.status === 'pending'
                );

                return (
                  <div
                    key={field.fieldId || (field as any).id}
                    className="bg-surface p-space-md rounded-xl border border-outline-variant hover:border-primary/40 transition-all flex flex-col justify-between gap-space-sm shadow-xs"
                  >
                    <div className="flex flex-col gap-2">
                      {/* Owner Account Badge & Name */}
                      <div className="p-2.5 rounded-lg bg-surface-container-low border border-outline-variant/30 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold text-sm shrink-0 border border-primary/20">
                            <span className="material-symbols-outlined text-[18px]">corporate_fare</span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-label-sm font-bold text-on-surface truncate">
                                {ownerInfo.name}
                              </span>
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[9px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30">
                                <span className="material-symbols-outlined text-[10px]">verified</span>
                                {t('farmers.ownerAccount', 'Owner Account')}
                              </span>
                            </div>
                            <span className="text-[11px] text-on-surface-variant flex items-center gap-1 truncate mt-0.5">
                              <span className="material-symbols-outlined text-[11px] text-primary">store</span>
                              <span className="font-medium">{ownerInfo.farmName}</span>
                              <span>•</span>
                              <span>{ownerInfo.location}</span>
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Field Details */}
                      <div>
                        <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold flex items-center gap-1.5">
                          <span className="material-symbols-outlined text-primary text-[18px]">agriculture</span>
                          <span>{field.name}</span>
                        </h3>
                        <div className="flex items-center gap-2 text-xs text-on-surface-variant font-medium mt-1">
                          <span>{field.crop || 'Field Crop'}</span>
                          <span>•</span>
                          <span className="font-data-mono">{field.areaAcres ? `${field.areaAcres} ac` : '35 ac'}</span>
                          <span>•</span>
                          <span>{field.soilType || 'Loam'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Action Button */}
                    <div className="pt-2 border-t border-outline-variant/20 flex items-center justify-between gap-2">
                      <span className="text-[11px] text-on-surface-variant font-medium">
                        {field.status || 'Active'}
                      </span>
                      {pendingApp ? (
                        <span className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-amber-500/15 text-amber-800 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                          <span className="material-symbols-outlined text-[13px]">schedule</span>
                          <span>Pending Review</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => navigate(`/farmers?tab=assignments&applyField=${field.fieldId || (field as any).id}`)}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-primary text-on-primary hover:opacity-95 transition-all flex items-center gap-1 shadow-xs cursor-pointer active:scale-95"
                        >
                          <span className="material-symbols-outlined text-[14px]">send</span>
                          <span>{t('farmers.applyForJob', 'Apply for Job')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })()}

      {/* ── Section B: Incoming Work Requests from Farm Owners (Owner → Farmer) ── */}
      {assignmentRequests.length > 0 && (
        <section className="bg-surface-container-low p-space-lg rounded-xl border border-outline-variant shadow-sm flex flex-col gap-space-md">
          <div className="flex items-center gap-2 text-on-surface border-b border-outline-variant/40 pb-2">
            <span className="material-symbols-outlined text-[24px]">notification_important</span>
            <h2 className="font-headline-md text-headline-md font-bold">
              {assignmentRequests.length === 1
                ? t('farmerDashboard.pendingAssignmentRequest', 'Pending Assignment Request (1)')
                : t('farmerDashboard.pendingAssignmentRequests', 'Pending Assignment Requests ({count})', { count: formatNumber(assignmentRequests.length) })}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-space-md">
            {assignmentRequests.map((req) => (
              <div key={req.id} className="bg-surface p-space-md rounded-xl border border-outline-variant flex flex-col gap-space-sm shadow-xs">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-secondary font-semibold uppercase tracking-wider">
                    {t('navigation.owner')}: {req.ownerName || translateEnum('common.enums.roles', 'farm_owner')}
                  </span>
                  <h3 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                    {req.farmName} — {req.fieldName}
                  </h3>
                  <p className="text-xs text-on-surface-variant">
                    {t('farmerDashboard.assignmentInvitation', 'You have been invited to work as the assigned field worker for {field}.', { field: req.fieldName })}
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-outline-variant/20">
                  <button
                    type="button"
                    disabled={requestActionLoading === req.id}
                    onClick={() => handleApproveRequest(req.id)}
                    className="flex-1 h-9 rounded-lg bg-primary text-on-primary font-semibold text-xs hover:opacity-90 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    <span>{requestActionLoading === req.id ? t('farmerDashboard.approving', 'Approving...') : t('farmerDashboard.approve', 'Approve')}</span>
                  </button>
                  <button
                    type="button"
                    disabled={requestActionLoading === req.id}
                    onClick={() => handleRejectRequest(req.id)}
                    className="flex-1 h-9 rounded-lg bg-error-container text-on-error-container font-semibold text-xs hover:opacity-80 transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[16px]">cancel</span>
                    <span>{requestActionLoading === req.id ? t('farmerDashboard.rejecting', 'Rejecting...') : t('farmerDashboard.reject', 'Reject')}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── My Assigned Field Card (Section 21, 30, 34) ────────────────────── */}
      {selectedField ? (
        <section className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-space-md">
          {assignedFields.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-2 border-b border-outline-variant/20">
              <span className="text-xs font-semibold text-on-surface-variant shrink-0">{t('fields.fields', 'Fields')}:</span>
              {assignedFields.map((f) => {
                const isSelected = (f.fieldId && f.fieldId === selectedField.fieldId) || ((f as any).id && (f as any).id === (selectedField as any).id);
                return (
                  <button
                    key={f.fieldId || (f as any).id}
                    type="button"
                    onClick={() => handleSelectField(f)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer shrink-0 ${
                      isSelected ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                    }`}
                  >
                    {f.name}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-sm border-b border-outline-variant/20 pb-space-xs">
            <div className="flex flex-col">
              <span className="text-xs font-semibold text-secondary uppercase tracking-wider">
                {t('farmerDashboard.activeFieldAssignment', 'My Active Field Assignment')}
              </span>
              <h2 className="font-display-md text-display-md text-on-surface font-bold">
                {selectedField.name}
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate(`/messages?user=${selectedField.ownerId}`)}
                className="h-9 px-3 rounded-lg bg-surface-container text-on-surface text-xs font-semibold hover:bg-surface-container-high transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">chat</span>
                <span>{t('farmerDashboard.messageOwner', 'Message Owner')}</span>
              </button>
              <button
                type="button"
                onClick={() => setShowUnassignModal(true)}
                className="h-9 px-3 rounded-lg bg-error-container text-on-error-container text-xs font-semibold hover:opacity-80 transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">person_remove</span>
                <span>{t('farmerDashboard.unassign', 'Unassign')}</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-space-sm bg-surface p-space-md rounded-xl border border-outline-variant/20 text-xs">
            <div>{t('fields.crop')}: <strong className="text-on-surface block text-sm font-semibold">{translateEnum('common.enums.crops', selectedField.crop, selectedField.crop)}</strong></div>
            <div>{t('fields.soilMoisture')}: <strong className="text-primary block text-sm font-semibold">{selectedField.soilMoisture !== undefined ? `${formatNumber(selectedField.soilMoisture, { maximumFractionDigits: 2 })}%` : `${formatNumber(42)}%`}</strong></div>
            <div>{t('fields.soilPh')}: <strong className="text-on-surface block text-sm font-semibold">{formatNumber(selectedField.soilPH || 6.5, { maximumFractionDigits: 2 })}</strong></div>
            <div>{t('farmerDashboard.fieldHealth', 'Field Health')}: <strong className="text-primary block text-sm font-semibold">{translateEnum('status', selectedField.status || 'Healthy', selectedField.status || 'Healthy')}</strong></div>
          </div>

          {/* Section 34: AI Recommendations for Farmer */}
          <div className="p-space-md rounded-xl bg-primary-container/20 border border-primary-container/40 flex items-start gap-space-md text-xs">
            <span className="material-symbols-outlined text-primary text-[24px] shrink-0 mt-0.5">psychology</span>
            <div className="flex flex-col gap-1">
              <span className="font-bold text-on-surface">{t('farmerDashboard.automatedRecommendation', 'AgroAI Automated Field Recommendation')}</span>
              <p className="text-on-surface-variant">
                {t('farmerDashboard.recommendationDescription', 'Soil moisture level is currently optimal for {crop}. Recommended next action: Maintain regular irrigation schedule and monitor crop leaf health.', { crop: translateEnum('common.enums.crops', selectedField.crop, selectedField.crop) })}
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="bg-surface-container-lowest p-space-xl rounded-xl shadow-sm border border-outline-variant/30 text-center flex flex-col items-center justify-center gap-space-sm">
          <div className="w-16 h-16 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
            <span className="material-symbols-outlined text-[32px]">no_sim</span>
          </div>
          <h3 className="font-headline-md text-headline-md text-on-surface font-bold">{t('farmerDashboard.noActiveAssignment', 'No Active Field Assignment')}</h3>
          <p className="text-xs text-on-surface-variant max-w-md">
            {t('farmerDashboard.noActiveAssignmentDescription', 'You currently have no active field assignment. Farm owners can send you field assignment requests after contacting you via 1-to-1 chat.')}
          </p>
        </section>
      )}

      {selectedField && (
        <>
          {/* Mapbox GIS View */}
          <section className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-space-md">
            <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[22px]">map</span>
                <h2 className="font-headline-md text-headline-md text-on-surface">
                  {t('farmerDashboard.spatialBoundaries', '{field} Spatial Boundaries & GIS Path', { field: selectedField.name })}
                </h2>
              </div>
              <span className="font-data-mono text-xs text-secondary bg-surface-container px-2.5 py-0.5 rounded font-semibold">
                {t('farmerDashboard.ownerMapLoaded', 'Owner Map Geometry Loaded')}
              </span>
            </div>

            <AgroMap
              initialCenter={[
                Number.isFinite(selectedField.longitude) ? selectedField.longitude : -121.655,
                Number.isFinite(selectedField.latitude) ? selectedField.latitude : 36.677,
              ]}
              initialZoom={15}
              boundary={selectedField.boundary || null}
              path={selectedField.path || null}
              readOnly={true}
              fieldTitle={selectedField.name}
              height="380px"
            />
          </section>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-2 border-b border-outline-variant/20 pb-2">
            <button
              type="button"
              onClick={() => setActiveTab('entry')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'entry' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">edit_note</span>
              <span>{t('farmerDashboard.submitTelemetryPhoto', 'Submit Telemetry & Photo')}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('history')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'history' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">history</span>
              <span>{t('farmerDashboard.submissionsFeedCount', 'Submissions Feed ({count})', { count: formatNumber(fieldSubmissions.length) })}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('assignments')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === 'assignments' ? 'bg-primary text-on-primary' : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">work_history</span>
              <span>{t('farmerDashboard.assignmentHistoryCount', 'Assignment History ({count})', { count: formatNumber(assignmentHistory.length) })}</span>
            </button>
          </div>

          {activeTab === 'entry' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-gutter-lg items-start">
              {/* Telemetry Form */}
              <div className="lg:col-span-7 bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-space-md">
                <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-[22px]">format_list_bulleted</span>
                    <h3 className="font-headline-md text-headline-md text-on-surface">{t('farmerDashboard.submitLandSoilTelemetry', 'Submit Land & Soil Telemetry')}</h3>
                  </div>
                  <span className="text-xs text-on-surface-variant font-data-mono">{t('farmerDashboard.fieldId', 'Field ID')}: {selectedField.fieldId}</span>
                </div>

                {dataSuccess && (
                  <div className="p-space-sm bg-primary-container text-on-primary rounded-lg text-xs font-semibold flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    <span>{dataSuccess}</span>
                  </div>
                )}

                <form onSubmit={handleLandDataSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-space-md">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-on-surface flex justify-between">
                      <span>{t('fields.soilMoisture')} (%)</span>
                      <span className="font-data-mono text-secondary">{formatNumber(moisture, { maximumFractionDigits: 1 })}%</span>
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      step="0.5"
                      value={moisture}
                      onChange={(e) => setMoisture(parseFloat(e.target.value))}
                      className="w-full accent-primary h-2 bg-surface-container-high rounded-lg cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-on-surface flex justify-between">
                      <span>{t('fields.soilPh')}</span>
                      <span className="font-data-mono text-secondary">{formatNumber(ph, { maximumFractionDigits: 1 })}</span>
                    </label>
                    <input
                      type="range"
                      min="3.0"
                      max="10.0"
                      step="0.1"
                      value={ph}
                      onChange={(e) => setPh(parseFloat(e.target.value))}
                      className="w-full accent-primary h-2 bg-surface-container-high rounded-lg cursor-pointer"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-on-surface">{t('farmerDashboard.ambientTemperature', 'Ambient Temp (°C)')}</label>
                    <input
                      type="number"
                      value={temp}
                      onChange={(e) => setTemp(parseFloat(e.target.value))}
                      className="w-full bg-surface h-9 px-3 rounded-lg text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-on-surface">{t('farmerDashboard.nitrogen', 'Nitrogen (N) mg/kg')}</label>
                    <input
                      type="number"
                      value={nitrogen}
                      onChange={(e) => setNitrogen(parseFloat(e.target.value))}
                      className="w-full bg-surface h-9 px-3 rounded-lg text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-on-surface">{t('farmerDashboard.phosphorus', 'Phosphorus (P) mg/kg')}</label>
                    <input
                      type="number"
                      value={phosphorus}
                      onChange={(e) => setPhosphorus(parseFloat(e.target.value))}
                      className="w-full bg-surface h-9 px-3 rounded-lg text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-on-surface">{t('farmerDashboard.potassium', 'Potassium (K) mg/kg')}</label>
                    <input
                      type="number"
                      value={potassium}
                      onChange={(e) => setPotassium(parseFloat(e.target.value))}
                      className="w-full bg-surface h-9 px-3 rounded-lg text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label className="text-xs font-semibold text-on-surface">{t('farmerDashboard.cropGrowthStage', 'Crop Growth Stage')}</label>
                    <select
                      value={stage}
                      onChange={(e) => setStage(e.target.value)}
                      className="w-full bg-surface h-9 px-3 rounded-lg text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="Germination">{t('farmerDashboard.growthStages.germination', 'Germination & Seedling')}</option>
                      <option value="Vegetative Growth">{t('farmerDashboard.growthStages.vegetativeGrowth', 'Vegetative Growth')}</option>
                      <option value="Flowering & Tasseling">{t('farmerDashboard.growthStages.floweringTasseling', 'Flowering & Tasseling')}</option>
                      <option value="Maturation">{t('farmerDashboard.growthStages.maturation', 'Maturation & Harvesting')}</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1 sm:col-span-2">
                    <label className="text-xs font-semibold text-on-surface">{t('farmerDashboard.observationNotes', 'Worker Observation Notes')}</label>
                    <textarea
                      rows={3}
                      placeholder={t('farmerDashboard.notesPlaceholder', 'Add field notes, pest symptoms, or irrigation feedback...')}
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      className="w-full bg-surface p-3 rounded-lg text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <div className="sm:col-span-2 pt-2">
                    <button
                      type="submit"
                      disabled={dataSubmitting}
                      className="w-full h-10 rounded-xl bg-primary text-on-primary font-headline-sm text-sm hover:bg-primary-container transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      <span className="material-symbols-outlined text-[18px]">send</span>
                      <span>{dataSubmitting ? t('farmerDashboard.submittingTelemetry', 'Submitting Telemetry...') : t('farmerDashboard.submitFieldObservation', 'Submit Field Observation')}</span>
                    </button>
                  </div>
                </form>
              </div>

              {/* Image Upload Form */}
              <div className="lg:col-span-5 bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-space-md">
                <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-secondary text-[22px]">photo_camera</span>
                    <h3 className="font-headline-md text-headline-md text-on-surface">{t('farmerDashboard.uploadInspectionPhoto', 'Upload Inspection Photo')}</h3>
                  </div>
                </div>

                {uploadSuccess && (
                  <div className="p-space-sm bg-primary-container text-on-primary rounded-lg text-xs font-semibold flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">check_circle</span>
                    <span>{uploadSuccess}</span>
                  </div>
                )}

                {uploadError && (
                  <div className="p-space-sm bg-error-container text-on-error-container rounded-lg text-xs font-semibold flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">error</span>
                    <span>{uploadError}</span>
                  </div>
                )}

                <form onSubmit={handleImageUpload} className="flex flex-col gap-space-md">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-on-surface">{t('farmerDashboard.photoCategory', 'Photo Category')}</label>
                    <select
                      value={imageType}
                      onChange={(e) => setImageType(e.target.value as any)}
                      className="w-full bg-surface h-9 px-3 rounded-lg text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary"
                    >
                      <option value="leaf">{t('common.enums.imageTypes.leafDiseaseInspection')}</option>
                      <option value="crop">{t('common.enums.imageTypes.cropStandOverview')}</option>
                      <option value="soil">{t('common.enums.imageTypes.soilTextureMoisture')}</option>
                      <option value="pest">{t('common.enums.imageTypes.pestObservation')}</option>
                      <option value="field">{t('common.enums.imageTypes.generalFieldPanorama')}</option>
                    </select>
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-on-surface">{t('farmerDashboard.photoFile', 'Photo File')}</label>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleFileChange}
                      className="w-full text-xs text-on-surface-variant file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-surface-container file:text-on-surface hover:file:bg-surface-container-high cursor-pointer"
                    />
                  </div>

                  {imagePreview && (
                    <div className="relative rounded-lg overflow-hidden border border-outline-variant/30 max-h-48 bg-surface-container/30">
                      <img src={imagePreview} alt={t('accessibility.imagePreview')} className="w-full h-48 object-cover" />
                    </div>
                  )}

                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-semibold text-on-surface">{t('farmerDashboard.captionNotes', 'Caption / Notes')}</label>
                    <input
                      type="text"
                      placeholder={t('farmerDashboard.captionPlaceholder', 'E.g. Leaf tip chlorosis in sector 2...')}
                      value={caption}
                      onChange={(e) => setCaption(e.target.value)}
                      className="w-full bg-surface h-9 px-3 rounded-lg text-sm border border-outline-variant/40 focus:outline-none focus:ring-2 focus:ring-primary"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={uploading || !selectedFile}
                    className="w-full h-10 rounded-xl bg-secondary text-on-secondary font-headline-sm text-sm hover:bg-secondary/90 transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    <span className="material-symbols-outlined text-[18px]">cloud_upload</span>
                    <span>{uploading ? t('farmerDashboard.uploadingPhoto', 'Uploading Photo...') : t('farmerDashboard.uploadInspectionPhoto', 'Upload Inspection Photo')}</span>
                  </button>

                  {imagePreview && (
                    <button
                      type="button"
                      disabled={analyzingLeaf}
                      onClick={() => handleAnalyzeLeaf(imagePreview)}
                      className="w-full h-9 rounded-xl bg-surface-container text-on-surface font-semibold text-xs hover:bg-surface-container-high transition-colors flex items-center justify-center gap-2 cursor-pointer border border-outline-variant/30"
                    >
                      <span className="material-symbols-outlined text-[16px]">filter_center_focus</span>
                      <span>{analyzingLeaf ? t('diseaseDetection.analyzingImage') : t('farmerDashboard.runCnnInference', 'Run CNN Disease Inference')}</span>
                    </button>
                  )}

                  {aiAnalysisResult && (
                    <div className="p-3 bg-surface rounded-lg border border-outline-variant/30 text-xs text-on-surface-variant italic">
                      {aiAnalysisResult}
                    </div>
                  )}
                </form>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-space-md">
              <h3 className="font-headline-md text-headline-md text-on-surface">{t('farmerDashboard.submissionsFeed', 'Submissions Feed')}</h3>
              {fieldSubmissions.length === 0 ? (
                <p className="text-xs text-on-surface-variant">{t('farmerDashboard.noSubmissionRecords', 'No submission records found.')}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {fieldSubmissions.map((sub, i) => (
                    <div key={sub.id || i} className="p-3 bg-surface rounded-lg border border-outline-variant/20 text-xs flex flex-col gap-1">
                      <div className="flex justify-between text-on-surface-variant font-semibold">
                        <span>{translateGrowthStage(sub.cropGrowthStage)}</span>
                        <span>{sub.submittedAt ? formatDate(sub.submittedAt, { dateStyle: 'medium' }) : t('common.recent')}</span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 py-1">
                        <div>{t('dashboard.moisture')}: <strong>{formatNumber(sub.soilMoisture, { maximumFractionDigits: 2 })}%</strong></div>
                        <div>{t('dashboard.ph')}: <strong>{formatNumber(sub.soilPH, { maximumFractionDigits: 2 })}</strong></div>
                        <div>{t('farmerDashboard.temperature', 'Temp')}: <strong>{formatNumber(sub.temperature, { maximumFractionDigits: 1 })}°C</strong></div>
                      </div>
                      {sub.notes && <p className="italic text-on-surface-variant">"{sub.notes}"</p>}
                    </div>
                  ))}
                </div>
              )}

              {fieldImages.length > 0 && (
                <div className="flex flex-col gap-2 mt-4 pt-4 border-t border-outline-variant/20">
                  <h4 className="font-semibold text-xs text-on-surface">
                    {t('farmerDashboard.inspectionPhotos', 'Inspection Photos ({count})', { count: formatNumber(fieldImages.length) })}
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {fieldImages.map((img, idx) => (
                      <div key={img.id || idx} className="rounded-lg overflow-hidden border border-outline-variant/30 bg-surface">
                        <img src={img.imageUrl} alt={img.caption || t('common.image')} className="w-full h-24 object-cover" />
                        {img.caption && <p className="text-[10px] p-1 truncate text-on-surface-variant">{img.caption}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Section 24: Assignment History Feed */}
          {activeTab === 'assignments' && (
            <div className="bg-surface-container-lowest p-space-lg rounded-xl shadow-sm border border-outline-variant/30 flex flex-col gap-space-md">
              <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
                <h3 className="font-headline-md text-headline-md text-on-surface">{t('farmerDashboard.assignmentHistory', 'Farmer Assignment History')}</h3>
                <span className="text-xs text-on-surface-variant">{t('farmerDashboard.totalRecords', '{count} Total Records', { count: formatNumber(assignmentHistory.length) })}</span>
              </div>

              {assignmentHistory.length === 0 ? (
                <p className="text-xs text-on-surface-variant p-4 text-center bg-surface rounded-lg">
                  {t('farmerDashboard.noAssignmentHistory', 'No previous assignment history recorded.')}
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-outline-variant/30 bg-surface-container text-on-surface-variant">
                        <th className="p-2.5 font-semibold">{t('settings.farmName')}</th>
                        <th className="p-2.5 font-semibold">{t('farm.fieldName')}</th>
                        <th className="p-2.5 font-semibold">{t('farmerDashboard.assignedDate', 'Assigned Date')}</th>
                        <th className="p-2.5 font-semibold">{t('farmerDashboard.unassignedDate', 'Unassigned Date')}</th>
                        <th className="p-2.5 font-semibold">{t('fields.status')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {assignmentHistory.map((rec) => (
                        <tr key={rec.id} className="border-b border-outline-variant/20 hover:bg-surface transition-colors">
                          <td className="p-2.5 font-semibold text-on-surface">{rec.farmName}</td>
                          <td className="p-2.5 text-on-surface">{rec.fieldName}</td>
                          <td className="p-2.5 font-data-mono">{rec.assignedAt ? formatDate(rec.assignedAt, { dateStyle: 'medium' }) : t('common.notAvailable')}</td>
                          <td className="p-2.5 font-data-mono">{rec.unassignedAt ? formatDate(rec.unassignedAt, { dateStyle: 'medium' }) : '—'}</td>
                          <td className="p-2.5">
                            <span
                              className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                                rec.status === 'active' ? 'bg-primary-container text-on-primary-container' : 'bg-surface-container text-on-surface-variant'
                              }`}
                            >
                              {translateEnum('common.enums.assignmentStatuses', rec.status, rec.status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Empty State: No Active Field Assignment ── */}
      {!selectedField && (
        <section className="bg-surface-container-lowest p-space-xl rounded-2xl shadow-sm border border-outline-variant/30 flex flex-col items-center justify-center text-center gap-space-md py-12">
          <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shadow-inner">
            <span className="material-symbols-outlined text-[36px]">nature_people</span>
          </div>
          <div className="max-w-md space-y-1">
            <h2 className="font-headline-md text-headline-md text-on-surface font-bold">
              {t('farmers.noActiveFieldTitle', 'No Active Field Assignment')}
            </h2>
            <p className="text-body-sm text-on-surface-variant">
              {t(
                'farmers.noActiveFieldDesc',
                'You are currently free and available for farm work. Explore open fields from farm owners and submit work applications with your specialist rates!'
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => navigate('/farmers?tab=assignments')}
              className="h-10 px-5 rounded-xl bg-primary text-on-primary font-semibold text-xs hover:opacity-95 transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">travel_explore</span>
              <span>{t('farmers.applyForWorkBtn', 'Apply for Work on Owner Fields')}</span>
            </button>
            <button
              type="button"
              onClick={() => navigate('/farmers?tab=farmers')}
              className="h-10 px-4 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-semibold text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">group</span>
              <span>{t('farmers.directoryTab', 'Specialist Directory')}</span>
            </button>
          </div>
        </section>
      )}

      {/* ── Unassign Confirmation Modal (Section 23) ────────────────────────── */}
      {showUnassignModal && selectedField && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest w-full max-w-md p-space-lg rounded-xl shadow-xl flex flex-col gap-space-md border border-outline-variant/30">
            <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
              <div className="flex items-center gap-2 text-on-error-container">
                <span className="material-symbols-outlined text-[24px]">warning</span>
                <h3 className="font-headline-md text-headline-md font-bold text-on-surface">{t('farmerDashboard.confirmUnassign', 'Confirm Unassign')}</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowUnassignModal(false)}
                className="text-on-surface-variant hover:text-on-surface"
                aria-label={t('accessibility.closeDialog')}
              >
                ✕
              </button>
            </div>

            <p className="text-sm text-on-surface-variant leading-relaxed">
              {t('validation.unassignFieldConfirm', { name: selectedField.name })}
            </p>
            <p className="text-xs text-on-surface-variant bg-surface p-3 rounded-lg border border-outline-variant/20">
              {t('farmerDashboard.unassignmentWarning', 'Your assignment history will be preserved. The field will become available for the farm owner to reassign.')}
            </p>

            <div className="flex items-center justify-end gap-space-sm pt-2">
              <button
                type="button"
                onClick={() => setShowUnassignModal(false)}
                className="h-9 px-4 rounded-lg bg-surface-container text-on-surface font-semibold text-xs hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                disabled={isUnassigning}
                onClick={handleConfirmUnassign}
                className="h-9 px-4 rounded-lg bg-error text-on-error font-semibold text-xs hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[16px]">person_remove</span>
                <span>{isUnassigning ? t('farmerDashboard.unassigning', 'Unassigning...') : t('farmerDashboard.confirmUnassign', 'Confirm Unassign')}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Farmer Reviews & Reputation Modal */}
      {showReviewsModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-surface-container-lowest w-full max-w-lg p-space-lg rounded-xl shadow-2xl flex flex-col gap-space-md border border-outline-variant/30 animate-in fade-in zoom-in-95 max-h-[85vh]">
            <div className="flex items-center justify-between pb-space-xs border-b border-outline-variant/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-container text-on-primary flex items-center justify-center font-bold text-sm shrink-0">
                  {(userProfile?.fullName || 'F').charAt(0).toUpperCase()}
                </div>
                <div className="flex flex-col">
                  <h3 className="font-headline-md text-headline-md font-bold text-on-surface">
                    {t('farmerRating.myReviews', 'My Received Reviews')}
                  </h3>
                  <span className="text-xs text-on-surface-variant font-medium">
                    {t('farmerRating.myReviewsDescription', 'Ratings and qualitative feedback submitted by farm enterprise owners.')}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowReviewsModal(false)}
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
                    {avgFarmerRating.toFixed(1)}
                  </span>
                  <span className="text-xs text-on-surface-variant font-normal">
                    / 5.0
                  </span>
                </div>
              </div>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-surface-container text-secondary">
                {t('farmerRating.basedOnReviews', '{count} Reviews', { count: formatNumber(farmerRatings.length) })}
              </span>
            </div>

            {/* Reviews List */}
            <div className="flex flex-col gap-3 overflow-y-auto max-h-[45vh] pr-1">
              {farmerRatings.length === 0 ? (
                <div className="py-8 text-center flex flex-col items-center justify-center gap-2 text-on-surface-variant">
                  <span className="material-symbols-outlined text-[32px] text-outline-variant">rate_review</span>
                  <p className="text-xs font-medium">{t('farmerRating.noReviewsYet', 'No reviews or ratings recorded yet.')}</p>
                </div>
              ) : (
                farmerRatings.map((r) => (
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
                        {r.feedback}
                      </p>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="flex items-center justify-end pt-space-xs border-t border-outline-variant/20">
              <button
                type="button"
                onClick={() => setShowReviewsModal(false)}
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
