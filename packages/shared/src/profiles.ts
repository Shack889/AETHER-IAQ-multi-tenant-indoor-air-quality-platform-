export interface DEPSProfile {
  key: string;
  label: string;
  w_pm: number;   // PM2.5 weight
  w_co2: number;  // CO2 weight
  w_voc: number;  // VOC weight
  pm_max: number;  // PM2.5 threshold for 100% sub-index (µg/m³)
  co2_max: number; // CO2 threshold (ppm)
  voc_max: number; // VOC threshold (VOC index)
  description: string;
}

export const DEPS_PROFILES: Record<string, DEPSProfile> = {
  HOSPITAL_ICU: {
    key: 'HOSPITAL_ICU',
    label: 'Hospital ICU',
    w_pm: 3.0, w_co2: 2.5, w_voc: 2.5,
    pm_max: 10, co2_max: 600, voc_max: 50,
    description: 'Intensive care unit — strictest thresholds for critically ill patients',
  },
  HOSPITAL_WARD: {
    key: 'HOSPITAL_WARD',
    label: 'Hospital Ward',
    w_pm: 2.5, w_co2: 2.0, w_voc: 2.0,
    pm_max: 15, co2_max: 800, voc_max: 100,
    description: 'General hospital ward — high sensitivity for patient recovery',
  },
  HOSPITAL_OT: {
    key: 'HOSPITAL_OT',
    label: 'Operating Theater',
    w_pm: 3.5, w_co2: 2.0, w_voc: 3.0,
    pm_max: 5, co2_max: 500, voc_max: 30,
    description: 'Surgical operating theater — near-zero particle tolerance',
  },
  HOSPITAL_NICU: {
    key: 'HOSPITAL_NICU',
    label: 'NICU',
    w_pm: 3.5, w_co2: 3.0, w_voc: 3.0,
    pm_max: 5, co2_max: 500, voc_max: 30,
    description: 'Neonatal ICU — strictest possible for premature infants',
  },
  CLASSROOM: {
    key: 'CLASSROOM',
    label: 'Classroom',
    w_pm: 1.5, w_co2: 3.0, w_voc: 1.5,
    pm_max: 25, co2_max: 1000, voc_max: 150,
    description: 'School classroom — CO2 weighted for cognitive performance',
  },
  EXAM_HALL: {
    key: 'EXAM_HALL',
    label: 'Exam Hall',
    w_pm: 1.0, w_co2: 3.5, w_voc: 1.0,
    pm_max: 25, co2_max: 800, voc_max: 100,
    description: 'Examination hall — maximum CO2 sensitivity for peak cognition',
  },
  OFFICE_OPEN: {
    key: 'OFFICE_OPEN',
    label: 'Open Office',
    w_pm: 1.5, w_co2: 2.5, w_voc: 1.5,
    pm_max: 25, co2_max: 1000, voc_max: 200,
    description: 'Open-plan office — balanced weights for productivity',
  },
  OFFICE_CLOSED: {
    key: 'OFFICE_CLOSED',
    label: 'Closed Office',
    w_pm: 1.5, w_co2: 3.0, w_voc: 1.5,
    pm_max: 25, co2_max: 800, voc_max: 150,
    description: 'Private/closed office — elevated CO2 sensitivity due to lower air exchange',
  },
  FACTORY_LIGHT: {
    key: 'FACTORY_LIGHT',
    label: 'Light Factory',
    w_pm: 2.0, w_co2: 1.0, w_voc: 3.0,
    pm_max: 50, co2_max: 2000, voc_max: 300,
    description: 'Light industrial — VOC-weighted for chemical process environments',
  },
  KITCHEN_COMM: {
    key: 'KITCHEN_COMM',
    label: 'Commercial Kitchen',
    w_pm: 2.0, w_co2: 1.5, w_voc: 3.0,
    pm_max: 40, co2_max: 1500, voc_max: 400,
    description: 'Commercial kitchen — high PM and VOC tolerance for cooking environments',
  },
  SERVER_ROOM: {
    key: 'SERVER_ROOM',
    label: 'Server Room',
    w_pm: 2.0, w_co2: 0.5, w_voc: 2.0,
    pm_max: 15, co2_max: 5000, voc_max: 100,
    description: 'Data center — PM-focused (particle damage to electronics), CO2 deprioritized',
  },
  GOVT_OFFICE: {
    key: 'GOVT_OFFICE',
    label: 'Government Office',
    w_pm: 1.5, w_co2: 2.5, w_voc: 1.5,
    pm_max: 25, co2_max: 1000, voc_max: 200,
    description: 'Government administrative office — regulatory compliance focused',
  },
  COURT_ROOM: {
    key: 'COURT_ROOM',
    label: 'Court Room',
    w_pm: 1.0, w_co2: 3.0, w_voc: 1.0,
    pm_max: 20, co2_max: 800, voc_max: 100,
    description: 'Judicial court — CO2 weighted for cognitive alertness during proceedings',
  },
  RESIDENTIAL: {
    key: 'RESIDENTIAL',
    label: 'Residential',
    w_pm: 1.5, w_co2: 2.0, w_voc: 2.0,
    pm_max: 25, co2_max: 1000, voc_max: 200,
    description: 'Home environment — balanced for family health including children',
  },
  SMART_BUILDING: {
    key: 'SMART_BUILDING',
    label: 'Smart Building',
    w_pm: 2.0, w_co2: 2.0, w_voc: 2.0,
    pm_max: 20, co2_max: 800, voc_max: 150,
    description: 'Smart/green building — equal-weighted, targets WELL/RESET certification',
  },
};

export const DEFAULT_PROFILE_KEY = 'OFFICE_OPEN';

export function getProfile(key: string): DEPSProfile {
  return DEPS_PROFILES[key] ?? DEPS_PROFILES[DEFAULT_PROFILE_KEY];
}
