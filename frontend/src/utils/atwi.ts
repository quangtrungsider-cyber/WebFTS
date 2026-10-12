import {
  AtwiContextFactors,
  AtwiTaskInstance,
  AtwiTaskDefinition,
  AtwiWorkloadModel,
  AtwiBand
} from '../types/atwi';

export const buildDefaultContextFactors = (): AtwiContextFactors => ({
  complexity: 0,
  weather: 0,
  military: 0,
  coordination: 0,
  airport: 0,
  degraded: 0,
  evidenceFactor: 1.0
});

export const formatAtwiPercent = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

export const formatSeconds = (value: number): string => {
  const mins = Math.floor(value / 60);
  const secs = Math.round(value % 60);
  if (mins > 0) {
    return `${mins}m ${secs}s`;
  }
  return `${secs}s`;
};

export const getBandLabel = (band: AtwiBand): string => {
  switch (band) {
    case 'normal':
      return 'Normal (Low Workload)';
    case 'watch':
      return 'Watch (Elevated Workload)';
    case 'high':
      return 'High (High Workload)';
    case 'critical':
      return 'Critical (Very High Workload)';
    default:
      return 'Unknown';
  }
};

export const getBandDescription = (band: AtwiBand): string => {
  switch (band) {
    case 'normal':
      return 'Workload is within normal monitoring range for this simulation model.';
    case 'watch':
      return 'Workload is elevated. Review traffic complexity and task contributors.';
    case 'high':
      return 'Workload is high in this simulation model. Review demand, sector, sequencing, coordination and procedure assumptions.';
    case 'critical':
      return 'Workload is critical in this simulation model. Detailed review and mitigation analysis are required.';
    default:
      return 'No description available.';
  }
};

export const isModelApprovedForKpi = (model: AtwiWorkloadModel): boolean => {
  return !!(model.metadata?.approvedForKpi && model.metadata?.status === 'approved');
};

export const getModelStatusWarning = (model: AtwiWorkloadModel): string | null => {
  if (isModelApprovedForKpi(model)) return null;

  if (model.metadata?.status === 'draft' || model.metadata?.status === 'imported') {
    return 'Draft/imported ATWI model is for preview and calibration only. Not approved for official KPI reporting.';
  }
  return 'This workload model is currently under review or retired. Not approved for official KPI reporting.';
};

export const buildSampleVvts52TaskInstances = (taskDefinitions: AtwiTaskDefinition[]): AtwiTaskInstance[] => {
  const sampleCounts: Record<string, number> = {
    'SURV_SCAN': 120,
    'TRAFFIC_COUNT_MONITOR': 60,
    'CONFLICT_CHECK': 20,
    'STCA_RESPONSE': 4,
    'VECTOR_OR_DIRECT': 12,
    'ALTITUDE_CHANGE': 8,
    'SPEED_CONTROL': 10,
    'HANDOFF_COORD': 14,
    'CROSS_SECTOR_COORD': 8,
    'RUNWAY_SEQUENCE': 18,
    'WEATHER_DEVIATION': 0,
    'MILITARY_COORD': 0,
    'SYSTEM_DEGRADED': 0,
    'AIRPORT_SURFACE_FEEDBACK': 0
  };

  const defaultFactors = {
    complexity: 1, // sample complexity
    weather: 0,
    military: 0,
    coordination: 1,
    airport: 1,
    degraded: 0,
    evidenceFactor: 1.0
  };

  return taskDefinitions.map(task => {
    const code = task.code.toUpperCase();
    const count = sampleCounts[code] !== undefined ? sampleCounts[code] : 0;
    return {
      id: `sample-${task.id}`,
      taskDefinitionId: task.id,
      count,
      contextFactors: { ...defaultFactors }
    };
  });
};

export const validateAtwiModelClientSide = (model: Partial<AtwiWorkloadModel>): string[] => {
  const errors: string[] = [];

  if (!model.name || !model.name.trim()) {
    errors.push('Model name is required.');
  }

  if (model.atcoOnPosition !== undefined && model.atcoOnPosition <= 0) {
    errors.push('ATCO on position must be greater than 0.');
  }

  if (model.availableSecondsPerAtcoPerHour !== undefined && model.availableSecondsPerAtcoPerHour <= 0) {
    errors.push('Available seconds per hour must be greater than 0.');
  }

  if (model.thresholds) {
    const { normalMax, watchMax, highMax } = model.thresholds;
    if (normalMax >= watchMax) {
      errors.push('Normal threshold must be less than Watch threshold.');
    }
    if (watchMax >= highMax) {
      errors.push('Watch threshold must be less than High threshold.');
    }
  }

  return errors;
};
