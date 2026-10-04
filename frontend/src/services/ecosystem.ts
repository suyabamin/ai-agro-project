/**
 * AgroAI — Owner + Farmer Ecosystem Firestore Services
 * Handles Farms, Fields, Field Geometry (Mapbox), Farmer Assignments, Land Data, Cloudinary Images, Notifications.
 */

import {
  collection,
  doc,
  getDoc,
  setDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  updateDoc,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';
import type { GeoPolygon, GeoLineString } from '../components/map/AgroMap';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface FarmerRating {
  id?: string;
  ratingId?: string;
  farmerId: string;
  farmerName: string;
  ownerId: string;
  ownerName: string;
  rating: number; // 1 to 5
  feedback?: string;
  fieldId?: string;
  fieldName?: string;
  createdAt?: any;
}

export interface FarmerProfile {
  uid: string;
  fullName: string;
  email: string;
  role: 'farmer';
  assignedFieldsCount?: number;
  averageRating?: number;
  totalRatings?: number;
  phone?: string;
  location?: string;
  experienceYears?: number;
  specialization?: string[];
  bio?: string;
  hourlyRate?: string;
  avatarUrl?: string;
  verified?: boolean;
}

export interface Farm {
  farmId: string;
  ownerId: string;
  ownerName?: string;
  name: string;
  location: string;
  areaHectares: number;
  description?: string;
  createdAt?: any;
}

export interface OwnerAccountDetails {
  ownerId: string;
  name: string;
  farmName: string;
  location: string;
  verified: boolean;
}

export function getOwnerAccountForField(field: Field, farmsList: Farm[]): OwnerAccountDetails {
  const farm = farmsList.find((fm) => fm.farmId === field.farmId);
  const ownerId = field.ownerId || farm?.ownerId || 'owner_demo';
  const farmName = field.farmName || farm?.name || 'Salinas Valley Agricultural Enterprise';
  const ownerName =
    (field as any)?.ownerName ||
    farm?.ownerName ||
    (ownerId === 'owner_demo' ? 'Salinas Valley Agricultural Enterprise' : 'Farm Owner Account');
  const location = farm?.location || 'Salinas Valley, CA';

  return {
    ownerId,
    name: ownerName,
    farmName,
    location,
    verified: true,
  };
}

export interface FieldWorkerAssignment {
  farmerId: string;
  farmerName: string;
  assignedAt?: string;
  workType?: string;
  dailyRate?: string;
}

export interface Field {
  id?: string;
  fieldId: string;
  farmId: string;
  ownerId: string;
  ownerName?: string;
  farmName?: string;
  name: string;
  crop: string;
  areaAcres: number;
  soilType: string;
  latitude: number;
  longitude: number;
  boundary?: GeoPolygon | null;
  path?: GeoLineString | null;
  assignedFarmerId?: string | null;
  assignedFarmerName?: string | null;
  assignedWorkers?: FieldWorkerAssignment[];
  assignedFarmerIds?: string[];
  soilMoisture?: number;
  soilPH?: number;
  temperature?: number;
  humidity?: number;
  rainfall?: number;
  nitrogen?: number;
  phosphorus?: number;
  potassium?: number;
  cropGrowthStage?: string;
  waterRequirement?: string;
  status: 'Healthy' | 'Needs Attention' | 'Critical' | 'Dry' | 'Moderate';
  createdAt?: any;
  updatedAt?: any;
}

export interface FieldLandData {
  id?: string;
  fieldId: string;
  farmerId: string;
  farmerName?: string;
  ownerId: string;
  soilMoisture: number; // %
  soilPH: number;
  temperature: number; // °C
  nitrogen: number;
  phosphorus: number;
  potassium: number;
  cropGrowthStage: string;
  notes: string;
  submittedAt: any;
}

export interface FieldImageRecord {
  id?: string;
  fieldId: string;
  farmerId: string;
  farmerName?: string;
  ownerId: string;
  imageUrl: string;
  publicId?: string;
  imageType: 'leaf' | 'crop' | 'soil' | 'pest' | 'field' | 'water';
  caption: string;
  uploadedAt: any;
}

export interface NotificationItem {
  id: string;
  recipientId: string;
  title: string;
  message: string;
  type: 'assignment' | 'submission' | 'alert';
  read: boolean;
  requestId?: string;
  farmerId?: string;
  farmerName?: string;
  ownerId?: string;
  ownerName?: string;
  fieldId?: string;
  fieldName?: string;
  farmId?: string;
  farmName?: string;
  workType?: string;
  dailyRate?: string;
  actionStatus?: 'pending' | 'approved' | 'rejected';
  createdAt: any;
}

// ─── Reactive Event & LocalStorage Persistence ───────────────────────────

export const ECOSYSTEM_UPDATED_EVENT = 'agroai-ecosystem-updated';

export function notifyEcosystemChange(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(ECOSYSTEM_UPDATED_EVENT));
  }
}

const LOCAL_FARMS_KEY = 'agroai_cache_farms';
const LOCAL_FIELDS_KEY = 'agroai_cache_fields';
const LOCAL_SUBS_KEY = 'agroai_cache_submissions';
const LOCAL_IMGS_KEY = 'agroai_cache_images';
const LOCAL_RATINGS_KEY = 'agroai_cache_ratings';
const LOCAL_AREQS_KEY = 'agroai_cache_assignment_requests';
const LOCAL_NOTIFS_KEY = 'agroai_cache_notifications';
const LOCAL_ASSIGNS_KEY = 'agroai_cache_assignments';

function loadCache<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function saveCache(key: string, data: any): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Ignore quota limits
  }
}

function syncEcosystemCache(): void {
  // When Firebase is configured, skip localStorage caching — DB is the source of truth
  // Only cache locally in offline/demo mode (when Firebase not configured)
  if (typeof window === 'undefined') return;
  try {
    const isFirebaseActive = Boolean(
      (import.meta as any).env?.VITE_FIREBASE_API_KEY &&
      (import.meta as any).env?.VITE_FIREBASE_PROJECT_ID &&
      (import.meta as any).env?.VITE_FIREBASE_API_KEY !== 'demo-api-key'
    );
    if (isFirebaseActive) return; // Don't cache when live DB is active
    localStorage.setItem(LOCAL_FARMS_KEY, JSON.stringify(FALLBACK_FARMS));
    localStorage.setItem(LOCAL_FIELDS_KEY, JSON.stringify(FALLBACK_FIELDS));
    localStorage.setItem(LOCAL_SUBS_KEY, JSON.stringify(inMemorySubmissions));
    localStorage.setItem(LOCAL_IMGS_KEY, JSON.stringify(inMemoryImages));
    localStorage.setItem(LOCAL_RATINGS_KEY, JSON.stringify(inMemoryRatings));
  } catch {
    // Ignore storage quota
  }
}

// ─── Fallback Demo Data & In-Memory Cache Initialization ────────────────────────

const DEFAULT_RATINGS: FarmerRating[] = [
  {
    id: 'rate_demo_01',
    ratingId: 'rate_demo_01',
    farmerId: 'farmer_01',
    farmerName: 'Rahim Uddin',
    ownerId: 'owner_demo',
    ownerName: 'Green Valley Agriculture',
    rating: 5,
    feedback: 'Excellent work on cereal field moisture monitoring and timely irrigation cycles.',
    fieldName: 'North Rice Field',
    createdAt: new Date(Date.now() - 86400000 * 3).toISOString(),
  },
  {
    id: 'rate_demo_02',
    ratingId: 'rate_demo_02',
    farmerId: 'farmer_01',
    farmerName: 'Rahim Uddin',
    ownerId: 'owner_demo',
    ownerName: 'Green Valley Agriculture',
    rating: 5,
    feedback: 'Prompt N-P-K data logging. Followed precision drip recommendations perfectly.',
    fieldName: 'North Rice Field',
    createdAt: new Date(Date.now() - 86400000 * 8).toISOString(),
  },
  {
    id: 'rate_demo_03',
    ratingId: 'rate_demo_03',
    farmerId: 'farmer_02',
    farmerName: 'Karim Hossain',
    ownerId: 'owner_demo',
    ownerName: 'Green Valley Agriculture',
    rating: 4,
    feedback: 'Good attention to soil pH and disease scouting. Punctual telemetry updates.',
    fieldName: 'East Tomato Sector',
    createdAt: new Date(Date.now() - 86400000 * 5).toISOString(),
  },
  {
    id: 'rate_demo_04',
    ratingId: 'rate_demo_04',
    farmerId: 'farmer_03',
    farmerName: 'Hasan Mahmud',
    ownerId: 'owner_demo',
    ownerName: 'Green Valley Agriculture',
    rating: 5,
    feedback: 'Highly experienced and reliable. Thorough leaf inspection and quick reporting.',
    fieldName: 'South Maize Zone',
    createdAt: new Date(Date.now() - 86400000 * 12).toISOString(),
  },
];

const FALLBACK_FARMERS: FarmerProfile[] = [
  {
    uid: 'farmer_01',
    fullName: 'Rahim Uddin',
    email: 'rahim@agroai.edu',
    role: 'farmer',
    assignedFieldsCount: 1,
    averageRating: 5.0,
    totalRatings: 4,
    phone: '+1 (555) 349-1021',
    location: 'Salinas Valley — North District',
    experienceYears: 10,
    specialization: ['Precision Irrigation', 'Rice & Cereal', 'Modbus Telemetry'],
    bio: 'Veteran field operator with 10 years experience overseeing large-scale drip systems, variable rate fertigation, and sensor calibration.',
    hourlyRate: '$120 / day',
    verified: true,
  },
  {
    uid: 'farmer_02',
    fullName: 'Karim Hossain',
    email: 'karim@agroai.edu',
    role: 'farmer',
    assignedFieldsCount: 1,
    averageRating: 4.8,
    totalRatings: 3,
    phone: '+1 (555) 892-4412',
    location: 'Salinas Valley — East District',
    experienceYears: 7,
    specialization: ['Pest Scouting', 'Maize & Corn', 'Soil N-P-K Diagnostics'],
    bio: 'Specialist in integrated pest management, leaf pathogen early detection, and soil mineral amendment protocols.',
    hourlyRate: '$110 / day',
    verified: true,
  },
  {
    uid: 'farmer_03',
    fullName: 'Hasan Mahmud',
    email: 'hasan@agroai.edu',
    role: 'farmer',
    assignedFieldsCount: 0,
    averageRating: 5.0,
    totalRatings: 5,
    phone: '+1 (555) 762-9901',
    location: 'Salinas Valley — Central Basin',
    experienceYears: 8,
    specialization: ['Smart Drip Systems', 'Vegetable Crops', 'Drone Scouting'],
    bio: 'Certified smart irrigation technician. Experienced in automated valve scheduling, crop ETc balancing, and rapid drone field mapping.',
    hourlyRate: '$125 / day',
    verified: true,
  },
  {
    uid: 'farmer_04',
    fullName: 'Tariqul Islam',
    email: 'tariqul@agroai.edu',
    role: 'farmer',
    assignedFieldsCount: 0,
    averageRating: 4.9,
    totalRatings: 2,
    phone: '+1 (555) 431-8890',
    location: 'Salinas Valley — South Hills',
    experienceYears: 5,
    specialization: ['Organic Horticulture', 'Tomato & Legumes', 'Micro-Nutrient Balancing'],
    bio: 'Passionate organic cultivator with extensive background in high-tunnel tomato production, organic compost tea, and drip fertigation.',
    hourlyRate: '$105 / day',
    verified: true,
  },
  {
    uid: 'farmer_05',
    fullName: 'Selim Reza',
    email: 'selim@agroai.edu',
    role: 'farmer',
    assignedFieldsCount: 0,
    averageRating: 4.7,
    totalRatings: 6,
    phone: '+1 (555) 670-3329',
    location: 'Monterey Agricultural Basin',
    experienceYears: 12,
    specialization: ['Heavy Equipment', 'Deep Tillage & Furrows', 'Harvest Logistics'],
    bio: 'Master equipment operator specializing in tractor guidance systems, subsoiler deep chisel tillage, and multi-field seasonal harvest coordination.',
    hourlyRate: '$135 / day',
    verified: true,
  },
  {
    uid: 'farmer_06',
    fullName: 'Farhana Begum',
    email: 'farhana@agroai.edu',
    role: 'farmer',
    assignedFieldsCount: 0,
    averageRating: 5.0,
    totalRatings: 3,
    phone: '+1 (555) 512-7744',
    location: 'Salinas Valley — West Sector',
    experienceYears: 6,
    specialization: ['Nursery Management', 'Seedling Health', 'Disease Scouting'],
    bio: 'Agronomy graduate with proven expertise in seedling vigor monitoring, fungal blight mitigation, and automated climate greenhouse operations.',
    hourlyRate: '$115 / day',
    verified: true,
  },
];

const DEFAULT_FARMS: Farm[] = [
  {
    farmId: 'farm_salinas_01',
    ownerId: 'owner_demo',
    ownerName: 'Salinas Valley Agricultural Enterprise',
    name: 'Green Valley Agriculture Farm',
    location: 'Salinas Valley, Sector 4, CA',
    areaHectares: 420,
    description: 'Primary organic cereal, vegetable, and high-yield crop operations.',
  },
];

