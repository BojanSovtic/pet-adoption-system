import type {
  ApplicationAction,
  CreateApplicationInput,
  MyApplication,
  ReceivedApplication,
} from '@pet-adoption/models';

import { apiClient } from '../../../lib/api-client';

/** All application data belongs to the signed-in user. */
export const applicationQueryKeys = {
  all: ['applications'] as const,
  mine: ['applications', 'mine'] as const,
  received: ['applications', 'received'] as const,
};

export const getMyApplications = async (): Promise<MyApplication[]> => {
  return apiClient<MyApplication[]>('/applications/mine');
};

export const getReceivedApplications = async (): Promise<
  ReceivedApplication[]
> => {
  return apiClient<ReceivedApplication[]>('/applications/received');
};

export const submitApplication = async (
  petId: string,
  input: CreateApplicationInput,
): Promise<MyApplication> => {
  return apiClient<MyApplication>(`/pets/${petId}/applications`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
};

export const runApplicationAction = async (
  applicationId: string,
  action: ApplicationAction,
): Promise<MyApplication | ReceivedApplication> => {
  return apiClient<MyApplication | ReceivedApplication>(
    `/applications/${applicationId}/${action}`,
    { method: 'POST' },
  );
};
