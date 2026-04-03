export const PROJECT_SECTIONS = ["dashboard", "new-test", "history", "reports", "settings"] as const;

export type ProjectSection = (typeof PROJECT_SECTIONS)[number];

export const buildProjectSectionPath = (projectId: string, section: ProjectSection) =>
  `/projects/${encodeURIComponent(projectId)}/${section}`;

export const buildProjectTestPath = (projectId: string, testId: string) =>
  `/projects/${encodeURIComponent(projectId)}/tests/${encodeURIComponent(testId)}`;

export const getSectionFromPathname = (pathname: string): ProjectSection | null => {
  const match = pathname.match(/^\/projects\/[^/]+\/([^/]+)/);
  const section = match?.[1];
  if (!section) {
    return null;
  }
  return PROJECT_SECTIONS.includes(section as ProjectSection) ? (section as ProjectSection) : null;
};

export const getTitleFromPathname = (pathname: string) => {
  if (pathname === "/projects") {
    return "Projects";
  }
  if (pathname === "/settings") {
    return "Settings";
  }

  const section = getSectionFromPathname(pathname);
  if (section === "dashboard") {
    return "Dashboard";
  }
  if (section === "new-test") {
    return "New Test";
  }
  if (section === "history") {
    return "Test History";
  }
  if (section === "reports") {
    return "Reports";
  }
  if (section === "settings") {
    return "Settings";
  }

  if (/^\/projects\/[^/]+\/tests\/[^/]+$/.test(pathname)) {
    return "Test Details";
  }

  return "Workspace";
};

export const getPathForProjectSwitch = (pathname: string, nextProjectId: string) => {
  const section = getSectionFromPathname(pathname);
  if (section) {
    return buildProjectSectionPath(nextProjectId, section);
  }

  return buildProjectSectionPath(nextProjectId, "dashboard");
};