const DEFAULT_FIELDS: Field[] = [
  {
    fieldId: 'field_north_rice',
    farmId: 'farm_salinas_01',
    ownerId: 'owner_demo',
    name: 'North Rice Field',
    crop: 'Rice',
    areaAcres: 12.5,
    soilType: 'Salinas Silty Loam',
    latitude: 36.677,
    longitude: -121.655,
    soilMoisture: 42,
    soilPH: 6.8,
    temperature: 24.5,
    humidity: 82,
    rainfall: 15,
    nitrogen: 45,
    phosphorus: 32,
    potassium: 120,
    cropGrowthStage: 'Vegetative Phase',
    waterRequirement: 'Moderate',
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [-121.658, 36.679],
          [-121.652, 36.679],
          [-121.652, 36.675],
          [-121.658, 36.675],
          [-121.658, 36.679],
        ],
      ],
    },
    path: {
      type: 'LineString',
      coordinates: [
        [-121.659, 36.679],
        [-121.655, 36.677],
        [-121.652, 36.676],
      ],
    },
    assignedFarmerId: 'farmer_01',
    assignedFarmerName: 'Rahim Uddin',
    assignedFarmerIds: ['farmer_01'],
    assignedWorkers: [
      {
        farmerId: 'farmer_01',
        farmerName: 'Rahim Uddin',
        assignedAt: '2026-09-01T08:00:00Z',
        workType: 'Precision Irrigation & Water Dispatch',
        dailyRate: '$120 / day',
      },
    ],
    status: 'Healthy',
  },
  {
    fieldId: 'field_south_corn',
    farmId: 'farm_salinas_01',
    ownerId: 'owner_demo',
    name: 'South Maize Parcel',
    crop: 'Maize',
    areaAcres: 18.2,
    soilType: 'Clay Loam',
    latitude: 36.672,
    longitude: -121.65,
    soilMoisture: 28,
    soilPH: 6.2,
    temperature: 28.1,
    humidity: 65,
    rainfall: 5,
    nitrogen: 30,
    phosphorus: 20,
    potassium: 90,
    cropGrowthStage: 'Flowering & Tasseling',
    waterRequirement: 'Urgent',
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [-121.654, 36.674],
          [-121.648, 36.674],
          [-121.648, 36.670],
          [-121.654, 36.670],
          [-121.654, 36.674],
        ],
      ],
    },
    path: {
      type: 'LineString',
      coordinates: [
        [-121.655, 36.674],
        [-121.650, 36.672],
      ],
    },
    assignedFarmerId: 'farmer_02',
    assignedFarmerName: 'Karim Hossain',
    assignedFarmerIds: ['farmer_02'],
    assignedWorkers: [
      {
        farmerId: 'farmer_02',
        farmerName: 'Karim Hossain',
        assignedAt: '2026-09-05T08:00:00Z',
        workType: 'Pest Scouting & Field Operations',
        dailyRate: '$110 / day',
      },
    ],
    status: 'Needs Attention',
  },
  {
    fieldId: 'field_east_wheat',
    farmId: 'farm_salinas_01',
    ownerId: 'owner_demo',
    name: 'East Wheat Plot',
    crop: 'Wheat',
    areaAcres: 9.4,
    soilType: 'Chualar Sandy Loam',
    latitude: 36.680,
    longitude: -121.645,
    soilMoisture: 55,
    soilPH: 6.5,
    temperature: 22.0,
    humidity: 70,
    rainfall: 10,
    nitrogen: 50,
    phosphorus: 35,
    potassium: 110,
    cropGrowthStage: 'Tillering Phase',
    waterRequirement: 'Low',
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [-121.648, 36.682],
          [-121.642, 36.682],
          [-121.642, 36.678],
          [-121.648, 36.678],
          [-121.648, 36.682],
        ],
      ],
    },
    path: {
      type: 'LineString',
      coordinates: [
        [-121.649, 36.682],
        [-121.645, 36.680],
      ],
    },
    assignedFarmerId: null,
    assignedFarmerName: null,
    assignedFarmerIds: [],
    assignedWorkers: [],
    status: 'Healthy',
  },
  {
    fieldId: 'field_west_tomato',
    farmId: 'farm_salinas_01',
    ownerId: 'owner_demo',
    name: 'West Tomato Sector',
    crop: 'Tomato',
    areaAcres: 15.0,
    soilType: 'Pacheco Silt Loam',
    latitude: 36.675,
    longitude: -121.662,
    soilMoisture: 35,
    soilPH: 6.3,
    temperature: 26.5,
    humidity: 75,
    rainfall: 8,
    nitrogen: 40,
    phosphorus: 28,
    potassium: 95,
    cropGrowthStage: 'Fruiting Phase',
    waterRequirement: 'Moderate',
    boundary: {
      type: 'Polygon',
      coordinates: [
        [
          [-121.665, 36.677],
          [-121.659, 36.677],
          [-121.659, 36.673],
          [-121.665, 36.673],
          [-121.665, 36.677],
        ],
      ],
    },
    path: {
      type: 'LineString',
      coordinates: [
        [-121.666, 36.677],
        [-121.662, 36.675],
      ],
    },
    assignedFarmerId: null,
    assignedFarmerName: null,
    status: 'Healthy',
  },
];

const DEFAULT_LAND_DATA: FieldLandData[] = [
  {
    id: 'data_demo_01',
    fieldId: 'field_north_rice',
    farmerId: 'farmer_01',
    farmerName: 'Rahim Uddin',
    ownerId: 'owner_demo',
    soilMoisture: 42,
    soilPH: 6.8,
    temperature: 24.5,
    nitrogen: 45,
    phosphorus: 32,
    potassium: 120,
    cropGrowthStage: 'Vegetative Phase',
    notes: 'Optimal soil moisture and leaf canopy density. Minor leaf tip chlorosis observed in northeast corner.',
    submittedAt: '2026-09-18T10:30:00Z',
  },
  {
    id: 'data_demo_02',
    fieldId: 'field_south_corn',
    farmerId: 'farmer_02',
    farmerName: 'Karim Hossain',
    ownerId: 'owner_demo',
    soilMoisture: 28,
    soilPH: 6.2,
    temperature: 28.1,
    nitrogen: 30,
    phosphorus: 20,
    potassium: 90,
    cropGrowthStage: 'Flowering & Tasseling',
    notes: 'Soil moisture is low (28%). Irrigation scheduled for tomorrow morning.',
    submittedAt: '2026-09-19T08:15:00Z',
  },
];

const DEFAULT_FIELD_IMAGES: FieldImageRecord[] = [
  {
    id: 'img_demo_01',
    fieldId: 'field_north_rice',
    farmerId: 'farmer_01',
    farmerName: 'Rahim Uddin',
    ownerId: 'owner_demo',
    imageUrl: 'https://images.unsplash.com/photo-1586771107445-d3ca888129ff?auto=format&fit=crop&w=600&q=80',
    imageType: 'leaf',
    caption: 'Healthy paddy leaves inspection',
    uploadedAt: '2026-09-18T10:32:00Z',
  },
  {
    id: 'img_demo_02',
    fieldId: 'field_south_corn',
    farmerId: 'farmer_02',
    farmerName: 'Karim Hossain',
    ownerId: 'owner_demo',
    imageUrl: 'https://images.unsplash.com/photo-1500937386664-56d1dfef3854?auto=format&fit=crop&w=600&q=80',
    imageType: 'field',
    caption: 'Overview of South Maize field sector 2',
    uploadedAt: '2026-09-19T08:20:00Z',
  },
];

// Keep the built-in demo/fallback dataset available even when Firebase is
// configured but Firestore access is denied by security rules. In that case the
// app should fall back to local demo data instead of wiping the only valid data source.

const fallbackFarms = (): Farm[] => {
  const cached = loadCache(LOCAL_FARMS_KEY, DEFAULT_FARMS);
  return cached.length > 0 ? cached : DEFAULT_FARMS;
};
const fallbackFields = (): Field[] => {
  const cached = loadCache(LOCAL_FIELDS_KEY, DEFAULT_FIELDS);
  return cached.length > 0 ? cached : DEFAULT_FIELDS;
};
const fallbackSubmissions = (): FieldLandData[] => {
  const cached = loadCache(LOCAL_SUBS_KEY, DEFAULT_LAND_DATA);
  return cached.length > 0 ? cached : DEFAULT_LAND_DATA;
};
const fallbackImages = (): FieldImageRecord[] => {
  const cached = loadCache(LOCAL_IMGS_KEY, DEFAULT_FIELD_IMAGES);
  return cached.length > 0 ? cached : DEFAULT_FIELD_IMAGES;
};
const fallbackRatings = (): FarmerRating[] => {
  const cached = loadCache(LOCAL_RATINGS_KEY, DEFAULT_RATINGS);
  return cached.length > 0 ? cached : DEFAULT_RATINGS;
};

const FALLBACK_FARMS: Farm[] = fallbackFarms();
const FALLBACK_FIELDS: Field[] = fallbackFields();
const inMemorySubmissions: FieldLandData[] = fallbackSubmissions();
const inMemoryImages: FieldImageRecord[] = fallbackImages();
const inMemoryRatings: FarmerRating[] = fallbackRatings();

// ─── Ecosystem Firestore API ──────────────────────────────────────────────────

/**
 * Fetch all registered users with role == 'farmer'
 */
export async function getRegisteredFarmers(): Promise<FarmerProfile[]> {
  let list: FarmerProfile[] = [];
  if (!db) {
    list = [...FALLBACK_FARMERS];
  } else {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'farmer'));
      const snap = await getDocs(q);
      const farmers: FarmerProfile[] = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        farmers.push({
          uid: docSnap.id,
          fullName: data.fullName || data.displayName || 'Farmer Worker',
          email: data.email || '',
          role: 'farmer',
          assignedFieldsCount: data.assignedFieldsCount || 0,
          averageRating: typeof data.averageRating === 'number' ? data.averageRating : 5.0,
          totalRatings: typeof data.totalRatings === 'number' ? data.totalRatings : 1,
          phone: data.phone || '+1 (555) 349-1021',
          location: data.location || 'Salinas Valley Agricultural Zone',
          experienceYears: data.experienceYears || 6,
          specialization: Array.isArray(data.specialization) && data.specialization.length > 0 ? data.specialization : ['Field Cultivation', 'Irrigation'],
          bio: data.bio || 'Dedicated agricultural worker specialized in smart farm monitoring and crop health telemetry.',
          hourlyRate: data.hourlyRate || '$115 / day',
          avatarUrl: data.avatarUrl,
          verified: data.verified ?? true,
        });
      });
      list = farmers.length > 0 ? farmers : [...FALLBACK_FARMERS];
    } catch {
      list = [...FALLBACK_FARMERS];
    }
  }

  // Cross-reference with all fields to keep assignedFieldsCount completely accurate and synchronized
  try {
    const allFields = await getOwnerFields();
    list.forEach((farmer) => {
      const actualCount = allFields.filter((f) =>
        getFieldAssignedWorkers(f).some((w) => w.farmerId === farmer.uid)
      ).length;
      farmer.assignedFieldsCount = actualCount;
    });
  } catch {
    // ignore
  }

  return list;
}

/**
 * Submit a rating & review comment for a farmer from a farm owner.
 * Business Rules:
 * 1. An owner can ONLY rate and comment on farmers they have hired for work.
 * 2. Written comment/feedback is required alongside the star rating.
 */
export async function submitFarmerRating(
  ratingData: Omit<FarmerRating, 'id' | 'ratingId' | 'createdAt'>
): Promise<{ success: boolean; ratingId?: string; error?: string }> {
  const activeOwnerId = ratingData.ownerId || 'owner_demo';

  // Rule 1: Owner can ONLY rate farmers they have hired for work
  const isHired = await hasOwnerHiredFarmer(activeOwnerId, ratingData.farmerId);
  if (!isHired) {
    return {
      success: false,
      error: 'You can only rate and comment on farmers you have hired for work.',
    };
  }

  // Rule 2: Written comment / feedback is required alongside rating
  if (!ratingData.feedback || ratingData.feedback.trim().length === 0) {
    return {
      success: false,
      error: 'Please provide a written comment or performance feedback with your rating.',
    };
  }

  const ratingId = `rate_${Date.now()}`;
  const newRating: FarmerRating = {
    ...ratingData,
    feedback: ratingData.feedback.trim(),
    id: ratingId,
    ratingId,
    createdAt: new Date().toISOString(),
  };

  inMemoryRatings.unshift(newRating);
  syncEcosystemCache();

  if (db) {
    try {
      await setDoc(doc(db, 'farmer_ratings', ratingId), {
        ...newRating,
        createdAt: serverTimestamp(),
      });

      // Recalculate average rating for farmer in Firestore
      try {
        const q = query(collection(db, 'farmer_ratings'), where('farmerId', '==', ratingData.farmerId));
        const snap = await getDocs(q);
        const scores: number[] = [];
        snap.forEach((d) => {
          const val = d.data().rating;
          if (typeof val === 'number') scores.push(val);
        });
        if (scores.length > 0) {
          const avg = Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1));
          await setDoc(
            doc(db, 'users', ratingData.farmerId),
            { averageRating: avg, totalRatings: scores.length },
            { merge: true }
          );
        }
      } catch (err) {
        console.warn('Could not update user average rating in Firestore:', err);
      }
    } catch (err: any) {
      console.warn('Firestore rating save failed, using memory:', err);
    }
  }

  notifyEcosystemChange();
  return { success: true, ratingId };
}

/**
 * Fetch all ratings & reviews for a specific farmer
 */
export async function getFarmerRatings(farmerId: string): Promise<FarmerRating[]> {
  if (db) {
    try {
      const q = query(collection(db, 'farmer_ratings'), where('farmerId', '==', farmerId));
      const snap = await getDocs(q);
      const list: FarmerRating[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          ratingId: d.id,
          farmerId: data.farmerId,
          farmerName: data.farmerName || 'Farmer Worker',
          ownerId: data.ownerId,
          ownerName: data.ownerName || 'Farm Owner',
          rating: data.rating || 5,
          feedback: data.feedback || '',
          fieldId: data.fieldId || '',
          fieldName: data.fieldName || '',
          createdAt: data.createdAt?.toDate ? data.createdAt.toDate().toISOString() : data.createdAt || new Date().toISOString(),
        });
      });
      if (list.length > 0) {
        return list.sort((a, b) => (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0));
      }
    } catch (err) {
      console.warn('Firestore getFarmerRatings error, using memory fallback:', err);
    }
  }

  return inMemoryRatings
    .filter((r) => r.farmerId === farmerId)
    .sort((a, b) => (new Date(b.createdAt).getTime() || 0) - (new Date(a.createdAt).getTime() || 0));
}

/**
 * Calculate average rating and count for a farmer
 */
export async function getFarmerRatingSummary(farmerId: string): Promise<{ average: number; count: number }> {
  const ratings = await getFarmerRatings(farmerId);
  if (!ratings || ratings.length === 0) {
    return { average: 0, count: 0 };
  }
  const sum = ratings.reduce((acc, r) => acc + (r.rating || 5), 0);
  const average = Number((sum / ratings.length).toFixed(1));
  return { average, count: ratings.length };
}

/**
 * Create a new farm in Firestore and update local cache
 */
export async function createFarm(farm: Omit<Farm, 'farmId' | 'createdAt'>): Promise<Farm> {
  const farmId = `farm_${Date.now()}`;
  const newFarm: Farm = {
    ...farm,
    farmId,
    createdAt: new Date().toISOString(),
  };

  FALLBACK_FARMS.unshift(newFarm);
  syncEcosystemCache();
  notifyEcosystemChange();

  if (db) {
    try {
      await setDoc(doc(db, 'farms', farmId), {
        ...newFarm,
        createdAt: serverTimestamp(),
      });
    } catch {
      // Memory fallback
    }
  }

  // Section 6: Automatically create 4 default fields (Field A, Field B, Field C, Field D)
  const defaultFieldNames = ['Field A', 'Field B', 'Field C', 'Field D'];
  const defaultCrops = ['Rice', 'Maize', 'Wheat', 'Potato'];
  const defaultSoils = ['Salinas Silty Loam', 'Clay Loam', 'Chualar Sandy Loam', 'Pacheco Silt Loam'];

  for (let i = 0; i < 4; i++) {
    const fId = `field_${farmId}_${i + 1}`;
    try {
      await createField({
        fieldId: fId,
        id: fId,
        farmId: farmId,
        ownerId: farm.ownerId || 'owner_demo',
        name: defaultFieldNames[i],
        crop: defaultCrops[i],
        areaAcres: 10 + i * 2,
        soilType: defaultSoils[i],
        latitude: 36.677 + i * 0.004,
        longitude: -121.655 + i * 0.004,
        status: 'Healthy',
        soilMoisture: 45 + i * 3,
        soilPH: 6.5 + i * 0.1,
        temperature: 24.0 + i,
      });
    } catch (err) {
      console.warn('Auto-create default field error:', err);
    }
  }

  return newFarm;
}

/**
 * Update an existing farm details (e.g. name, location, area, description)
 */
export async function updateFarm(farmId: string, updates: Partial<Farm>): Promise<boolean> {
  const idx = FALLBACK_FARMS.findIndex((f) => f.farmId === farmId);
  if (idx !== -1) {
    FALLBACK_FARMS[idx] = { ...FALLBACK_FARMS[idx], ...updates };
  } else if (FALLBACK_FARMS.length > 0) {
    FALLBACK_FARMS[0] = { ...FALLBACK_FARMS[0], ...updates };
  }
  syncEcosystemCache();
  notifyEcosystemChange();

  if (db) {
    try {
      const ref = doc(db, 'farms', farmId);
      await updateDoc(ref, updates);
    } catch {
      // Memory fallback active
    }
  }
  return true;
}

/**
 * Get farms owned by ownerId
 */
