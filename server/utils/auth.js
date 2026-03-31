import jwt from "jsonwebtoken";

export const AUTH_TOKEN_TTL = "7d";
export const AUTH_TOKEN_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
export const TWO_FACTOR_TOKEN_TTL = "10m";
export const TWO_FACTOR_TOKEN_MAX_AGE_SECONDS = 10 * 60;

const normalizeProjectId = (value) => String(value ?? "");

export const toPublicUser = (userDoc) => ({
  id: normalizeProjectId(userDoc?._id),
  username: String(userDoc?.username ?? ""),
  email: String(userDoc?.email ?? ""),
  avatarDataUrl: String(userDoc?.avatarDataUrl ?? ""),
  githubLinked: Boolean(userDoc?.githubId),
  githubUsername: String(userDoc?.githubUsername ?? ""),
  hasPassword: Boolean(userDoc?.passwordHash),
  isAdmin: Boolean(userDoc?.isAdmin),
  twoFactorEnabled: Boolean(userDoc?.twoFactorEnabled),
  projectPermissions: (userDoc?.projectPermissions ?? []).map((permission) => ({
    projectId: normalizeProjectId(permission?.projectId),
    canView: Boolean(permission?.canView || permission?.canRun),
    canRun: Boolean(permission?.canRun),
  })),
});

export const signAccessToken = (user, jwtSecret) =>
  jwt.sign(
    {
      sub: normalizeProjectId(user._id),
      username: user.username,
      isAdmin: Boolean(user.isAdmin),
    },
    jwtSecret,
    { expiresIn: AUTH_TOKEN_TTL },
  );

export const signTwoFactorToken = (user, jwtSecret) =>
  jwt.sign(
    {
      sub: normalizeProjectId(user._id),
      purpose: "two-factor",
    },
    jwtSecret,
    { expiresIn: TWO_FACTOR_TOKEN_TTL },
  );

export const readBearerToken = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return null;
  }
  if (raw.toLowerCase().startsWith("bearer ")) {
    return raw.slice(7).trim() || null;
  }
  return raw;
};

export const verifyAccessToken = (token, jwtSecret) => jwt.verify(token, jwtSecret);

export const canViewProject = (user, projectId) => {
  if (!projectId) {
    return false;
  }
  if (user?.isAdmin) {
    return true;
  }

  const key = normalizeProjectId(projectId);
  return (user?.projectPermissions ?? []).some(
    (permission) => normalizeProjectId(permission?.projectId) === key && Boolean(permission?.canView || permission?.canRun),
  );
};

export const canRunProject = (user, projectId) => {
  if (!projectId) {
    return false;
  }
  if (user?.isAdmin) {
    return true;
  }

  const key = normalizeProjectId(projectId);
  return (user?.projectPermissions ?? []).some(
    (permission) => normalizeProjectId(permission?.projectId) === key && Boolean(permission?.canRun),
  );
};

export const getViewableProjectIds = (user) => {
  if (!user || user.isAdmin) {
    return null;
  }
  return (user.projectPermissions ?? [])
    .filter((permission) => Boolean(permission.canView || permission.canRun))
    .map((permission) => normalizeProjectId(permission.projectId));
};

export const getRunnableProjectIds = (user) => {
  if (!user || user.isAdmin) {
    return null;
  }
  return (user.projectPermissions ?? [])
    .filter((permission) => Boolean(permission.canRun))
    .map((permission) => normalizeProjectId(permission.projectId));
};
