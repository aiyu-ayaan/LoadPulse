import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { createProject, deleteProject, fetchProjects, type Project } from "../lib/api";
import { ProjectContext, type ProjectContextValue } from "./project-context";
import { useAuth } from "./useAuth";

export const ProjectProvider = ({ children }: { children: ReactNode }) => {
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
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
  }, [isAuthenticated]);

  useEffect(() => {
    if (projects.length === 0) {
      if (selectedProjectId !== null) {
        setSelectedProjectId(null);
      }
      return;
    }

    if (selectedProjectId && !projects.some((project) => project.id === selectedProjectId)) {
      setSelectedProjectId(null);
    }
  }, [projects, selectedProjectId]);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const selectProject = useCallback((projectId: string) => {
    setSelectedProjectId(projectId);
  }, []);

  const clearSelectedProject = useCallback(() => {
    setSelectedProjectId(null);
  }, []);

  const createAndSelectProject = useCallback(
    async (payload: { name: string; baseUrl: string; description?: string }) => {
      const response = await createProject(payload);
      const createdProject = response.data;
      setProjects((previous) => [createdProject, ...previous]);
      setSelectedProjectId(createdProject.id);
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
      clearSelectedProject,
      createAndSelectProject,
      deleteProjectById,
    }),
    [
      projects,
      selectedProject,
      selectedProjectId,
      isLoading,
      error,
      refreshProjects,
      selectProject,
      clearSelectedProject,
      createAndSelectProject,
      deleteProjectById,
    ],
  );

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
};