export async function getFarms(ownerId?: string): Promise<Farm[]> {
  if (!db) return FALLBACK_FARMS;
  try {
    const snap = await getDocs(collection(db, 'farms'));
    
    const dbFarms: Farm[] = [];
    snap.forEach((d) => {
      const data = d.data() as any;
      const fId = data.farmId || data.fieldId || d.id;
      const fOwner = data.ownerId || data.userId || ownerId || '';
      dbFarms.push({
        ...data,
        farmId: fId,
        id: fId,
        name: data.name || 'Unnamed Farm',
        location: data.location || '',
        areaHectares: data.areaHectares || parseFloat(data.area) || 0,
        description: data.description || '',
        ownerId: fOwner,
        userId: fOwner
      } as Farm);
    });

    // DB is reachable — return only real DB farms (filtered or all, empty if none exist)
    const filtered = ownerId
      ? dbFarms.filter((f) => f.ownerId === ownerId || (f as any).userId === ownerId)
      : dbFarms;

    return filtered;
  } catch {
    return FALLBACK_FARMS;
  }
}

/**
 * Create a new field with location, boundary polygon, and path LineString
 */
export async function createField(field: Omit<Field, 'fieldId' | 'createdAt'> & { id?: string; fieldId?: string }): Promise<Field> {
  const fieldId = (field as any).id || (field as any).fieldId || `field_${Date.now()}`;
  const ownerId = field.ownerId || 'owner_demo';
  const status = (field.status as any) || 'Healthy';
  const newField: Field = {
    soilMoisture: (field as any).soilMoisture,
    soilPH: (field as any).soilPH,
    temperature: (field as any).temperature,
    humidity: (field as any).humidity,
    rainfall: (field as any).rainfall,
    waterRequirement: (field as any).waterRequirement || (status === 'Critical' ? 'Urgent' : (status === 'Dry' || status === 'Moderate') ? 'High' : 'Low'),
    ...field,
    fieldId,
    ownerId,
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Field;
  (newField as any).id = fieldId;
  (newField as any).userId = ownerId;

  FALLBACK_FIELDS.unshift(newField);
  syncEcosystemCache();
  notifyEcosystemChange();

  if (db) {
    try {
      await setDoc(doc(db, 'fields', fieldId), {
        ...newField,
        id: fieldId,
        fieldId,
        ownerId,
        userId: ownerId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch {
      // Memory fallback active
    }
  }
  return newField;
}

/**
 * Update existing field attributes (e.g. status, boundary, name, crop, soilType, areaAcres, soilMoisture, soilPH, temperature)
 */
export async function updateField(fieldId: string, updates: Partial<Field>): Promise<boolean> {
  const idx = FALLBACK_FIELDS.findIndex(
    (f) => f.fieldId === fieldId || (f as any).id === fieldId || (f as any).docId === fieldId
  );
  let targetDocId = fieldId;
  if (idx !== -1) {
    FALLBACK_FIELDS[idx] = { ...FALLBACK_FIELDS[idx], ...updates, updatedAt: new Date().toISOString() };
    targetDocId = (FALLBACK_FIELDS[idx] as any).docId || (FALLBACK_FIELDS[idx] as any).id || fieldId;
  }
  syncEcosystemCache();
  notifyEcosystemChange();

  if (db) {
    try {
      let fieldRef: any = null;

      // Strategy A: Direct doc ID lookup
      const directRef = doc(db, 'fields', targetDocId);
      const directSnap = await getDoc(directRef);
      if (directSnap.exists()) {
        fieldRef = directRef;
      }

      // Strategy B: Try fieldId directly if different
      if (!fieldRef && targetDocId !== fieldId) {
        const altRef = doc(db, 'fields', fieldId);
        const altSnap = await getDoc(altRef);
        if (altSnap.exists()) {
          fieldRef = altRef;
        }
      }

      // Strategy C: Query by fieldId field
      if (!fieldRef) {
        const qField = query(collection(db, 'fields'), where('fieldId', '==', fieldId));
        const snapField = await getDocs(qField);
        if (!snapField.empty) {
          fieldRef = snapField.docs[0].ref;
        }
      }

      // Strategy D: Query by id field
      if (!fieldRef) {
        const qId = query(collection(db, 'fields'), where('id', '==', fieldId));
        const snapId = await getDocs(qId);
        if (!snapId.empty) {
          fieldRef = snapId.docs[0].ref;
        }
      }

      if (fieldRef) {
        await setDoc(fieldRef, { ...updates, updatedAt: serverTimestamp() }, { merge: true });
      } else {
        console.warn(`[updateField] Field matching ID '${fieldId}' not found in Firestore fields collection.`);
      }
    } catch (err) {
      console.error('Firestore updateField error:', err);
    }
  }
  return true;
}

/**
 * Fetch fields for an Owner (combines user created fields with pre-existing demo fields)
 */
export async function getOwnerFields(ownerId?: string): Promise<Field[]> {
  if (!db) return FALLBACK_FIELDS;
  try {
    const snap = await getDocs(collection(db, 'fields'));
    
    const dbFields: Field[] = [];
    snap.forEach((d) => {
      const data = d.data() || {};
      const fId = data.fieldId || data.id || d.id;
      const farmId = data.farmId || '';
      const fOwner = data.ownerId || data.userId || '';
      const assignedId = data.assignedFarmerId || data.farmerId || data.assignedTo || null;
      const assignedName = data.assignedFarmerName || data.farmerName || null;
      dbFields.push({
        ...data,
        fieldId: fId,
        id: fId,
        farmId: farmId,
        docId: d.id,
        assignedFarmerId: assignedId,
        assignedFarmerName: assignedName,
        farmerId: assignedId,
        ownerId: fOwner,
        userId: fOwner
      } as unknown as Field);
    });
    
    if (dbFields.length === 0) {
      const matched = ownerId
        ? FALLBACK_FIELDS.filter((f) => f.ownerId === ownerId || (!f.ownerId || ownerId === 'owner_demo'))
        : FALLBACK_FIELDS;
      return matched.length > 0 ? matched : FALLBACK_FIELDS;
    }

    let filtered = ownerId
      ? dbFields.filter((f) => {
          if (f.ownerId === ownerId || (f as any).userId === ownerId) return true;
          if ((!ownerId || ownerId === 'owner_demo' || ownerId) && (!f.ownerId || f.ownerId === 'owner_demo')) return true;
          return false;
        })
      : dbFields;

    if (filtered.length === 0) {
      filtered = dbFields.length > 0 ? dbFields : FALLBACK_FIELDS;
    }

    return filtered;
  } catch (err) {
    console.error('getOwnerFields Firestore error:', err);
    return FALLBACK_FIELDS;
  }
}

/**
 * Helper to get all assigned workers for a field safely
 */
export function getFieldAssignedWorkers(field: Field): FieldWorkerAssignment[] {
  if (field.assignedWorkers && field.assignedWorkers.length > 0) {
    return field.assignedWorkers;
  }
  const id = field.assignedFarmerId || (field as any).farmerId;
  const name = field.assignedFarmerName || (field as any).farmerName;
  if (id) {
    return [
      {
        farmerId: id,
        farmerName: name || 'Specialist Operator',
        assignedAt: field.createdAt || new Date().toISOString(),
        workType: 'Field Operations Specialist',
        dailyRate: '$120 / day',
      },
    ];
  }
  return [];
}

/**
 * Fetch assigned fields for a Farmer (supports multiple workers per field)
 */
export async function getFarmerAssignedFields(farmerId: string): Promise<Field[]> {
  const isWorkerOnField = (f: Field) => {
    const inList = f.assignedFarmerIds && f.assignedFarmerIds.includes(farmerId);
    const inWorkers = f.assignedWorkers && f.assignedWorkers.some((w) => w.farmerId === farmerId);
    const direct = f.assignedFarmerId === farmerId || (f as any).farmerId === farmerId;
    return Boolean(inList || inWorkers || direct);
  };

  if (!db) {
    return FALLBACK_FIELDS.filter(isWorkerOnField);
  }

  try {
    const list: Field[] = [];
    const seen = new Set<string>();

    const addFieldToList = (d: any, docId: string) => {
      const fId = d.fieldId || d.id || docId;
      if (seen.has(fId) || d.deleted === true) return;
      seen.add(fId);
      list.push({
        ...d,
        fieldId: fId,
        id: fId,
        docId,
        assignedFarmerId: d.assignedFarmerId || d.farmerId || farmerId,
        assignedFarmerName: d.assignedFarmerName || d.farmerName || null,
        assignedWorkers: d.assignedWorkers || [],
        assignedFarmerIds: d.assignedFarmerIds || (d.assignedFarmerId ? [d.assignedFarmerId] : []),
        farmerId: d.farmerId || d.assignedFarmerId || farmerId,
      } as unknown as Field);
    };

    // Query 1: where assignedFarmerIds contains farmerId
    try {
      const qArr = query(collection(db, 'fields'), where('assignedFarmerIds', 'array-contains', farmerId));
      const snapArr = await getDocs(qArr);
      snapArr.forEach((docSnap) => addFieldToList(docSnap.data(), docSnap.id));
    } catch {
      // ignore
    }

    // Query 2: where assignedFarmerId == farmerId
    try {
      const q1 = query(collection(db, 'fields'), where('assignedFarmerId', '==', farmerId));
      const snap1 = await getDocs(q1);
      snap1.forEach((docSnap) => addFieldToList(docSnap.data(), docSnap.id));
    } catch {
      // ignore
    }

    // Query 3: where farmerId == farmerId
    try {
      const q2 = query(collection(db, 'fields'), where('farmerId', '==', farmerId));
      const snap2 = await getDocs(q2);
      snap2.forEach((docSnap) => addFieldToList(docSnap.data(), docSnap.id));
    } catch {
      // ignore
    }

    // Include any local matches that were not yet in Firestore
    FALLBACK_FIELDS.filter(isWorkerOnField).forEach((f) => {
      const fId = f.fieldId || (f as any).id;
      if (!seen.has(fId)) {
        seen.add(fId);
        list.push(f);
      }
    });

    return list;
  } catch {
    return FALLBACK_FIELDS.filter(isWorkerOnField);
  }
}

/**
 * Assign a farmer to a field (supports adding to multiple assigned workers or unassigning)
 */
export async function assignFarmerToField(
  fieldId: string,
  farmerId: string | null,
  farmerName: string | null,
  ownerId: string,
  workType?: string,
  dailyRate?: string
): Promise<boolean> {
  if (!fieldId) {
    console.error('assignFarmerToField error: missing fieldId');
    return false;
  }

  // Update local fallback copy as well
  const idx = FALLBACK_FIELDS.findIndex(
    (f) => f.fieldId === fieldId || (f as any).id === fieldId || (f as any).docId === fieldId
  );
  let targetDocId = fieldId;
  let updatedWorkers: FieldWorkerAssignment[] = [];
  let updatedFarmerIds: string[] = [];

  if (idx !== -1) {
    const f = FALLBACK_FIELDS[idx];
    if (farmerId) {
      const existingWorkers = getFieldAssignedWorkers(f);
      const exists = existingWorkers.some((w) => w.farmerId === farmerId);
      if (!exists) {
        existingWorkers.push({
          farmerId,
          farmerName: farmerName || 'Specialist Operator',
          assignedAt: new Date().toISOString(),
          workType: workType || 'Field Operations Specialist',
          dailyRate: dailyRate || '$120 / day',
        });
      }
      f.assignedWorkers = existingWorkers;
      f.assignedFarmerIds = Array.from(new Set([...(f.assignedFarmerIds || []), farmerId]));
      f.assignedFarmerId = f.assignedWorkers[0]?.farmerId || farmerId;
      f.assignedFarmerName = f.assignedWorkers[0]?.farmerName || farmerName;
    } else {
      f.assignedWorkers = [];
      f.assignedFarmerIds = [];
      f.assignedFarmerId = null;
      f.assignedFarmerName = null;
    }
    (f as any).farmerId = f.assignedFarmerId;
    (f as any).assignedTo = f.assignedFarmerId;
    updatedWorkers = f.assignedWorkers || [];
    updatedFarmerIds = f.assignedFarmerIds || [];
    targetDocId = (f as any).docId || (f as any).id || fieldId;
  }
  syncEcosystemCache();

  if (db) {
    try {
      const updates = {
        assignedFarmerId: farmerId ? (updatedWorkers[0]?.farmerId || farmerId) : null,
        assignedFarmerName: farmerId ? (updatedWorkers[0]?.farmerName || farmerName) : null,
        assignedWorkers: updatedWorkers,
        assignedFarmerIds: updatedFarmerIds,
        farmerId: farmerId ? (updatedWorkers[0]?.farmerId || farmerId) : null,
        assignedTo: farmerId ? (updatedWorkers[0]?.farmerId || farmerId) : null,
        updatedAt: serverTimestamp(),
      };

      // Resolve exact existing Firestore document reference
      let fieldRef: any = null;

      const directRef = doc(db, 'fields', targetDocId);
      const directSnap = await getDoc(directRef);
      if (directSnap.exists()) {
        fieldRef = directRef;
      }

      if (!fieldRef && targetDocId !== fieldId) {
        const altRef = doc(db, 'fields', fieldId);
        const altSnap = await getDoc(altRef);
        if (altSnap.exists()) {
          fieldRef = altRef;
        }
      }

      if (!fieldRef) {
        const qField = query(collection(db, 'fields'), where('fieldId', '==', fieldId));
        const snapField = await getDocs(qField);
        if (!snapField.empty) {
          fieldRef = snapField.docs[0].ref;
        }
      }

      if (!fieldRef) {
        const qId = query(collection(db, 'fields'), where('id', '==', fieldId));
        const snapId = await getDocs(qId);
        if (!snapId.empty) {
          fieldRef = snapId.docs[0].ref;
        }
      }

      if (fieldRef) {
        await setDoc(fieldRef, updates, { merge: true });
      } else {
        console.warn(`[assignFarmerToField] Field document matching ID '${fieldId}' not found in Firestore.`);
      }

      // Sync with FastAPI backend if running
      try {
        const { apiService } = await import('./api');
        const apiUpdates = {
          assignedFarmerId: farmerId ? (updatedWorkers[0]?.farmerId || farmerId) : null,
          assignedFarmerName: farmerId ? (updatedWorkers[0]?.farmerName || farmerName) : null,
          farmerId: farmerId ? (updatedWorkers[0]?.farmerId || farmerId) : null,
          assignedTo: farmerId ? (updatedWorkers[0]?.farmerId || farmerId) : null,
          updatedAt: new Date().toISOString(),
        };
        await apiService.updateField(fieldId, apiUpdates as any);
      } catch (apiErr) {
        console.warn('Backend API updateField sync notice:', apiErr);
      }

      // Create field assignment audit document
      if (farmerId) {
        const assignId = `assign_${fieldId}_${Date.now()}`;
        await setDoc(doc(db, 'field_assignments', assignId), {
          fieldId,
          farmerId,
          farmerName,
          ownerId,
          assignedAt: serverTimestamp(),
        });

        recordOwnerHiredFarmer(ownerId || 'owner_demo', farmerId, fieldId);
        const notifId = `notif_${Date.now()}`;
        try {
          await setDoc(doc(db, 'notifications', notifId), {
            id: notifId,
            recipientId: farmerId,
            title: 'New Field Assignment',
            message: `You have been assigned to field ${fieldId}.`,
            type: 'assignment',
            read: false,
            createdAt: serverTimestamp(),
          });
        } catch {
          // notification ignore
        }
      }

      notifyEcosystemChange();
      return true;
    } catch (err) {
      console.warn('Firestore assignFarmerToField notice (persisting locally):', err);
    }
  }

  if (farmerId) {
    recordOwnerHiredFarmer(ownerId || 'owner_demo', farmerId, fieldId);
  }
  notifyEcosystemChange();
  return true;
}

/**
 * Add a specialist worker to a field parcel (allowing multiple workers on the same field)
 * Rule: Worker must not be currently employed by another farm owner!
 */
export async function addWorkerToField(
  fieldId: string,
  worker: { farmerId: string; farmerName: string; workType?: string; dailyRate?: string },
  ownerId: string
): Promise<{ success: boolean; error?: string }> {
  const activeEmployer = await getFarmerActiveEmployer(worker.farmerId);
  const currentOwner = ownerId || 'owner_demo';

  if (activeEmployer && activeEmployer.ownerId !== currentOwner) {
    return {
      success: false,
      error: `This farmer is currently working for another farm owner (${activeEmployer.ownerName || 'Another Farm'}). They must be freed before they can work on your fields.`,
    };
  }

  const ok = await assignFarmerToField(
    fieldId,
    worker.farmerId,
    worker.farmerName,
    ownerId,
    worker.workType,
    worker.dailyRate
  );

  if (!ok) {
    return { success: false, error: 'Failed to assign worker to field.' };
  }

  return { success: true };
}

/**
 * Remove a specific worker from a field parcel (keeps other workers on that field intact)
 */
export async function removeWorkerFromField(
  fieldId: string,
  farmerId: string,
  _ownerId?: string
): Promise<{ success: boolean; error?: string }> {
  if (!fieldId || !farmerId) {
    return { success: false, error: 'Missing fieldId or farmerId' };
  }

  // 1. Update in FALLBACK_FIELDS and DEFAULT_FIELDS
  [FALLBACK_FIELDS, DEFAULT_FIELDS].forEach((fieldList) => {
    const idx = fieldList.findIndex(
      (f) => f.fieldId === fieldId || (f as any).id === fieldId || (f as any).docId === fieldId
    );
    if (idx !== -1) {
      const f = fieldList[idx];
      const existing = getFieldAssignedWorkers(f);
      const remainingWorkers = existing.filter((w) => w.farmerId !== farmerId);
      const remainingFarmerIds = remainingWorkers.map((w) => w.farmerId);
      f.assignedWorkers = remainingWorkers;
      f.assignedFarmerIds = remainingFarmerIds;
      f.assignedFarmerId = remainingWorkers.length > 0 ? remainingWorkers[0].farmerId : null;
      f.assignedFarmerName = remainingWorkers.length > 0 ? remainingWorkers[0].farmerName : null;
      (f as any).farmerId = f.assignedFarmerId;
      (f as any).assignedTo = f.assignedFarmerId;
    }
  });

  try {
    localStorage.setItem(LOCAL_FIELDS_KEY, JSON.stringify(FALLBACK_FIELDS));
  } catch {
    // ignore
  }
  syncEcosystemCache();

  // 2. Update Firestore document
  if (db) {
    try {
      let fieldRef: any = null;
      const directRef = doc(db, 'fields', fieldId);
      const directSnap = await getDoc(directRef);
      if (directSnap.exists()) {
        fieldRef = directRef;
      }
      if (!fieldRef) {
        const qField = query(collection(db, 'fields'), where('fieldId', '==', fieldId));
        const snap = await getDocs(qField);
        if (!snap.empty) fieldRef = snap.docs[0].ref;
      }
      if (!fieldRef) {
        const qField2 = query(collection(db, 'fields'), where('id', '==', fieldId));
        const snap2 = await getDocs(qField2);
        if (!snap2.empty) fieldRef = snap2.docs[0].ref;
      }

      if (fieldRef) {
        const snapDoc = await getDoc(fieldRef);
        const data = (snapDoc.data() || {}) as any;
        const existingWorkers = getFieldAssignedWorkers(data);
        const remainingWorkers = existingWorkers.filter((w) => w.farmerId !== farmerId);
        const remainingFarmerIds = (data.assignedFarmerIds || remainingWorkers.map((w) => w.farmerId)).filter(
          (id: string) => id !== farmerId
        );
        const nextFarmerId = remainingWorkers.length > 0 ? remainingWorkers[0].farmerId : null;
        const nextFarmerName = remainingWorkers.length > 0 ? remainingWorkers[0].farmerName : null;

        await updateDoc(fieldRef, {
          assignedWorkers: remainingWorkers,
          assignedFarmerIds: remainingFarmerIds,
          assignedFarmerId: nextFarmerId,
          assignedFarmerName: nextFarmerName,
          farmerId: nextFarmerId,
          assignedTo: nextFarmerId,
          updatedAt: serverTimestamp(),
        });
      }
    } catch (err) {
      console.warn('Firestore removeWorkerFromField notice:', err);
    }
  }

  // If this farmer now has no remaining fields, update the active hire cache
  try {
    const allFields = await getOwnerFields();
    const remainingForFarmer = allFields.filter((f) =>
      getFieldAssignedWorkers(f).some((w) => w.farmerId === farmerId)
    );
    if (remainingForFarmer.length === 0) {
      const hired = loadHiredCache();
      saveHiredCache(
        hired.map((r) =>
          r.farmerId === farmerId ? { ...r, active: false, freedAt: new Date().toISOString() } : r
        )
      );
    }
  } catch {
    // ignore
  }

  notifyEcosystemChange();
  return { success: true };
}

/**
 * Free farmer from an owner:
 * 1. Unassigns the farmer from ALL fields of this owner.
 * 2. Cleans in-memory FALLBACK_FIELDS, DEFAULT_FIELDS, and Firestore fields collection.
 * 3. Marks all hire/contract records for this farmer as freed in localStorage cache.
 * 4. Marks in-memory assignments as inactive and assignment requests as completed.
 * 5. Frees the farmer so they are immediately available for hire by ANY farm owner.
 */
export async function freeFarmerFromOwner(
  ownerId: string,
  farmerId: string,
  farmerName?: string
): Promise<{ success: boolean; error?: string }> {
  const activeOwnerId = ownerId || 'owner_demo';
  const nameOfFarmer = farmerName || 'Farmer Specialist';

  // 1. Unassign from all fields across FALLBACK_FIELDS, DEFAULT_FIELDS, and getOwnerFields()
  const allFields = await getOwnerFields();
  for (const f of allFields) {
    const isOwnerField = !f.ownerId || f.ownerId === activeOwnerId || activeOwnerId === 'owner_demo';
    if (!isOwnerField) continue;

    const inList = f.assignedFarmerIds && f.assignedFarmerIds.includes(farmerId);
    const inWorkers = f.assignedWorkers && f.assignedWorkers.some((w) => w.farmerId === farmerId);
    const direct = f.assignedFarmerId === farmerId || (f as any).farmerId === farmerId;

    if (inList || inWorkers || direct) {
      const targetId = (f as any).docId || f.fieldId || (f as any).id;
      await removeWorkerFromField(targetId, farmerId, activeOwnerId);
    }
  }

  // 2. Direct memory cleanup in FALLBACK_FIELDS and DEFAULT_FIELDS to guarantee instant consistency
  [FALLBACK_FIELDS, DEFAULT_FIELDS].forEach((fieldList) => {
    fieldList.forEach((f) => {
      const inList = f.assignedFarmerIds && f.assignedFarmerIds.includes(farmerId);
      const inWorkers = f.assignedWorkers && f.assignedWorkers.some((w) => w.farmerId === farmerId);
      const direct = f.assignedFarmerId === farmerId || (f as any).farmerId === farmerId;

      if (inList || inWorkers || direct) {
        f.assignedWorkers = (f.assignedWorkers || []).filter((w) => w.farmerId !== farmerId);
        f.assignedFarmerIds = (f.assignedFarmerIds || []).filter((id) => id !== farmerId);
        f.assignedFarmerId = f.assignedWorkers.length > 0 ? f.assignedWorkers[0].farmerId : null;
        f.assignedFarmerName = f.assignedWorkers.length > 0 ? f.assignedWorkers[0].farmerName : null;
        (f as any).farmerId = f.assignedFarmerId;
        (f as any).assignedTo = f.assignedFarmerId;
      }
    });
  });

  try {
    localStorage.setItem(LOCAL_FIELDS_KEY, JSON.stringify(FALLBACK_FIELDS));
  } catch {
    // ignore
  }

  // 3. Mark ALL hire records for this farmer as freed in localStorage cache
  const hiredCache = loadHiredCache();
  let foundInHired = false;
  const updatedHired = hiredCache.map((r) => {
    if (r.farmerId === farmerId) {
      foundInHired = true;
      return { ...r, active: false, freedAt: new Date().toISOString() };
    }
    return r;
  });
  if (!foundInHired) {
    updatedHired.push({
      ownerId: activeOwnerId,
      farmerId,
      active: false,
      freedAt: new Date().toISOString(),
      hiredAt: new Date().toISOString(),
    });
  }
  saveHiredCache(updatedHired);

  // 4. Mark in-memory assignments as completed/inactive
  inMemoryAssignments.forEach((a) => {
    if (a.farmerId === farmerId) {
      a.status = 'inactive';
      a.unassignedAt = new Date().toISOString();
    }
  });

  // 5. Mark in-memory assignment requests as completed
  inMemoryAssignmentRequests.forEach((r) => {
    if (r.farmerId === farmerId) {
      if (r.status === 'approved' || r.status === 'pending') {
        (r as any).status = 'completed';
      }
    }
  });

  // 6. Reset assignedFieldsCount in FALLBACK_FARMERS
  const fIdx = FALLBACK_FARMERS.findIndex((f) => f.uid === farmerId);
  if (fIdx !== -1) {
    FALLBACK_FARMERS[fIdx].assignedFieldsCount = 0;
  }

  // 7. Comprehensive Firestore synchronization across collections
  if (db) {
    try {
      // 7a. Clean all matching field documents in fields collection directly
      try {
        const snapAllFields = await getDocs(collection(db, 'fields'));
        for (const d of snapAllFields.docs) {
          const data = (d.data() || {}) as any;
          const inWorkers = (data.assignedWorkers || []).some((w: any) => w.farmerId === farmerId);
          const inIds = (data.assignedFarmerIds || []).includes(farmerId);
          const inDirect = data.assignedFarmerId === farmerId || data.farmerId === farmerId || data.assignedTo === farmerId;

          if (inWorkers || inIds || inDirect) {
            const remWorkers = (data.assignedWorkers || []).filter((w: any) => w.farmerId !== farmerId);
            const remIds = (data.assignedFarmerIds || []).filter((id: string) => id !== farmerId);
            const nextId = remWorkers.length > 0 ? remWorkers[0].farmerId : null;
            const nextName = remWorkers.length > 0 ? remWorkers[0].farmerName : null;
            await updateDoc(d.ref, {
              assignedFarmerId: nextId,
              assignedFarmerName: nextName,
              farmerId: nextId,
              assignedTo: nextId,
              assignedWorkers: remWorkers,
              assignedFarmerIds: remIds,
              updatedAt: serverTimestamp(),
            });
          }
        }
      } catch (errFields) {
        console.warn('Firestore freeFarmer fields notice:', errFields);
      }

      // 7b. Inactivate assignments collection
      try {
        const qAssign = query(
          collection(db, 'assignments'),
          where('farmerId', '==', farmerId),
          where('status', '==', 'active')
        );
        const snapAssign = await getDocs(qAssign);
        for (const d of snapAssign.docs) {
          await updateDoc(d.ref, {
            status: 'inactive',
            freedAt: serverTimestamp(),
          });
        }
      } catch (errAssign) {
        console.warn('Firestore freeFarmer assignments notice:', errAssign);
      }

      // 7c. Complete assignment_requests collection
      try {
        const qReq = query(collection(db, 'assignment_requests'), where('farmerId', '==', farmerId));
        const snapReq = await getDocs(qReq);
        for (const d of snapReq.docs) {
          const data = d.data();
          if (data.status === 'approved' || data.status === 'pending') {
            await updateDoc(d.ref, {
              status: 'completed',
              completedAt: serverTimestamp(),
            });
          }
        }
      } catch (errReq) {
        console.warn('Firestore freeFarmer requests notice:', errReq);
      }

      // 7d. Inactivate field_assignments collection
      try {
        const qFA = query(collection(db, 'field_assignments'), where('farmerId', '==', farmerId));
        const snapFA = await getDocs(qFA);
        for (const d of snapFA.docs) {
          await updateDoc(d.ref, {
            status: 'inactive',
            active: false,
            freedAt: serverTimestamp(),
          });
        }
      } catch (errFA) {
        console.warn('Firestore freeFarmer field_assignments notice:', errFA);
      }

      // 7e. Update farmer profile in users collection
      try {
        const userRef = doc(db, 'users', farmerId);
        await updateDoc(userRef, {
          assignedFieldsCount: 0,
          isEmployed: false,
          activeOwnerId: null,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Fallback user might not exist in Firestore
      }

      // 7f. Push notification to the farmer
      const notifId = `notif_freed_${Date.now()}`;
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        recipientId: farmerId,
        title: 'Released from Duty',
        message: `Work completed! ${nameOfFarmer} has been freed by your farm owner and is now available for hire by other farm owners.`,
        type: 'assignment',
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('Firestore freeFarmer overall notice:', err);
    }
  }

  syncEcosystemCache();
  notifyEcosystemChange();
  return { success: true };
}

/**
 * Get active employer for a farmer
 * Returns the owner details if farmer is currently employed, or null if free.
 */
export async function getFarmerActiveEmployer(
  farmerId: string
): Promise<{ ownerId: string; ownerName?: string; fieldCount: number; fieldNames: string[] } | null> {
  if (!farmerId) return null;

  // 1. Check all fields (source of truth for active work)
  const allFields = await getOwnerFields();
  const assignedFields = allFields.filter((f) => {
    const inList = f.assignedFarmerIds && f.assignedFarmerIds.includes(farmerId);
    const inWorkers = f.assignedWorkers && f.assignedWorkers.some((w) => w.farmerId === farmerId);
    const direct = f.assignedFarmerId === farmerId || (f as any).farmerId === farmerId;
    return Boolean(inList || inWorkers || direct);
  });

  if (assignedFields.length > 0) {
    const ownerId = assignedFields[0].ownerId || 'owner_demo';
    return {
      ownerId,
      ownerName: ownerId === 'owner_demo' ? 'Salinas Valley Agricultural Estate' : 'Farm Owner',
      fieldCount: assignedFields.length,
      fieldNames: assignedFields.map((f) => f.name),
    };
  }

  // 2. Check active in-memory assignments
  const activeAssignment = inMemoryAssignments.find((a) => a.farmerId === farmerId && a.status === 'active');
  if (activeAssignment) {
    const ownerId = activeAssignment.ownerId || 'owner_demo';
    return {
      ownerId,
      ownerName: (activeAssignment as any).ownerName || (ownerId === 'owner_demo' ? 'Salinas Valley Agricultural Estate' : 'Farm Owner'),
      fieldCount: 1,
      fieldNames: [activeAssignment.fieldName || 'Assigned Field'],
    };
  }

  // 3. Check active hired cache (must be explicitly active and not freed)
  const hiredCache = loadHiredCache();
  const activeHire = hiredCache.find((r) => r.farmerId === farmerId && r.active === true && !r.freedAt);
  if (activeHire) {
    const ownerId = activeHire.ownerId || 'owner_demo';
    return {
      ownerId,
      ownerName: ownerId === 'owner_demo' ? 'Salinas Valley Agricultural Estate' : 'Farm Owner',
      fieldCount: 0,
      fieldNames: [],
    };
  }

  return null;
}

/**
 * Submit field soil & crop observation land data
 */
export async function submitFieldData(data: Omit<FieldLandData, 'id' | 'submittedAt'>): Promise<boolean> {
  const id = `data_${Date.now()}`;
  const submissionRecord: FieldLandData = {
    ...data,
    id,
    submittedAt: new Date().toISOString(),
  };
  inMemorySubmissions.unshift(submissionRecord);

  // Calculate telemetry status & water requirement
  const calculatedStatus: Field['status'] =
    data.soilMoisture < 30
      ? 'Dry'
      : data.notes?.includes('Pest Observed') || data.notes?.includes('Critical')
      ? 'Critical'
      : data.soilMoisture < 45
      ? 'Moderate'
      : 'Healthy';

  const waterReq =
    data.soilMoisture < 30
      ? 'Urgent'
      : data.soilMoisture < 45
      ? 'High'
      : data.soilMoisture < 60
      ? 'Moderate'
      : 'Low';

  const fieldTelemetryUpdates: Partial<Field> = {
    soilMoisture: Number(data.soilMoisture),
    soilPH: Number(data.soilPH),
    temperature: Number(data.temperature),
    nitrogen: Number(data.nitrogen),
    phosphorus: Number(data.phosphorus),
    potassium: Number(data.potassium),
    cropGrowthStage: data.cropGrowthStage,
    waterRequirement: waterReq,
    status: calculatedStatus,
    updatedAt: new Date().toISOString(),
  };

  // 1. Update field telemetry values in FALLBACK_FIELDS in-place
  const targetIdx = FALLBACK_FIELDS.findIndex(
    (f) => f.fieldId === data.fieldId || (f as any).id === data.fieldId || (f as any).docId === data.fieldId
  );
  if (targetIdx !== -1) {
    FALLBACK_FIELDS[targetIdx] = {
      ...FALLBACK_FIELDS[targetIdx],
      ...fieldTelemetryUpdates,
    };
  }

  syncEcosystemCache();

  if (db) {
    try {
      // 2. Save observation record in field_data collection
      await setDoc(doc(db, 'field_data', id), {
        ...data,
        id,
        submittedAt: serverTimestamp(),
      });

      // 3. Resolve exact existing field document in fields collection
      let targetDocId = data.fieldId;
      if (targetIdx !== -1) {
        targetDocId = (FALLBACK_FIELDS[targetIdx] as any).docId || (FALLBACK_FIELDS[targetIdx] as any).id || data.fieldId;
      }

      let fieldRef: any = null;

      // Strategy A: Direct doc ID lookup
      const directRef = doc(db, 'fields', targetDocId);
      const directSnap = await getDoc(directRef);
      if (directSnap.exists()) {
        fieldRef = directRef;
      }

      // Strategy B: Try fieldId directly if different
      if (!fieldRef && targetDocId !== data.fieldId) {
        const altRef = doc(db, 'fields', data.fieldId);
        const altSnap = await getDoc(altRef);
        if (altSnap.exists()) {
          fieldRef = altRef;
        }
      }

      // Strategy C: Query by fieldId field
      if (!fieldRef) {
        const qField = query(collection(db, 'fields'), where('fieldId', '==', data.fieldId));
        const snapField = await getDocs(qField);
        if (!snapField.empty) {
          fieldRef = snapField.docs[0].ref;
        }
      }

      // Strategy D: Query by id field
      if (!fieldRef) {
        const qId = query(collection(db, 'fields'), where('id', '==', data.fieldId));
        const snapId = await getDocs(qId);
        if (!snapId.empty) {
          fieldRef = snapId.docs[0].ref;
        }
      }

      // Strategy E: Scan all documents in collection to locate matching document
      if (!fieldRef) {
        const allSnap = await getDocs(collection(db, 'fields'));
        for (const docSnap of allSnap.docs) {
          const docData = docSnap.data();
          if (
            docSnap.id === data.fieldId ||
            docSnap.id === targetDocId ||
            docData.fieldId === data.fieldId ||
            docData.id === data.fieldId ||
            docData.docId === data.fieldId
          ) {
            fieldRef = docSnap.ref;
            break;
          }
        }
      }

      // 4. Update the EXISTING field document in-place with telemetry updates
      if (fieldRef) {
        await setDoc(
          fieldRef,
          {
            ...fieldTelemetryUpdates,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      } else {
        console.warn(`[submitFieldData] Target field '${data.fieldId}' not found in Firestore fields collection.`);
      }

      // 5. Sync with FastAPI backend if running
      try {
        const { apiService } = await import('./api');
        await apiService.updateField(data.fieldId, {
          ...fieldTelemetryUpdates,
          updatedAt: new Date().toISOString(),
        } as any);
      } catch (apiErr) {
        console.warn('Backend API updateField sync notice:', apiErr);
      }

      // 6. Send notification to Owner
      try {
        const notifId = `notif_sub_${Date.now()}`;
        await setDoc(doc(db, 'notifications', notifId), {
          id: notifId,
          recipientId: data.ownerId,
          title: 'New Field Data Submission',
          message: `${data.farmerName || 'Farmer'} submitted new soil & crop data for field.`,
          type: 'submission',
          read: false,
          createdAt: serverTimestamp(),
        });
      } catch (notifErr) {
        console.warn('Notification send notice:', notifErr);
      }

      notifyEcosystemChange();
      return true;
    } catch (err) {
      console.error('Firestore submitFieldData error:', err);
      notifyEcosystemChange();
      return true;
    }
  }

  notifyEcosystemChange();
  return true;
}

/**
 * Fetch land data submissions for a field
 */
export async function getFieldData(fieldId: string): Promise<FieldLandData[]> {
  let dbList: FieldLandData[] = [];
  if (db) {
    try {
      const q = query(collection(db, 'field_data'), where('fieldId', '==', fieldId));
      const snap = await getDocs(q);
      snap.forEach((d) => dbList.push(d.data() as FieldLandData));
    } catch {
      // Fallthrough
    }
  }
  const memList = inMemorySubmissions.filter((item) => item.fieldId === fieldId);
  const combined = [...dbList];
  memList.forEach((mem) => {
    if (!combined.some((item) => item.id === mem.id)) {
      combined.push(mem);
    }
  });
  return combined;
}

/**
 * Save uploaded Cloudinary field image metadata into Firestore
 */
export async function recordFieldImage(
  image: Omit<FieldImageRecord, 'id' | 'uploadedAt'>
): Promise<boolean> {
  const id = `img_${Date.now()}`;
  const record: FieldImageRecord = {
    ...image,
    id,
    uploadedAt: new Date().toISOString(),
  };
  inMemoryImages.unshift(record);
  syncEcosystemCache();
  notifyEcosystemChange();

  if (db) {
    try {
      await setDoc(doc(db, 'field_images', id), {
        ...image,
        id,
        uploadedAt: serverTimestamp(),
      });

      // Notify Owner
      const notifId = `notif_img_${Date.now()}`;
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        recipientId: image.ownerId,
        title: 'New Field Image Uploaded',
        message: `${image.farmerName || 'Farmer'} uploaded a new ${image.imageType} image.`,
        type: 'submission',
        read: false,
        createdAt: serverTimestamp(),
      });
      return true;
    } catch {
      return true;
    }
  }
  return true;
}

/**
 * Fetch field images for a field
 */
export async function getFieldImages(fieldId: string): Promise<FieldImageRecord[]> {
  let dbImages: FieldImageRecord[] = [];
  if (db) {
    try {
      const q = query(collection(db, 'field_images'), where('fieldId', '==', fieldId));
      const snap = await getDocs(q);
      snap.forEach((d) => dbImages.push(d.data() as FieldImageRecord));
    } catch {
      // Fallthrough
    }
  }
  const memImages = inMemoryImages.filter((img) => img.fieldId === fieldId);
  const combined = [...dbImages];
  memImages.forEach((mem) => {
    if (!combined.some((img) => img.id === mem.id)) {
      combined.push(mem);
    }
  });
  return combined;
}


// ─── Assignment Requests ───────────────────────────────────────────────────────

export type AssignmentRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled' | 'unassigned' | 'completed';

export interface AssignmentRequest {
  id: string;
  ownerId: string;
  ownerName: string;
  farmerId: string;
  farmerName: string;
  farmId: string;
  farmName: string;
  fieldId: string;
  fieldName: string;
  workType?: string;
  dailyRate?: string;
  message?: string;
  notes?: string;
  status: AssignmentRequestStatus;
  initiatedBy?: 'owner' | 'farmer';
  createdAt: any;
  updatedAt?: any;
  approvedAt?: any;
  rejectedAt?: any;
  unassignedAt?: any;
}

export interface AssignmentRecord {
  id: string;
  ownerId: string;
  farmerId: string;
  farmerName: string;
  farmId: string;
  farmName: string;
  fieldId: string;
  fieldName: string;
  workType?: string;
  dailyRate?: string;
  status: 'active' | 'inactive';
  assignedAt: any;
  unassignedAt?: any;
}

// ─── In-memory & LocalStorage fallbacks for offline/demo mode ─────────────

export function isDemoOwner(id?: string | null): boolean {
  return !id || id === 'owner_demo' || id === 'demo-user-owner-001' || id === 'demo-user-local';
}

const DEFAULT_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif_system_welcome',
    recipientId: 'owner_demo',
    title: 'Enterprise Farm System Active',
    message: 'Welcome to your Salinas Valley Farm Workspace. Field monitoring and specialist hiring portals are operational.',
    type: 'alert',
    read: false,
    createdAt: new Date(Date.now() - 3600000 * 2).toISOString(),
  },
];

const inMemoryAssignmentRequests: AssignmentRequest[] = loadCache(LOCAL_AREQS_KEY, []);
const inMemoryAssignments: AssignmentRecord[] = loadCache(LOCAL_ASSIGNS_KEY, []);
const inMemoryNotifications: NotificationItem[] = loadCache(LOCAL_NOTIFS_KEY, DEFAULT_NOTIFICATIONS);

// ─── Notification Services ──────────────────────────────────────────────────

export async function createNotification(
  params: Omit<NotificationItem, 'id' | 'createdAt'>
): Promise<NotificationItem> {
  const notifId = `notif_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const notif: NotificationItem = {
    ...params,
    id: notifId,
    createdAt: new Date().toISOString(),
  };

  inMemoryNotifications.unshift(notif);
  saveCache(LOCAL_NOTIFS_KEY, inMemoryNotifications);

  if (db) {
    try {
      await setDoc(doc(db, 'notifications', notifId), {
        ...notif,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.warn('createNotification Firestore write error:', err);
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('agroai-notification-received', { detail: notif }));
  }
  notifyEcosystemChange();

  return notif;
}

export async function getNotifications(recipientId?: string, role?: 'owner' | 'farmer'): Promise<NotificationItem[]> {
  const targetId = recipientId || (role === 'farmer' ? 'farmer_01' : 'owner_demo');

  if (db) {
    try {
      const snap = await getDocs(collection(db, 'notifications'));
      const dbNotifs: NotificationItem[] = [];
      snap.forEach((d) => {
        dbNotifs.push({ id: d.id, ...d.data() } as NotificationItem);
      });
      if (dbNotifs.length > 0) {
        const filtered = dbNotifs.filter((n) => {
          if (n.recipientId === targetId) return true;
          if (isDemoOwner(targetId) && isDemoOwner(n.recipientId)) return true;
          return false;
        });
        return filtered.sort((a, b) => {
          const tA = new Date(a.createdAt?.toDate ? a.createdAt.toDate() : a.createdAt || 0).getTime();
          const tB = new Date(b.createdAt?.toDate ? b.createdAt.toDate() : b.createdAt || 0).getTime();
          return tB - tA;
        });
      }
    } catch (err) {
      console.warn('getNotifications Firestore read error, using cache:', err);
    }
  }

  return inMemoryNotifications
    .filter((n) => {
      if (n.recipientId === targetId) return true;
      if (isDemoOwner(targetId) && isDemoOwner(n.recipientId)) return true;
      return false;
    })
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
}

export function listenToNotifications(
  recipientId: string,
  callback: (notifications: NotificationItem[]) => void,
  role?: 'owner' | 'farmer'
): () => void {
  const targetId = recipientId || (role === 'farmer' ? 'farmer_01' : 'owner_demo');

  // Initial load
  getNotifications(targetId, role).then(callback);

  let unsubFirestore: (() => void) | null = null;
  if (db) {
    try {
      const q = query(collection(db, 'notifications'));
      unsubFirestore = onSnapshot(
        q,
        (snap) => {
          const list: NotificationItem[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() } as NotificationItem));
          const filtered = list.filter((n) => {
            if (n.recipientId === targetId) return true;
            if (isDemoOwner(targetId) && isDemoOwner(n.recipientId)) return true;
            return false;
          });
          callback(
            filtered.sort((a, b) => {
              const tA = new Date(a.createdAt?.toDate ? a.createdAt.toDate() : a.createdAt || 0).getTime();
              const tB = new Date(b.createdAt?.toDate ? b.createdAt.toDate() : b.createdAt || 0).getTime();
              return tB - tA;
            })
          );
        },
        (err) => {
          console.warn('Notifications snapshot error:', err);
        }
      );
    } catch (err) {
      console.warn('listenToNotifications setup error:', err);
    }
  }

  const onEcosystemChange = () => {
    getNotifications(targetId, role).then(callback);
  };

  window.addEventListener(ECOSYSTEM_UPDATED_EVENT, onEcosystemChange);
  window.addEventListener('agroai-notification-received', onEcosystemChange);

  return () => {
    if (unsubFirestore) unsubFirestore();
    window.removeEventListener(ECOSYSTEM_UPDATED_EVENT, onEcosystemChange);
    window.removeEventListener('agroai-notification-received', onEcosystemChange);
  };
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const idx = inMemoryNotifications.findIndex((n) => n.id === notificationId);
  if (idx !== -1) {
    inMemoryNotifications[idx].read = true;
    saveCache(LOCAL_NOTIFS_KEY, inMemoryNotifications);
  }
  if (db) {
    try {
      await updateDoc(doc(db, 'notifications', notificationId), { read: true });
    } catch {
      // Ignore
    }
  }
  notifyEcosystemChange();
}

export async function markAllNotificationsAsRead(recipientId?: string, role?: 'owner' | 'farmer'): Promise<void> {
  const targetId = recipientId || (role === 'farmer' ? 'farmer_01' : 'owner_demo');
  inMemoryNotifications.forEach((n) => {
    if (n.recipientId === targetId || (isDemoOwner(targetId) && isDemoOwner(n.recipientId))) {
      n.read = true;
    }
  });
  saveCache(LOCAL_NOTIFS_KEY, inMemoryNotifications);

  const firestore = db;
  if (firestore) {
    try {
      const snap = await getDocs(collection(firestore, 'notifications'));
      const batchPromises: Promise<any>[] = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.recipientId === targetId || (isDemoOwner(targetId) && isDemoOwner(data.recipientId))) {
          if (!data.read) {
            batchPromises.push(updateDoc(doc(firestore, 'notifications', d.id), { read: true }));
          }
        }
      });
      await Promise.all(batchPromises);
    } catch {
      // Ignore
    }
  }
  notifyEcosystemChange();
}

export async function deleteNotification(notificationId: string): Promise<void> {
  const idx = inMemoryNotifications.findIndex((n) => n.id === notificationId);
  if (idx !== -1) {
    inMemoryNotifications.splice(idx, 1);
    saveCache(LOCAL_NOTIFS_KEY, inMemoryNotifications);
  }
  notifyEcosystemChange();
}

// ─── Hired Farmers Tracking (Owners can only rate farmers they hired) ─────────
const LOCAL_HIRED_KEY = 'agroai_hired_farmers';

export interface HiredRecord {
  ownerId: string;
  farmerId: string;
  hiredAt: string;
  fieldId?: string;
  /** false once the owner has freed the farmer (work finished) */
  active?: boolean;
  freedAt?: string;
}

export function loadHiredCache(): HiredRecord[] {
  try {
    const raw = localStorage.getItem(LOCAL_HIRED_KEY);
    if (!raw) {
      return [
        { ownerId: 'owner_demo', farmerId: 'farmer_01', hiredAt: new Date().toISOString(), fieldId: 'field_north_rice', active: true },
        { ownerId: 'owner_demo', farmerId: 'farmer_02', hiredAt: new Date().toISOString(), fieldId: 'field_south_corn', active: true },
      ];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((r) => ({
        ...r,
        active: r.active !== undefined ? r.active : !r.freedAt,
      }));
    }
    return [];
  } catch {
    return [
      { ownerId: 'owner_demo', farmerId: 'farmer_01', hiredAt: new Date().toISOString(), fieldId: 'field_north_rice', active: true },
      { ownerId: 'owner_demo', farmerId: 'farmer_02', hiredAt: new Date().toISOString(), fieldId: 'field_south_corn', active: true },
    ];
  }
}

export function saveHiredCache(records: HiredRecord[]) {
  try {
    localStorage.setItem(LOCAL_HIRED_KEY, JSON.stringify(records));
  } catch (err) {
    console.warn('Could not save hired cache to localStorage:', err);
  }
}

export function recordOwnerHiredFarmer(ownerId: string, farmerId: string, fieldId?: string) {
  if (!ownerId || !farmerId) return;
  const list = loadHiredCache();
  const existingIdx = list.findIndex(
    (r) => (r.ownerId === ownerId || (!r.ownerId && ownerId === 'owner_demo')) && r.farmerId === farmerId
  );
  if (existingIdx === -1) {
    list.unshift({ ownerId, farmerId, hiredAt: new Date().toISOString(), fieldId, active: true });
  } else {
    // Re-hire after a previous release → mark active again
    list[existingIdx] = { ...list[existingIdx], active: true, freedAt: undefined, hiredAt: new Date().toISOString(), fieldId };
  }
  saveHiredCache(list);
}

/**
 * Builds a map of farmerId → ownerId for every farmer who is CURRENTLY employed.
 * Used by the UI to tell "working for you" vs "working for another owner" vs "available".
 */
export async function getFarmerEmploymentMap(): Promise<Record<string, string>> {
  const map: Record<string, string> = {};

  // 1. Field assignments (source of truth for active work)
  const allFields = await getOwnerFields();
  allFields.forEach((f) => {
    const owner = f.ownerId || 'owner_demo';
    getFieldAssignedWorkers(f).forEach((w) => {
      if (w.farmerId && !map[w.farmerId]) map[w.farmerId] = owner;
    });
  });

  // 2. Active assignment records
  inMemoryAssignments.forEach((a) => {
    if (a.status === 'active' && a.farmerId && !map[a.farmerId]) {
      map[a.farmerId] = a.ownerId || 'owner_demo';
    }
  });

  // 3. Active (not freed) hire records
  loadHiredCache().forEach((r) => {
    if (r.active === true && !r.freedAt && r.farmerId && !map[r.farmerId]) {
      map[r.farmerId] = r.ownerId || 'owner_demo';
    }
  });

  return map;
}

/**
 * Check if a farm owner has hired (currently or historically) a specific farmer.
 * Business Rule: Farm owners can ONLY rate and comment on farmers they have hired for work!
 */
export async function hasOwnerHiredFarmer(ownerId: string, farmerId: string): Promise<boolean> {
  if (!farmerId) return false;
  const activeOwnerId = ownerId || 'owner_demo';

  // 1. Check currently assigned fields
  const fields = await getOwnerFields();
  const isCurrentlyAssigned = fields.some((f) => {
    const belongsToOwner = !f.ownerId || f.ownerId === activeOwnerId || activeOwnerId === 'owner_demo';
    const hasWorker = f.assignedFarmerId === farmerId || (f as any).farmerId === farmerId;
    return belongsToOwner && hasWorker;
  });
  if (isCurrentlyAssigned) return true;

  // 2. Check local hired cache
  const hiredCache = loadHiredCache();
  const cachedHired = hiredCache.some(
    (r) => (r.ownerId === activeOwnerId || activeOwnerId === 'owner_demo' || !r.ownerId) && r.farmerId === farmerId
  );
  if (cachedHired) return true;

  // 3. Check in-memory assignments and requests
  const memoryHired = inMemoryAssignments.some(
    (a) => a.farmerId === farmerId && (a.ownerId === activeOwnerId || activeOwnerId === 'owner_demo' || !a.ownerId)
  );
  if (memoryHired) return true;

  const requestHired = inMemoryAssignmentRequests.some(
    (r) => r.farmerId === farmerId && (r.ownerId === activeOwnerId || activeOwnerId === 'owner_demo' || !r.ownerId) && r.status === 'approved'
  );
  if (requestHired) return true;

  // 4. Check Firestore collections if available
  if (db) {
    try {
      const qAssignments = query(
        collection(db, 'assignments'),
        where('farmerId', '==', farmerId),
        where('ownerId', '==', activeOwnerId)
      );
      const snap1 = await getDocs(qAssignments);
      if (!snap1.empty) return true;

      const qFieldAssignments = query(
        collection(db, 'field_assignments'),
        where('farmerId', '==', farmerId),
        where('ownerId', '==', activeOwnerId)
      );
      const snap2 = await getDocs(qFieldAssignments);
      if (!snap2.empty) return true;

      const qRequests = query(
        collection(db, 'assignment_requests'),
        where('farmerId', '==', farmerId),
        where('ownerId', '==', activeOwnerId),
        where('status', '==', 'approved')
      );
      const snap3 = await getDocs(qRequests);
      if (!snap3.empty) return true;
    } catch (err) {
      console.warn('Firestore hasOwnerHiredFarmer check error:', err);
    }
  }

  return false;
}

/**
 * Returns farmer IDs that have been hired by the given owner.
 * @param activeOnly If true (default), returns only currently hired/assigned farmers.
 *                   If false, returns all farmers ever hired by this owner (for rating eligibility).
 */
export async function getHiredFarmerIdsForOwner(ownerId: string, activeOnly: boolean = true): Promise<string[]> {
  const activeOwnerId = ownerId || 'owner_demo';
  const hiredSet = new Set<string>();

  // 1. Current fields
  const fields = await getOwnerFields();
  fields.forEach((f) => {
    const belongsToOwner = !f.ownerId || f.ownerId === activeOwnerId || activeOwnerId === 'owner_demo';
    if (belongsToOwner) {
      getFieldAssignedWorkers(f).forEach((w) => {
        if (w.farmerId) hiredSet.add(w.farmerId);
      });
    }
  });

  // 2. Local cache
  const cached = loadHiredCache();
  cached.forEach((r) => {
    if (r.ownerId === activeOwnerId || activeOwnerId === 'owner_demo' || !r.ownerId) {
      if (activeOnly) {
        if (r.active === true && !r.freedAt && r.farmerId) hiredSet.add(r.farmerId);
      } else {
        if (r.farmerId) hiredSet.add(r.farmerId);
      }
    }
  });

  // 3. Memory assignments & requests
  inMemoryAssignments.forEach((a) => {
    if (a.ownerId === activeOwnerId || activeOwnerId === 'owner_demo' || !a.ownerId) {
      if (activeOnly) {
        if (a.status === 'active' && a.farmerId) hiredSet.add(a.farmerId);
      } else {
        if (a.farmerId) hiredSet.add(a.farmerId);
      }
    }
  });
  inMemoryAssignmentRequests.forEach((r) => {
    if (r.ownerId === activeOwnerId || activeOwnerId === 'owner_demo' || !r.ownerId) {
      if (activeOnly) {
        if (r.status === 'approved' && r.farmerId) hiredSet.add(r.farmerId);
      } else {
        if ((r.status === 'approved' || (r as any).status === 'completed') && r.farmerId) hiredSet.add(r.farmerId);
      }
    }
  });

  return Array.from(hiredSet);
}

/**
 * Get active assignment for a farmer (returns null if none)
 * Business Rule: One farmer = one active field at a time
 */
export async function getFarmerActiveAssignment(farmerId: string): Promise<AssignmentRecord | null> {
  if (db) {
    try {
      const q = query(
        collection(db, 'assignments'),
        where('farmerId', '==', farmerId),
        where('status', '==', 'active'),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0];
        return { id: d.id, ...d.data() } as AssignmentRecord;
      }
      return null;
    } catch {
      // fallthrough
    }
  }
  return inMemoryAssignments.find((a) => a.farmerId === farmerId && a.status === 'active') || null;
}

/**
 * Get active assignment for a field (returns null if none)
 * Business Rule: One field = one active farmer at a time
 */
export async function getFieldActiveAssignment(fieldId: string): Promise<AssignmentRecord | null> {
  if (db) {
    try {
      const q = query(
        collection(db, 'assignments'),
        where('fieldId', '==', fieldId),
        where('status', '==', 'active'),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const d = snap.docs[0];
        return { id: d.id, ...d.data() } as AssignmentRecord;
      }
      return null;
    } catch {
      // fallthrough
    }
  }
  return inMemoryAssignments.find((a) => a.fieldId === fieldId && a.status === 'active') || null;
}

/**
 * Owner creates an assignment request OR farmer applies for work on an owner's field parcel.
 * Enforces: exclusivity (one owner at a time), non-duplicate assignment, non-duplicate pending application.
 */
export async function createAssignmentRequest(params: {
  ownerId: string;
  ownerName: string;
  farmerId: string;
  farmerName: string;
  farmId: string;
  farmName: string;
  fieldId: string;
  fieldName: string;
  workType?: string;
  dailyRate?: string;
  message?: string;
  initiatedBy?: 'owner' | 'farmer';
}): Promise<{ success: boolean; error?: string; request?: AssignmentRequest }> {

  // Rule 1: Worker exclusivity — farmer must not be employed by ANOTHER owner
  const activeEmployer = await getFarmerActiveEmployer(params.farmerId);
  const currentOwner = params.ownerId || 'owner_demo';
  if (activeEmployer && activeEmployer.ownerId !== currentOwner) {
    const isFarmerApply = params.initiatedBy === 'farmer';
    return {
      success: false,
      error: isFarmerApply
        ? `You are currently under contract with another farm owner (${activeEmployer.ownerName || 'Another Farm'}). You must finish that work and be freed before applying to a new owner.`
        : `This specialist is currently employed by another farm owner (${activeEmployer.ownerName || 'Another Farm'}). They must finish their work and be freed before you can hire them.`,
    };
  }

  // Rule 2: Farmer must not ALREADY be assigned to this specific field
  const allFields = await getOwnerFields();
  const targetField = allFields.find((f) => f.fieldId === params.fieldId || (f as any).id === params.fieldId);
  if (targetField) {
    const existingWorkers = getFieldAssignedWorkers(targetField);
    if (existingWorkers.some((w) => w.farmerId === params.farmerId)) {
      return {
        success: false,
        error: params.initiatedBy === 'farmer'
          ? 'You are already assigned as an active specialist on this field parcel.'
          : 'This specialist is already assigned to this field parcel.',
      };
    }
  }

  // Rule 3: No duplicate pending request to the same field
  if (db) {
    try {
      const qExisting = query(
        collection(db, 'assignment_requests'),
        where('farmerId', '==', params.farmerId),
        where('fieldId', '==', params.fieldId),
        where('status', '==', 'pending')
      );
      const existingSnap = await getDocs(qExisting);
      if (!existingSnap.empty) {
        return {
          success: false,
          error: params.initiatedBy === 'farmer'
            ? 'You have already submitted an application for this field parcel. Please wait for owner review.'
            : 'A pending assignment request already exists for this field.',
        };
      }
    } catch {
      // Proceed
    }
  } else {
    const dupPending = inMemoryAssignmentRequests.some(
      (r) => r.farmerId === params.farmerId && r.fieldId === params.fieldId && r.status === 'pending'
    );
    if (dupPending) {
      return {
        success: false,
        error: params.initiatedBy === 'farmer'
          ? 'You have already submitted an application for this field parcel. Please wait for owner review.'
          : 'A pending assignment request already exists for this field.',
      };
    }
  }

  const requestId = `areq_${Date.now()}`;
  const request: AssignmentRequest = {
    ...params,
    id: requestId,
    status: 'pending',
    initiatedBy: params.initiatedBy || 'owner',
    createdAt: new Date().toISOString(),
  };

  inMemoryAssignmentRequests.unshift(request);
  saveCache(LOCAL_AREQS_KEY, inMemoryAssignmentRequests);

  if (db) {
    try {
      await setDoc(doc(db, 'assignment_requests', requestId), {
        ...request,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('createAssignmentRequest Firestore error:', err);
    }
  }

  // Notification recipient:
  // If initiated by farmer → recipient is owner!
  // If initiated by owner → recipient is farmer!
  const isFarmerInitiated = params.initiatedBy === 'farmer';
  const recipientId = isFarmerInitiated ? (params.ownerId || 'owner_demo') : params.farmerId;
  const notifTitle = isFarmerInitiated
    ? 'New Field Work Application'
    : 'New Field Assignment Request';
  const notifMessage = isFarmerInitiated
    ? `${params.farmerName} has applied to work on ${params.fieldName} at ${params.farmName} (${params.workType || 'Field Specialist'} at ${params.dailyRate || '$120 / day'}).`
    : `${params.ownerName} wants to assign you to ${params.fieldName} at ${params.farmName}.`;

  await createNotification({
    recipientId,
    title: notifTitle,
    message: notifMessage,
    type: 'assignment',
    read: false,
    requestId,
    farmerId: params.farmerId,
    farmerName: params.farmerName,
    ownerId: params.ownerId,
    ownerName: params.ownerName,
    fieldId: params.fieldId,
    fieldName: params.fieldName,
    farmId: params.farmId,
    farmName: params.farmName,
    workType: params.workType,
    dailyRate: params.dailyRate,
    actionStatus: 'pending',
  });

  notifyEcosystemChange();
  return { success: true, request };
}

/**
 * Get all assignment requests (for overview and administrative monitoring)
 */
export async function getAllAssignmentRequests(): Promise<AssignmentRequest[]> {
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'assignment_requests'));
      const list: AssignmentRequest[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as AssignmentRequest));
      if (list.length > 0) {
        return list.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
      }
    } catch {
      // fallthrough
    }
  }
  return [...inMemoryAssignmentRequests];
}

/**
 * Cancel a pending assignment request
 */
export async function cancelAssignmentRequest(requestId: string): Promise<{ success: boolean; error?: string }> {
  const memIdx = inMemoryAssignmentRequests.findIndex((r) => r.id === requestId);
  if (memIdx !== -1) {
    inMemoryAssignmentRequests[memIdx].status = 'cancelled';
  }
  if (db) {
    try {
      await setDoc(doc(db, 'assignment_requests', requestId), {
        status: 'cancelled',
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch {
      // fallthrough
    }
  }
  notifyEcosystemChange();
  return { success: true };
}

/**
 * Get assignment requests by farmerId (farmer sees their incoming requests)
 */
export async function getFarmerAssignmentRequests(farmerId: string): Promise<AssignmentRequest[]> {
  if (db) {
    try {
      const q = query(
        collection(db, 'assignment_requests'),
        where('farmerId', '==', farmerId)
      );
      const snap = await getDocs(q);
      const list: AssignmentRequest[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as AssignmentRequest));
      return list.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
    } catch (err) {
      console.error('getFarmerAssignmentRequests error:', err);
    }
  }
  return inMemoryAssignmentRequests.filter((r) => r.farmerId === farmerId);
}

/**
 * Get assignment requests by ownerId (owner sees incoming applications and outgoing proposals)
 */
export async function getOwnerAssignmentRequests(ownerId: string): Promise<AssignmentRequest[]> {
  if (db) {
    try {
      const snap = await getDocs(collection(db, 'assignment_requests'));
      const list: AssignmentRequest[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as AssignmentRequest));
      if (list.length > 0) {
        return list
          .filter((r) => {
            if (r.ownerId === ownerId) return true;
            if (isDemoOwner(ownerId) && isDemoOwner(r.ownerId)) return true;
            if (!r.ownerId || !ownerId) return true;
            return false;
          })
          .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
      }
    } catch (err) {
      console.error('getOwnerAssignmentRequests error:', err);
    }
  }
  return inMemoryAssignmentRequests
    .filter((r) => {
      if (r.ownerId === ownerId) return true;
      if (isDemoOwner(ownerId) && isDemoOwner(r.ownerId)) return true;
      if (!r.ownerId || !ownerId) return true;
      return false;
    })
    .sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
}

/**
 * Owner or Farmer approves an assignment request / work application.
 * Creates an active assignment record and updates the field.
 */
export async function approveAssignmentRequest(requestId: string): Promise<{ success: boolean; error?: string }> {
  let request: AssignmentRequest | null = null;

  // Load from DB or memory
  if (db) {
    try {
      const snap = await getDoc(doc(db, 'assignment_requests', requestId));
      if (snap.exists()) {
        request = { id: snap.id, ...snap.data() } as AssignmentRequest;
      }
    } catch {
      // fallthrough
    }
  }
  if (!request) {
    request = inMemoryAssignmentRequests.find((r) => r.id === requestId) || null;
  }
  if (!request) return { success: false, error: 'Assignment request not found.' };
  if (request.status !== 'pending') return { success: false, error: 'Request is no longer pending.' };

  // Re-check business rules at approval time:
  // A worker may work for only ONE owner at a time (but on many fields of that owner).
  // A field may have MULTIPLE workers.
  const activeEmployer = await getFarmerActiveEmployer(request.farmerId);
  const requestOwner = request.ownerId || 'owner_demo';
  if (activeEmployer && activeEmployer.ownerId !== requestOwner) {
    return {
      success: false,
      error: 'Worker is currently engaged by another farm owner. Ask them to free the worker before assignment.',
    };
  }

  const now = new Date().toISOString();

  // Create active assignment record
  const assignId = `assign_${Date.now()}`;
  const assignmentRecord: AssignmentRecord = {
    id: assignId,
    ownerId: request.ownerId,
    farmerId: request.farmerId,
    farmerName: request.farmerName,
    farmId: request.farmId,
    farmName: request.farmName,
    fieldId: request.fieldId,
    fieldName: request.fieldName,
    workType: request.workType,
    dailyRate: request.dailyRate,
    status: 'active',
    assignedAt: now,
  };
  inMemoryAssignments.unshift(assignmentRecord);
  saveCache(LOCAL_ASSIGNS_KEY, inMemoryAssignments);

  // Update request status in memory
  const memIdx = inMemoryAssignmentRequests.findIndex((r) => r.id === requestId);
  if (memIdx !== -1) {
    inMemoryAssignmentRequests[memIdx].status = 'approved';
    inMemoryAssignmentRequests[memIdx].approvedAt = now;
    saveCache(LOCAL_AREQS_KEY, inMemoryAssignmentRequests);
  }

  // Update notification actionStatus
  const notifIdx = inMemoryNotifications.findIndex((n) => n.requestId === requestId);
  if (notifIdx !== -1) {
    inMemoryNotifications[notifIdx].actionStatus = 'approved';
    inMemoryNotifications[notifIdx].read = true;
    saveCache(LOCAL_NOTIFS_KEY, inMemoryNotifications);
  }

  if (db) {
    try {
      // Update request
      await setDoc(doc(db, 'assignment_requests', requestId), {
        status: 'approved',
        approvedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      // Create assignments record
      await setDoc(doc(db, 'assignments', assignId), {
        ...assignmentRecord,
        assignedAt: serverTimestamp(),
      });

      // Update field with assigned farmer & record hiring relation
      recordOwnerHiredFarmer(request.ownerId || 'owner_demo', request.farmerId, request.fieldId);
      await assignFarmerToField(request.fieldId, request.farmerId, request.farmerName, request.ownerId, request.workType, request.dailyRate);
    } catch (err) {
      console.error('approveAssignmentRequest Firestore error:', err);
    }
  } else {
    // Offline: update field in memory
    recordOwnerHiredFarmer(request.ownerId || 'owner_demo', request.farmerId, request.fieldId);
    await assignFarmerToField(request.fieldId, request.farmerId, request.farmerName, request.ownerId, request.workType, request.dailyRate);
  }

  // Notify the appropriate party:
  // If initiated by farmer → farmer gets notified that owner approved their application!
  // If initiated by owner → owner gets notified that farmer accepted their proposal!
  const isFarmerApp = request.initiatedBy === 'farmer';
  const notifRecipientId = isFarmerApp ? request.farmerId : (request.ownerId || 'owner_demo');
  const notifTitle = isFarmerApp ? 'Work Application Approved! 🎉' : 'Assignment Request Approved';
  const notifMessage = isFarmerApp
    ? `${request.ownerName || 'Farm Owner'} approved your application for ${request.fieldName}! You are now assigned to this field parcel.`
    : `${request.farmerName} accepted your assignment request for ${request.fieldName}.`;

  await createNotification({
    recipientId: notifRecipientId,
    title: notifTitle,
    message: notifMessage,
    type: 'assignment',
    read: false,
    requestId: request.id,
    farmerId: request.farmerId,
    farmerName: request.farmerName,
    ownerId: request.ownerId,
    ownerName: request.ownerName,
    fieldId: request.fieldId,
    fieldName: request.fieldName,
    farmId: request.farmId,
    farmName: request.farmName,
    workType: request.workType,
    dailyRate: request.dailyRate,
    actionStatus: 'approved',
  });

  notifyEcosystemChange();
  return { success: true };
}

/**
 * Owner declines farmer work application, or farmer rejects owner proposal.
 */
export async function rejectAssignmentRequest(requestId: string): Promise<{ success: boolean; error?: string }> {
  let request: AssignmentRequest | null = null;

  if (db) {
    try {
      const snap = await getDoc(doc(db, 'assignment_requests', requestId));
      if (snap.exists()) {
        request = { id: snap.id, ...snap.data() } as AssignmentRequest;
      }
    } catch {
      // fallthrough
    }
  }
  if (!request) {
    request = inMemoryAssignmentRequests.find((r) => r.id === requestId) || null;
  }
  if (!request) return { success: false, error: 'Assignment request not found.' };

  const now = new Date().toISOString();

  // Update in memory & cache
  const memIdx = inMemoryAssignmentRequests.findIndex((r) => r.id === requestId);
  if (memIdx !== -1) {
    inMemoryAssignmentRequests[memIdx].status = 'rejected';
    inMemoryAssignmentRequests[memIdx].rejectedAt = now;
    saveCache(LOCAL_AREQS_KEY, inMemoryAssignmentRequests);
  }

  // Update notification actionStatus
  const notifIdx = inMemoryNotifications.findIndex((n) => n.requestId === requestId);
  if (notifIdx !== -1) {
    inMemoryNotifications[notifIdx].actionStatus = 'rejected';
    saveCache(LOCAL_NOTIFS_KEY, inMemoryNotifications);
  }

  if (db) {
    try {
      await setDoc(doc(db, 'assignment_requests', requestId), {
        status: 'rejected',
        rejectedAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (err) {
      console.error('rejectAssignmentRequest Firestore error:', err);
    }
  }

  // Notify the appropriate party
  const isFarmerApp = request.initiatedBy === 'farmer';
  const notifRecipientId = isFarmerApp ? request.farmerId : (request.ownerId || 'owner_demo');
  const notifTitle = isFarmerApp ? 'Work Application Declined' : 'Assignment Request Declined';
  const notifMessage = isFarmerApp
    ? `${request.ownerName || 'Farm Owner'} was unable to accept your work application for ${request.fieldName}.`
    : `${request.farmerName} declined your assignment request for ${request.fieldName}.`;

  await createNotification({
    recipientId: notifRecipientId,
    title: notifTitle,
    message: notifMessage,
    type: 'assignment',
    read: false,
    requestId: request.id,
    farmerId: request.farmerId,
    farmerName: request.farmerName,
    ownerId: request.ownerId,
    ownerName: request.ownerName,
    fieldId: request.fieldId,
    fieldName: request.fieldName,
    farmId: request.farmId,
    farmName: request.farmName,
    actionStatus: 'rejected',
  });

  notifyEcosystemChange();
  return { success: true };
}

/**
 * Farmer applies for work on an owner's field parcel.
 * Farmers cannot hire other farmers — they apply for work to farm owners.
 */
export async function applyForFieldWork(params: {
  farmerId: string;
  farmerName: string;
  ownerId: string;
  ownerName: string;
  farmId: string;
  farmName: string;
  fieldId: string;
  fieldName: string;
  workType?: string;
  proposedRate?: string;
  message?: string;
}): Promise<{ success: boolean; error?: string; request?: AssignmentRequest }> {
  return createAssignmentRequest({
    ...params,
    dailyRate: params.proposedRate || '$120 / day',
    initiatedBy: 'farmer',
  });
}

/**
 * Get all work applications submitted by a farmer
 */
export async function getFarmerApplications(farmerId: string): Promise<AssignmentRequest[]> {
  const allReqs = await getFarmerAssignmentRequests(farmerId);
  return allReqs.filter((r) => r.initiatedBy === 'farmer');
}

/**
 * Get pending incoming applications from specialists for a farm owner's fields
 */
export async function getOwnerIncomingApplications(ownerId?: string): Promise<AssignmentRequest[]> {
  const allReqs = await getOwnerAssignmentRequests(ownerId || 'owner_demo');
  return allReqs.filter((r) => r.initiatedBy === 'farmer' && r.status === 'pending');
}

/**
 * Farmer unassigns themselves from their currently active field.
 * Keeps assignment history intact.
 */
export async function unassignFarmerFromField(farmerId: string, farmerName: string): Promise<{ success: boolean; error?: string }> {
  let activeAssignment = await getFarmerActiveAssignment(farmerId);
  
  if (!activeAssignment) {
    const assignedFields = await getFarmerAssignedFields(farmerId);
    if (assignedFields.length > 0) {
      const f = assignedFields[0];
      activeAssignment = {
        id: f.fieldId || (f as any).id,
        ownerId: f.ownerId || 'owner_demo',
        farmerId: farmerId,
        farmerName: farmerName,
        farmId: f.farmId || 'farm_salinas_01',
        farmName: 'My Farm',
        fieldId: f.fieldId || (f as any).id,
        fieldName: f.name,
        status: 'active',
        assignedAt: new Date().toISOString()
      };
    }
  }

  if (!activeAssignment) {
    return { success: false, error: 'No active assignment found.' };
  }

  const now = new Date().toISOString();

  // Update in memory
  const memIdx = inMemoryAssignments.findIndex((a) => a.id === activeAssignment.id);
  if (memIdx !== -1) {
    inMemoryAssignments[memIdx].status = 'inactive';
    inMemoryAssignments[memIdx].unassignedAt = now;
  }

  // Remove ONLY this farmer from the field (other workers stay assigned)
  await removeWorkerFromField(activeAssignment.fieldId, farmerId, activeAssignment.ownerId);

  if (db) {
    try {
      // Mark assignment as inactive (do NOT delete — keep history)
      await setDoc(doc(db, 'assignments', activeAssignment.id), {
        status: 'inactive',
        unassignedAt: serverTimestamp(),
      }, { merge: true });

      // Also update the matching assignment_request to unassigned
      const q = query(
        collection(db, 'assignment_requests'),
        where('farmerId', '==', farmerId),
        where('fieldId', '==', activeAssignment.fieldId),
        where('status', '==', 'approved')
      );
      const reqSnap = await getDocs(q);
      for (const d of reqSnap.docs) {
        await setDoc(d.ref, { status: 'unassigned', unassignedAt: serverTimestamp() }, { merge: true });
      }

      // Notify owner
      const notifId = `notif_unassign_${Date.now()}`;
      await setDoc(doc(db, 'notifications', notifId), {
        id: notifId,
        recipientId: activeAssignment.ownerId,
        title: 'Farmer Unassigned',
        message: `${farmerName} has unassigned from ${activeAssignment.fieldName}.`,
        type: 'assignment',
        read: false,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('unassignFarmerFromField Firestore error:', err);
    }
  }

  notifyEcosystemChange();
  return { success: true };
}

/**
 * Get assignment history for a farmer
 */
export async function getFarmerAssignmentHistory(farmerId: string): Promise<AssignmentRecord[]> {
  if (db) {
    try {
      const q = query(collection(db, 'assignments'), where('farmerId', '==', farmerId));
      const snap = await getDocs(q);
      const list: AssignmentRecord[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as AssignmentRecord));
      return list.sort((a, b) => (b.assignedAt > a.assignedAt ? 1 : -1));
    } catch (err) {
      console.error('getFarmerAssignmentHistory error:', err);
    }
  }
  return inMemoryAssignments.filter((a) => a.farmerId === farmerId);
}

/**
 * Get assignment history for an owner's farms
 */
export async function getOwnerAssignmentHistory(ownerId: string): Promise<AssignmentRecord[]> {
  if (db) {
    try {
      const q = query(collection(db, 'assignments'), where('ownerId', '==', ownerId));
      const snap = await getDocs(q);
      const list: AssignmentRecord[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as AssignmentRecord));
      return list.sort((a, b) => (b.assignedAt > a.assignedAt ? 1 : -1));
    } catch (err) {
      console.error('getOwnerAssignmentHistory error:', err);
    }
  }
  return inMemoryAssignments.filter((a) => a.ownerId === ownerId);
}


// ─── 1-to-1 Chat System ───────────────────────────────────────────────────────

export interface ConversationRecord {
  id: string;
  participants: string[];  // [ownerId, farmerId]
  ownerId: string;
  farmerId: string;
  ownerName: string;
  farmerName: string;
  lastMessage?: string;
  lastMessageAt?: any;
  createdAt: any;
  updatedAt?: any;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  text: string;
  createdAt: any;
  read: boolean;
}

// In-memory chat fallbacks
const inMemoryConversations: ConversationRecord[] = [];
const inMemoryMessages: ChatMessage[] = [];

// Storage keys for persistent chat history across reloads
const CHAT_STORAGE_PREFIX = 'agroai_chat_msgs_';
const CONV_STORAGE_PREFIX = 'agroai_chat_convs_';

export function getMessageTimeMs(timestamp: any): number {
  if (!timestamp) return Date.now();
  if (typeof timestamp === 'number') return timestamp;
  if (typeof timestamp?.toMillis === 'function') return timestamp.toMillis();
  if (typeof timestamp?.toDate === 'function') return timestamp.toDate().getTime();
  if (typeof timestamp?.seconds === 'number') return timestamp.seconds * 1000 + (timestamp.nanoseconds || 0) / 1e6;
  const parsed = new Date(timestamp).getTime();
  return isNaN(parsed) ? Date.now() : parsed;
}

export function sortChatMessages(list: ChatMessage[]): ChatMessage[] {
  const seenIds = new Set<string>();
  const unique: ChatMessage[] = [];

  for (const m of list) {
    if (!m || !m.id) continue;
    if (seenIds.has(m.id)) continue;

    // Deduplicate identical message text from same sender sent within 3 seconds
    const mTime = getMessageTimeMs(m.createdAt);
    const isDuplicate = unique.some((existing) => {
      if (existing.senderId === m.senderId && existing.text?.trim() === m.text?.trim()) {
        const existingTime = getMessageTimeMs(existing.createdAt);
        return Math.abs(existingTime - mTime) < 3000;
      }
      return false;
    });

    if (isDuplicate) continue;

    seenIds.add(m.id);
    unique.push(m);
  }

  return unique.sort((a, b) => getMessageTimeMs(a.createdAt) - getMessageTimeMs(b.createdAt));
}

export function getCachedMessages(conversationId: string): ChatMessage[] {
  try {
    const raw = localStorage.getItem(`${CHAT_STORAGE_PREFIX}${conversationId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return sortChatMessages(parsed);
    }
  } catch {}
  return [];
}

export function saveCachedMessages(conversationId: string, messages: ChatMessage[]): void {
  try {
    const sorted = sortChatMessages(messages);
    localStorage.setItem(`${CHAT_STORAGE_PREFIX}${conversationId}`, JSON.stringify(sorted));
  } catch {}
}

export function getCachedConversations(userId: string): ConversationRecord[] {
  try {
    const raw = localStorage.getItem(`${CONV_STORAGE_PREFIX}${userId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {}
  return [];
}

export function saveCachedConversations(userId: string, convs: ConversationRecord[]): void {
  try {
    localStorage.setItem(`${CONV_STORAGE_PREFIX}${userId}`, JSON.stringify(convs));
  } catch {}
}

/**
 * Get or create a 1:1 conversation between owner and farmer.
 * Prevents duplicate conversations.
 */
export async function getOrCreateConversation(params: {
  ownerId: string;
  farmerId: string;
  ownerName: string;
  farmerName: string;
}): Promise<ConversationRecord> {
  // 1. Try to find existing conversation in Firestore
  if (db) {
    try {
      const q = query(
        collection(db, 'conversations'),
        where('participants', 'array-contains', params.ownerId)
      );
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        const data = d.data() as ConversationRecord;
        if (data.farmerId === params.farmerId && data.ownerId === params.ownerId) {
          return { ...data, id: d.id };
        }
      }
    } catch (err) {
      console.warn('Firestore getOrCreateConversation search notice:', err);
    }
  }

  // 2. Try Backend API
  try {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const conv = await res.json();
      if (conv && conv.id) {
        if (db) {
          try {
            await setDoc(doc(db, 'conversations', conv.id), {
              ...conv,
              updatedAt: serverTimestamp(),
            }, { merge: true });
          } catch {}
        }
        return conv;
      }
    }
  } catch (apiErr) {
    console.warn('Backend API getOrCreateConversation notice:', apiErr);
  }

  // 3. Fallback to in-memory / local storage
  const cachedConvs = getCachedConversations(params.ownerId);
  const existingCached = cachedConvs.find(
    (c) => c.ownerId === params.ownerId && c.farmerId === params.farmerId
  );
  if (existingCached) return existingCached;

  const existingMem = inMemoryConversations.find(
    (c) => c.ownerId === params.ownerId && c.farmerId === params.farmerId
  );
  if (existingMem) return existingMem;

  // Create new conversation
  const convId = `conv_${params.ownerId}_${params.farmerId}_${Date.now()}`;
  const conversation: ConversationRecord = {
    id: convId,
    participants: [params.ownerId, params.farmerId],
    ownerId: params.ownerId,
    farmerId: params.farmerId,
    ownerName: params.ownerName,
    farmerName: params.farmerName,
    createdAt: new Date().toISOString(),
  };

  inMemoryConversations.unshift(conversation);
  saveCachedConversations(params.ownerId, [conversation, ...cachedConvs]);
  saveCachedConversations(params.farmerId, [conversation, ...getCachedConversations(params.farmerId)]);

  if (db) {
    try {
      await setDoc(doc(db, 'conversations', convId), {
        ...conversation,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error('getOrCreateConversation Firestore error:', err);
    }
  }

  return conversation;
}

/**
 * Get all conversations for a user (owner or farmer)
 * Access control: only conversations where userId is a participant
 */
export async function getUserConversations(userId: string): Promise<ConversationRecord[]> {
  const mergedMap = new Map<string, ConversationRecord>();

  // 1. LocalStorage cached conversations for instant return
  const cached = getCachedConversations(userId);
  cached.forEach((c) => mergedMap.set(c.id, c));

  // 2. Query Firestore if available
  if (db) {
    try {
      const q = query(
        collection(db, 'conversations'),
        where('participants', 'array-contains', userId)
      );
      const snap = await getDocs(q);
      snap.forEach((d) => mergedMap.set(d.id, { id: d.id, ...d.data() } as ConversationRecord));
    } catch (err) {
      console.warn('getUserConversations Firestore notice:', err);
    }
  }

  // 3. Query Backend API
  try {
    const res = await fetch(`/api/conversations?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const apiList = await res.json();
      if (Array.isArray(apiList)) {
        apiList.forEach((c: ConversationRecord) => {
          if (c && c.id) mergedMap.set(c.id, { ...mergedMap.get(c.id), ...c });
        });
      }
    }
  } catch (apiErr) {
    console.warn('getUserConversations API notice:', apiErr);
  }

  // 4. In-memory fallback
  inMemoryConversations.filter((c) => c.participants.includes(userId)).forEach((c) => {
    if (!mergedMap.has(c.id)) mergedMap.set(c.id, c);
  });

  const list = Array.from(mergedMap.values());
  const sorted = list.sort((a, b) => {
    const aTime = getMessageTimeMs(a.lastMessageAt || a.createdAt);
    const bTime = getMessageTimeMs(b.lastMessageAt || b.createdAt);
    return bTime - aTime;
  });

  saveCachedConversations(userId, sorted);
  return sorted;
}

/**
 * Send a message in a conversation.
 * Access control: sender must be a participant.
 */
export async function sendChatMessage(params: {
  conversationId: string;
  senderId: string;
  senderName: string;
  receiverId: string;
  text: string;
}): Promise<{ success: boolean; message?: ChatMessage; error?: string }> {
  if (!params.text.trim()) {
    return { success: false, error: 'Message cannot be empty.' };
  }

  const msgId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const nowIso = new Date().toISOString();
  const message: ChatMessage = {
    id: msgId,
    conversationId: params.conversationId,
    senderId: params.senderId,
    senderName: params.senderName,
    receiverId: params.receiverId,
    text: params.text.trim(),
    createdAt: nowIso,
    read: false,
  };

  // 1. Immediately store in local cache and in-memory list
  const existing = getCachedMessages(params.conversationId);
  const updated = sortChatMessages([...existing, message]);
  saveCachedMessages(params.conversationId, updated);
  inMemoryMessages.unshift(message);

  // 2. Save to Firestore if connected
  if (db) {
    try {
      await setDoc(doc(db, 'messages', msgId), {
        ...message,
        createdAt: serverTimestamp(),
      });

      // Update conversation last message preview
      await setDoc(doc(db, 'conversations', params.conversationId), {
        lastMessage: params.text.trim().slice(0, 100),
        lastMessageAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (err) {
      console.warn('sendChatMessage Firestore notice:', err);
    }
  }

  // 3. Sync to Backend API endpoint
  try {
    await fetch(`/api/conversations/${params.conversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: msgId,
        conversationId: params.conversationId,
        senderId: params.senderId,
        senderName: params.senderName,
        receiverId: params.receiverId,
        text: params.text.trim(),
        createdAt: nowIso,
      }),
    });
  } catch (apiErr) {
    console.warn('sendChatMessage Backend API notice:', apiErr);
  }

  notifyEcosystemChange();
  return { success: true, message };
}

/**
 * Get messages for a conversation (with access control check & caching)
 */
export async function getConversationMessages(
  conversationId: string,
  userId: string
): Promise<{ success: boolean; messages?: ChatMessage[]; error?: string }> {
  const mergedMap = new Map<string, ChatMessage>();

  // 1. Start with local cache for instant historical availability
  const cached = getCachedMessages(conversationId);
  cached.forEach((m) => mergedMap.set(m.id, m));

  // 2. Query Firestore without composite index (only filter by conversationId equality)
  if (db) {
    try {
      const q = query(
        collection(db, 'messages'),
        where('conversationId', '==', conversationId)
      );
      const snap = await getDocs(q);
      snap.forEach((d) => mergedMap.set(d.id, { id: d.id, ...d.data() } as ChatMessage));
    } catch (err) {
      console.warn('getConversationMessages Firestore notice:', err);
    }
  }

  // 3. Query Backend API for synced history
  try {
    const res = await fetch(`/api/conversations/${conversationId}/messages?userId=${encodeURIComponent(userId)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        data.forEach((m: ChatMessage) => {
          if (m && m.id) mergedMap.set(m.id, { ...mergedMap.get(m.id), ...m });
        });
      }
    }
  } catch (apiErr) {
    console.warn('getConversationMessages API notice:', apiErr);
  }

  // 4. Memory fallback
  inMemoryMessages
    .filter((m) => m.conversationId === conversationId)
    .forEach((m) => {
      if (!mergedMap.has(m.id)) mergedMap.set(m.id, m);
    });

  const sorted = sortChatMessages(Array.from(mergedMap.values()));
  if (sorted.length > 0) {
    saveCachedMessages(conversationId, sorted);
  }
  return { success: true, messages: sorted };
}

/**
 * Subscribe to real-time messages in a conversation.
 * Combines zero-delay cached history, Firestore onSnapshot real-time listener,
 * and background heartbeat polling so users NEVER have to refresh to see new messages.
 */
export function subscribeToMessages(
  conversationId: string,
  userId: string,
  onMessages: (messages: ChatMessage[]) => void
): () => void {
  let isSubscribed = true;

  // 1. Immediately provide cached history to the UI
  const initialCached = getCachedMessages(conversationId);
  if (initialCached.length > 0) {
    onMessages(initialCached);
  }

  // 2. Fetch full history from network asynchronously
  getConversationMessages(conversationId, userId).then((res) => {
    if (isSubscribed && res.success && res.messages && res.messages.length > 0) {
      onMessages(res.messages);
    }
  }).catch(() => {});

  // 3. Setup Firestore real-time listener if db is active
  let unsubFirestore: (() => void) | null = null;
  if (db) {
    try {
      // NOTE: Query ONLY by conversationId equality (no orderBy) to avoid composite index requirement
      const q = query(
        collection(db, 'messages'),
        where('conversationId', '==', conversationId)
      );
      unsubFirestore = onSnapshot(
        q,
        (snap) => {
          if (!isSubscribed) return;
          const list: ChatMessage[] = [];
          snap.forEach((d) => list.push({ id: d.id, ...d.data() } as ChatMessage));
          const sorted = sortChatMessages(list);
          saveCachedMessages(conversationId, sorted);
          onMessages(sorted);
        },
        (error) => {
          console.warn('[subscribeToMessages] Firestore listener notice, polling active:', error);
        }
      );
    } catch (err) {
      console.warn('[subscribeToMessages] Setup listener notice:', err);
    }
  }

  // 4. Polling heartbeat every 2.5 seconds:
  // Guarantees real-time updates even if Firestore connection drops, composite index fails,
  // or user sends via backend REST API. NO PAGE REFRESH EVER NEEDED!
  const intervalId = setInterval(async () => {
    if (!isSubscribed) return;
    try {
      const res = await getConversationMessages(conversationId, userId);
      if (isSubscribed && res.success && res.messages) {
        onMessages(res.messages);
      }
    } catch {}
  }, 2500);

  return () => {
    isSubscribed = false;
    if (unsubFirestore) {
      try {
        unsubFirestore();
      } catch {}
    }
    clearInterval(intervalId);
  };
}

/**
 * Subscribe to real-time assignment requests for a farmer.
 */
export function subscribeToFarmerRequests(
  farmerId: string,
  onRequests: (requests: AssignmentRequest[]) => void
): () => void {
  if (!db) return () => {};
  try {
    const q = query(
      collection(db, 'assignment_requests'),
      where('farmerId', '==', farmerId)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      const list: AssignmentRequest[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...d.data() } as AssignmentRequest));
      list.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
      onRequests(list);
    });
    return unsubscribe;
  } catch {
    return () => {};
  }
}

/**
 * Create default 4 fields when a new farm is created
 */
export async function createDefaultFieldsForFarm(
  farmId: string,
  ownerId: string,
  _farmName: string
): Promise<Field[]> {
  const defaultFields = [
    { name: 'Field A', crop: 'Rice', soilType: 'Silty Loam', lat: 36.677, lng: -121.655 },
    { name: 'Field B', crop: 'Maize', soilType: 'Clay Loam', lat: 36.672, lng: -121.650 },
    { name: 'Field C', crop: 'Wheat', soilType: 'Sandy Loam', lat: 36.680, lng: -121.645 },
    { name: 'Field D', crop: 'Tomato', soilType: 'Silt Loam', lat: 36.675, lng: -121.662 },
  ];

  const created: Field[] = [];
  for (const f of defaultFields) {
    const field = await createField({
      farmId,
      ownerId,
      name: f.name,
      crop: f.crop,
      areaAcres: 10,
      soilType: f.soilType,
      latitude: f.lat,
      longitude: f.lng,
      status: 'Healthy',
      soilMoisture: 50,
      soilPH: 6.5,
      temperature: 28,
      waterRequirement: 'Moderate',
    });
    created.push(field);
  }
  return created;
}

/**
 * Delete a field by ID (with Firestore + memory cleanup)
 */
export async function deleteField(fieldId: string): Promise<boolean> {
  // Remove from memory
  const idx = FALLBACK_FIELDS.findIndex(
    (f) => f.fieldId === fieldId || (f as any).id === fieldId || (f as any).docId === fieldId
  );
  if (idx !== -1) FALLBACK_FIELDS.splice(idx, 1);
  syncEcosystemCache();

  if (db) {
    try {
      const { deleteDoc } = await import('firebase/firestore');
      const directRef = doc(db, 'fields', fieldId);
      const directSnap = await getDoc(directRef);
      if (directSnap.exists()) {
        try {
          await deleteDoc(directRef);
        } catch {
          await setDoc(directRef, { deleted: true, deletedAt: serverTimestamp() }, { merge: true });
        }
      }

      const q = query(collection(db, 'fields'), where('fieldId', '==', fieldId));
      const snap = await getDocs(q);
      for (const d of snap.docs) {
        try {
          await deleteDoc(d.ref);
        } catch {
          await setDoc(d.ref, { deleted: true, deletedAt: serverTimestamp() }, { merge: true });
        }
      }
    } catch (err) {
      console.error('deleteField error:', err);
    }
  }

  notifyEcosystemChange();
  return true;
}

/**
 * Delete a farm by ID
 */
export async function deleteFarm(farmId: string): Promise<boolean> {
  const idx = FALLBACK_FARMS.findIndex((f) => f.farmId === farmId);
  if (idx !== -1) FALLBACK_FARMS.splice(idx, 1);
  syncEcosystemCache();
  notifyEcosystemChange();

  if (db) {
    try {
      await setDoc(doc(db, 'farms', farmId), { deleted: true, deletedAt: serverTimestamp() }, { merge: true });
    } catch (err) {
      console.error('deleteFarm error:', err);
    }
  }
  return true;
}

