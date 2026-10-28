import type {
  ApplicationAction,
  ApplicationListQuery,
  CreateApplicationInput,
  MyApplication,
  MyApplicationListQuery,
  Paginated,
  ReceivedApplication,
} from '@pet-adoption/models';

import { http } from '../../../lib/api-client';

/**
 * All application data belongs to the signed-in user. Every request parameter
 * is part of the key; invalidating `all` refreshes every page.
 */
export const applicationQueryKeys = {
  all: ['applications'] as const,
  mine: (query: MyApplicationListQuery) =>
    ['applications', 'mine', query] as const,
  received: (query: ApplicationListQuery) =>
    ['applications', 'received', query] as const,
};

export const getMyApplications = async (
  query: MyApplicationListQuery,
): Promise<Paginated<MyApplication>> => {
  const { data } = await http.get<Paginated<MyApplication>>(
    '/applications/mine',
    { params: query },
  );
  return data;
};

export const getReceivedApplications = async (
  query: ApplicationListQuery,
): Promise<Paginated<ReceivedApplication>> => {
  const { data } = await http.get<Paginated<ReceivedApplication>>(
    '/applications/received',
    { params: query },
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
