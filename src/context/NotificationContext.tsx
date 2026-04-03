import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { io } from "socket.io-client";
import { getAuthToken, socketUrl } from "../lib/api";
import { useAuth } from "./useAuth";
import { useProjects } from "./useProjects";
import { NotificationContext, type AppNotification, type NotificationContextValue } from "./notification-context";
import { buildProjectTestPath } from "../lib/project-routes";

const MAX_NOTIFICATIONS = 25;

const buildStorageKey = (userId: string) => `loadpulse.notifications.${userId}`;

const compareByNewest = (left: AppNotification, right: AppNotification) =>
  new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime();

export const NotificationProvider = ({ children }: { children: ReactNode }) => {
  const { user, isAuthenticated } = useAuth();
  const { projects } = useProjects();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const activeRunIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      activeRunIdsRef.current = new Set();
      const frame = window.requestAnimationFrame(() => setNotifications([]));
      return () => window.cancelAnimationFrame(frame);
    }

    const frame = window.requestAnimationFrame(() => {
      const storageKey = buildStorageKey(user.id);
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) {
          setNotifications([]);
          return;
        }
        const parsed = JSON.parse(raw) as AppNotification[];
        setNotifications(Array.isArray(parsed) ? parsed.sort(compareByNewest).slice(0, MAX_NOTIFICATIONS) : []);
      } catch {
        setNotifications([]);
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    window.localStorage.setItem(buildStorageKey(user.id), JSON.stringify(notifications));
  }, [notifications, user]);

  const addNotification = useCallback<NotificationContextValue["addNotification"]>((notification) => {
    setNotifications((previous) => {
      const nextItem: AppNotification = {
        id: notification.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        timestamp: new Date().toISOString(),
        read: false,
        projectId: notification.projectId,
        runId: notification.runId,
        link: notification.link,
      };

      const deduped = previous.filter((item) => item.id !== nextItem.id);
      return [nextItem, ...deduped].sort(compareByNewest).slice(0, MAX_NOTIFICATIONS);
    });
  }, []);

  const markAsRead = useCallback((notificationId: string) => {
    setNotifications((previous) =>
      previous.map((item) => (item.id === notificationId ? { ...item, read: true } : item)),
    );
  }, []);

  const markAllAsRead = useCallback(() => {
    setNotifications((previous) => previous.map((item) => ({ ...item, read: true })));
  }, []);

  const removeNotification = useCallback((notificationId: string) => {
    setNotifications((previous) => previous.filter((item) => item.id !== notificationId));
  }, []);

  const clearNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user) {
      activeRunIdsRef.current = new Set();
      return;
    }

    const token = getAuthToken();
    if (!token) {
      return;
    }

    const resolveProjectName = (projectId?: string) =>
      projects.find((project) => project.id === projectId)?.name ?? "Your project";

    const socket = io(socketUrl, {
      transports: ["websocket", "polling"],
      auth: {
        token: `Bearer ${token}`,
      },
    });

    socket.on("live:init", (payload: { activeRuns?: Array<{ currentRun?: { id?: string } }> }) => {
      const activeIds = (payload?.activeRuns ?? [])
        .map((item) => item?.currentRun?.id)
        .filter((runId): runId is string => Boolean(runId));
      activeRunIdsRef.current = new Set(activeIds);
    });

    socket.on(
      "test:live:update",
      (snapshot: { projectId?: string; currentRun?: { id?: string; name?: string } }) => {
        const runId = snapshot?.currentRun?.id;
        if (!runId || activeRunIdsRef.current.has(runId)) {
          return;
        }

        activeRunIdsRef.current.add(runId);
        addNotification({
          id: `run-started:${runId}`,
          type: "info",
          title: "Test started",
          message: `${snapshot.currentRun?.name ?? "A test"} is now running for ${resolveProjectName(snapshot.projectId)}.`,
          projectId: snapshot.projectId,
          runId,
          link: snapshot.projectId ? buildProjectTestPath(snapshot.projectId, runId) : "/projects",
        });
      },
    );

    socket.on(
      "test:run:completed",
      (eventPayload: { runId?: string; runName?: string; projectId?: string; status?: string; errorMessage?: string }) => {
        const runId = eventPayload?.runId;
        if (!runId) {
          return;
        }

        activeRunIdsRef.current.delete(runId);
        const isSuccess = eventPayload.status === "success";
        addNotification({
          id: `run-completed:${runId}:${eventPayload.status ?? "unknown"}`,
          type: isSuccess ? "success" : "error",
          title: isSuccess ? "Test completed" : "Test failed",
          message: isSuccess
            ? `${eventPayload.runName ?? "A test"} finished for ${resolveProjectName(eventPayload.projectId)}.`
            : `${eventPayload.runName ?? "A test"} failed for ${resolveProjectName(eventPayload.projectId)}.${eventPayload.errorMessage ? ` ${eventPayload.errorMessage}` : ""}`,
          projectId: eventPayload.projectId,
          runId,
          link: eventPayload.projectId ? buildProjectTestPath(eventPayload.projectId, runId) : "/projects",
        });
      },
    );

    return () => {
      socket.close();
    };
  }, [addNotification, isAuthenticated, projects, user]);

  const unreadCount = useMemo(
    () => notifications.reduce((count, item) => count + (item.read ? 0 : 1), 0),
    [notifications],
  );

  const value = useMemo<NotificationContextValue>(
    () => ({
      notifications,
      unreadCount,
      addNotification,
      markAsRead,
      markAllAsRead,
      removeNotification,
      clearNotifications,
    }),
    [notifications, unreadCount, addNotification, markAsRead, markAllAsRead, removeNotification, clearNotifications],
  );

  return <NotificationContext.Provider value={value}>{children}</NotificationContext.Provider>;
};
