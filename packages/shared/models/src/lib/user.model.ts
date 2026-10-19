export const USER_NAME_MAX_LENGTH = 100;
export const EMAIL_MAX_LENGTH = 254;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** A user as returned by the API. Never contains credentials. */
export type User = {
  _id: string;
  email: string;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type RegisterInput = {
  email: string;
  name: string;
  password: string;
};

export type LoginInput = {
  email: string;
  password: string;
};
