import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createProject, fetchProjects, type Project } from "../lib/api";
import { ProjectContext, type ProjectContextValue } from "./project-context";

const STORAGE_KEY = "loadpulse.selectedProjectId";

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && stored.trim() ? stored : null;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    try {
      const response = await fetchProjects();
      setProjects(response.data);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load projects.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshProjects();
  }, [refreshProjects]);

  useEffect(() => {
    if (projects.length === 0) {
      if (selectedProjectId !== null) {
        setSelectedProjectId(null);
        localStorage.removeItem(STORAGE_KEY);
      }
      return;
    }

    const stillExists = projects.some((project) => project.id === selectedProjectId);
    if (!stillExists) {
      const fallbackId = projects[0].id;
      setSelectedProjectId(fallbackId);
      localStorage.setItem(STORAGE_KEY, fallbackId);
    }
  }, [projects, selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const selectProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
    localStorage.setItem(STORAGE_KEY, projectId);
  }, []);

  const createAndSelectProject = useCallback(
    async (payload: { name: string; baseUrl: string; description?: string }) => {
      const response = await createProject(payload);
      const createdProject = response.data;
      setProjects((previous) => [createdProject, ...previous]);
      setSelectedProjectId(createdProject.id);
      localStorage.setItem(STORAGE_KEY, createdProject.id);
      return createdProject;
    },
    [],
  );

  const value = useMemo<ProjectContextValue>(
    () => ({
      projects,
      selectedProject,
      selectedProjectId,
      isLoading,
      error,
      refreshProjects,
      selectProject,
      createAndSelectProject,
    }),
    [projects, selectedProject, selectedProjectId, isLoading, error, refreshProjects, selectProject, createAndSelectProject],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};
