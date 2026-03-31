import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createProject, deleteProject, fetchProjects, type Project } from "../lib/api";
import { ProjectContext, type ProjectContextValue } from "./project-context";
import { useAuth } from "./useAuth";

const STORAGE_KEY = "loadpulse.selectedProjectId";

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored && stored.trim() ? stored : null;
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    if (!isAuthenticated) {
      setProjects([]);
      setIsLoading(false);
      setError(null);
      return;
    }

    try {
      const response = await fetchProjects();
      setProjects(response.data);
      setError(null);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load projects.");
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }
    setIsLoading(true);
    void refreshProjects();
  }, [isAuthLoading, refreshProjects]);

  useEffect(() => {
    if (isAuthenticated) {
      return;
    }
    setProjects([]);
    setSelectedProjectId(null);
    localStorage.removeItem(STORAGE_KEY);
  }, [isAuthenticated]);

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

  const deleteProjectById = useCallback(
    async (projectId: string) => {
      await deleteProject(projectId);
      setProjects((previousProjects) => previousProjects.filter((project) => project.id !== projectId));
      if (selectedProjectId === projectId) {
        setSelectedProjectId(null);
        localStorage.removeItem(STORAGE_KEY);
      }
    },
    [selectedProjectId],
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
      deleteProjectById,
    }),
    [projects, selectedProject, selectedProjectId, isLoading, error, refreshProjects, selectProject, createAndSelectProject, deleteProjectById],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};
