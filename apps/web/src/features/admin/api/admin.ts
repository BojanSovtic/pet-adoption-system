import type {
  AdminApplication,
  AdminApplicationListQuery,
  AdminAuditEntry,
  AdminAuditListQuery,
  AdminPet,
  AdminPetListQuery,
  AdminStats,
  AdminUserListQuery,
  AdminUser,
  ModerationInput,
  Paginated,
  Pet,
  UpdateUserRoleInput,
  User,
} from '@pet-adoption/models';

import { http } from '../../../lib/api-client';

/**
 * Admin data is only for the signed-in admin; `setCurrentUser` removes it on
 * every identity change. Every request parameter is part of the key.
 */
export const adminQueryKeys = {
  all: ['admin'] as const,
  stats: ['admin', 'stats'] as const,
  users: (query: AdminUserListQuery) => ['admin', 'users', query] as const,
  pets: (query: AdminPetListQuery) => ['admin', 'pets', query] as const,
  applications: (query: AdminApplicationListQuery) =>
    ['admin', 'applications', query] as const,
  audit: (query: AdminAuditListQuery) => ['admin', 'audit', query] as const,
};

export const getAdminStats = async (): Promise<AdminStats> => {
  const { data } = await http.get<AdminStats>('/admin/stats');
  return data;
};

export const getAdminUsers = async (
  query: AdminUserListQuery,
): Promise<Paginated<AdminUser>> => {
  const { data } = await http.get<Paginated<AdminUser>>('/admin/users', {
    params: query,
  });
  return data;
};

export const updateUserRole = async (
  userId: string,
  input: UpdateUserRoleInput,
): Promise<User> => {
  const { data } = await http.put<User>(`/admin/users/${userId}/role`, input);
  return data;
};

export const getAdminPets = async (
  query: AdminPetListQuery,
): Promise<Paginated<AdminPet>> => {
  const { data } = await http.get<Paginated<AdminPet>>('/admin/pets', {
    params: query,
  });
  return data;
};

export const getAdminApplications = async (
  query: AdminApplicationListQuery,
): Promise<Paginated<AdminApplication>> => {
  const { data } = await http.get<Paginated<AdminApplication>>(
    '/admin/applications',
    { params: query },
  );
  return data;
};

export const suspendUser = async (
  userId: string,
  input: ModerationInput,
): Promise<User> => {
  const { data } = await http.post<User>(
    `/admin/users/${userId}/suspend`,
    input,
  );
  return data;
};

export const reinstateUser = async (userId: string): Promise<User> => {
  const { data } = await http.post<User>(`/admin/users/${userId}/reinstate`);
  return data;
};

export const hidePet = async (
  petId: string,
  input: ModerationInput,
): Promise<Pet> => {
  const { data } = await http.post<Pet>(`/admin/pets/${petId}/hide`, input);
  return data;
};

export const restorePet = async (petId: string): Promise<Pet> => {
  const { data } = await http.post<Pet>(`/admin/pets/${petId}/restore`);
  return data;
};

export const getAdminAudit = async (
  query: AdminAuditListQuery,
): Promise<Paginated<AdminAuditEntry>> => {
  const { data } = await http.get<Paginated<AdminAuditEntry>>('/admin/audit', {
    params: query,
  });
  return data;
};
