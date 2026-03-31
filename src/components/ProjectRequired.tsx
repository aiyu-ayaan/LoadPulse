import type { ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { useProjects } from "../context/useProjects";

export const ProjectRequired = ({ children }: { children: ReactElement }) => {
  const { selectedProject } = useProjects();

  if (!selectedProject) {
    return <Navigate to="/projects" replace />;
  }

  return children;
};
