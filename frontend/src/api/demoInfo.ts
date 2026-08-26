import { useQuery } from '@tanstack/react-query';
import { apiJson } from '@/api';

export type PublicDemoInfo = {
  enabled: boolean;
  sandbox: boolean;
  writable: boolean;
  username: string;
  password?: string;
  role: string;
};

export function fetchDemoInfo() {
  return apiJson<PublicDemoInfo>('/api/auth/demo-info');
}

export function useDemoInfo(enabled = true) {
  return useQuery({
    queryKey: ['auth', 'demo-info'],
    queryFn: fetchDemoInfo,
    enabled,
    staleTime: 300_000,
    retry: 1,
  });
}
