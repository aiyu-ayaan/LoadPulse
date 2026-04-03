import type { ReactElement } from "react";
import { useEffect } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useProjects } from "../context/useProjects";

export const ProjectRequired = ({ children }: { children: ReactElement }) => {
  const { projectId } = useParams<{ projectId: string }>();
  const { projects, selectedProjectId, selectProject, isLoading } = useProjects();

  useEffect(() => {
    if (!projectId) {
      return;
    }
    if (selectedProjectId !== projectId) {
      selectProject(projectId);
    }
  }, [projectId, selectedProjectId, selectProject]);

  if (!projectId) {
    return <Navigate to="/projects" replace />;
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-300">
        Loading project context...
      </div>
    );
  }

  const projectExists = projects.some((project) => project.id === projectId);
  if (!projectExists) {
    return <Navigate to="/projects" replace />;
  }

  if (selectedProjectId !== projectId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-slate-300">
        Loading project workspace...
      </div>
    );
  }

  return children;
};
