import { MaturityGate } from '../types/models';

export const gateApi = {
  getMaturityGates: (): Promise<MaturityGate[]> => {
    return new Promise((resolve) => setTimeout(() => resolve([
      {
        id: 1,
        name: 'V1 - Operational Concept Review',
        status: 'Passed',
        date: '2024-05-20',
        reviewers: ['Admin', 'Manager'],
        criteria: [{ name: 'Concept Feasibility', status: 'Passed' }]
      }
    ]), 500));
  }
};
