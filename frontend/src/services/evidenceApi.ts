import { EvidencePackage } from '../types/models';

const mockEvidencePackages: EvidencePackage[] = [
  { id: 1, title: 'SGN Safety Case - Phase 1', type: 'Safety Report', status: 'Approved', author: 'Safety Team', date: '2024-05-25' },
  { id: 2, title: 'Environmental Impact Study', type: 'Environment', status: 'Draft', author: 'Planning Dept', date: '2024-05-26' },
  { id: 3, title: 'Cost-Benefit Analysis', type: 'Financial', status: 'In Review', author: 'Finance', date: '2024-05-27' },
];

export const evidenceApi = {
  getEvidencePackages: (): Promise<EvidencePackage[]> => {
    return new Promise((resolve) => setTimeout(() => resolve([...mockEvidencePackages]), 500));
  }
};
