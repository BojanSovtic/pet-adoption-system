import type {
  ApplicationAction,
  CreateApplicationInput,
  MyApplication,
  ReceivedApplication,
} from '@pet-adoption/models';

import { http } from '../../../lib/api-client';

/** All application data belongs to the signed-in user. */
export const applicationQueryKeys = {
  all: ['applications'] as const,
  mine: ['applications', 'mine'] as const,
  received: ['applications', 'received'] as const,
};

export const getMyApplications = async (): Promise<MyApplication[]> => {
  const { data } = await http.get<MyApplication[]>('/applications/mine');
  return data;
};

export const getReceivedApplications = async (): Promise<
  ReceivedApplication[]
> => {
  const { data } = await http.get<ReceivedApplication[]>(
    '/applications/received',
  );
  return data;
};

export const submitApplication = async (
  petId: string,
  input: CreateApplicationInput,
): Promise<MyApplication> => {
  const { data } = await http.post<MyApplication>(
    `/pets/${petId}/applications`,
    input,
  );
  return data;
};

export const runApplicationAction = async (
  applicationId: string,
  action: ApplicationAction,
): Promise<MyApplication | ReceivedApplication> => {
  const { data } = await http.post<MyApplication | ReceivedApplication>(
    `/applications/${applicationId}/${action}`,
  );
  return data;
};
