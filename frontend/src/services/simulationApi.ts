import { SimulationRun } from '../types/models';

export const simulationApi = {
  getSimulationRun: (id: string): Promise<SimulationRun> => {
    return new Promise((resolve) => setTimeout(() => resolve({
      id,
      scenarioId: '1',
      startTime: new Date().toISOString(),
      status: 'Running',
      progress: 45
    }), 500));
  }
};
