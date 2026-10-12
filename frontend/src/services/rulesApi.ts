import { SeparationRule } from '../types/models';

export const rulesApi = {
  list: async (): Promise<SeparationRule[]> => {
    const res = await fetch('/api/rules');
    if (!res.ok) throw new Error('Failed to load rules');
    return res.json();
  },
};
