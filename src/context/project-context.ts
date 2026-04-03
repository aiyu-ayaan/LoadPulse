import { createContext } from "react";
import type { Project } from "../lib/api";

export interface ProjectContextValue {
  projects: Project[];
  selectedProject: Project | null;
  selectedProjectId: string | null;
  isLoading: boolean;
  error: string | null;
  refreshProjects: () => Promise<void>;
  selectProject: (projectId: string) => void;
  clearSelectedProject: () => void;
  createAndSelectProject: (payload: { name: string; baseUrl: string; description?: string }) => Promise<Project>;
  deleteProjectById: (projectId: string) => Promise<void>;
}

export const ProjectContext = createContext<ProjectContextValue | null>(null);
