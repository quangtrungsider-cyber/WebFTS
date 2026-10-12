export type AtwiBand =
  | "normal"
  | "watch"
  | "high"
  | "critical";

export type AtwiTaskCategory =
  | "surveillance"
  | "conflict_monitoring"
  | "coordination"
  | "communication"
  | "planning"
  | "procedure"
  | "system"
  | "airport_surface"
  | "weather"
  | "military_sua"
  | "other";

export type AtwiEvidenceLevel =
  | "assumed"
  | "local_expert"
  | "measured"
  | "validated";

export type AtwiModelStatus =
  | "draft"
  | "imported"
  | "under_review"
  | "reviewed"
  | "approved"
  | "retired";

export type AtwiModelSource =
  | "manual"
  | "excel_import"
  | "csv_import"
  | "json_import"
  | "ai_generated"
  | "expert_review"
  | "system_seed";

export interface AtwiThresholds {
  normalMax: number;
  watchMax: number;
  highMax: number;
}

export interface AtwiTaskDefinition {
  id: string;
  code: string;
  name: string;
  category: AtwiTaskCategory;
  baseEffortSec: number;
  description: string;
  evidenceLevel: AtwiEvidenceLevel;
  source?: AtwiModelSource | string;
  notes?: string;
}

export interface AtwiContextFactors {
  complexity: number;
  weather: number;
  military: number;
  coordination: number;
  airport: number;
  degraded: number;
  evidenceFactor: number;
}

export interface AtwiCoefficients {
  complexityCoeff: number;
  weatherCoeff: number;
  militaryCoeff: number;
  coordinationCoeff: number;
  airportCoeff: number;
  degradedCoeff: number;
}

export interface AtwiTaskInstance {
  id: string;
  taskDefinitionId: string;
  count: number;
  contextFactors: AtwiContextFactors;
}

export interface AtwiModelMetadata {
  version: string;
  status: AtwiModelStatus;
  source: AtwiModelSource;
  sourceFileName?: string;
  reviewStatus:
    | "not_reviewed"
    | "in_review"
    | "reviewed"
    | "approved";
  approvedForKpi: boolean;
  createdBy?: string;
  reviewedBy?: string;
  approvedBy?: string;
  createdAt: string;
  updatedAt: string;
  reviewedAt?: string | null;
  approvedAt?: string | null;
  notes?: string;
}

export interface AtwiWorkloadModel {
  id: string;
  name: string;
  description: string;
  atcoOnPosition: number;
  availableSecondsPerAtcoPerHour: number;
  coefficients: AtwiCoefficients;
  thresholds: AtwiThresholds;
  taskDefinitions: AtwiTaskDefinition[];
  metadata: AtwiModelMetadata;
}

export interface AtwiPosition {
  id: string;
  icao: string;
  name: string;
  nameEn: string;
  description: string;
  taskCodes: string[];
  atcoCount: number;
  source?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface AtwiPositionWindowResult {
  positionId: string;
  positionName: string;
  totalSeconds: number;
  availableCapacitySec: number;
  atwiPercent: number;
  band: AtwiBand;
  hasMappedTasks: boolean;
}

export interface AtwiPositionSummary {
  positionId: string;
  positionName: string;
  positionNameEn?: string;
  description: string;
  atcoCount: number;
  taskCodes: string[];
  hasMappedTasks: boolean;
  totalLocalizedLoadSec: number;
  availableCapacitySec: number;
  overallAtwiPercent: number;
  overallBand: AtwiBand;
  peakAtwiPercent: number;
  peakTimeLabel: string | null;
}

export interface AtwiCalculationInput {
  modelId: string;
  studyId?: string;
  scenarioId?: string;
  recordingId?: string;
  timeWindowStart: string;
  timeWindowEnd: string;
  taskInstances: AtwiTaskInstance[];
  controllerPositionId?: string;
  controllerPositionName?: string;
  calculationMode?: string;
}

export interface AtwiTaskResult {
  taskDefinitionId: string;
  taskCode: string;
  taskName: string;
  category: AtwiTaskCategory;
  count: number;
  baseEffortSec: number;
  localizedSingleTaskSec: number;
  totalSeconds: number;
  workloadSharePercent: number;
}

export interface AtwiCalculationResult {
  id: string;
  input: AtwiCalculationInput;
  modelId: string;
  modelName: string;
  modelVersion: string;
  modelStatus: AtwiModelStatus;
  approvedForKpi: boolean;
  totalLocalizedLoadSec: number;
  availableCapacitySec: number;
  atwiPercent: number;
  band: AtwiBand;
  taskResults: AtwiTaskResult[];
  generatedAt: string;
  disclaimer: string;
  warnings: string[];
  controllerPositionId?: string;
  controllerPositionName?: string;
  calculationMode?: string;
  durationSec?: number;
  capacityScalingMethod?: string;
}
