import cron from "node-cron";

const scheduledJobs = new Map();
let triggerHandler = null;

const toIntegrationId = (value) => String(value?._id ?? value?.id ?? value ?? "").trim();

const stopJob = (integrationId) => {
  const existing = scheduledJobs.get(integrationId);
  if (!existing) {
    return;
  }
  existing.stop();
  scheduledJobs.delete(integrationId);
};

const shouldSchedule = (integrationLike) =>
  Boolean(
    integrationLike &&
      integrationLike.isEnabled &&
      String(integrationLike.triggerType ?? "cron") === "cron" &&
      cron.validate(String(integrationLike.cronExpression ?? "").trim()),
  );

export const initIntegrationScheduler = async ({ integrations, onTrigger }) => {
  triggerHandler = onTrigger;

  for (const integrationId of [...scheduledJobs.keys()]) {
    stopJob(integrationId);
  }

  for (const integration of integrations) {
    scheduleIntegration(integration);
  }
};

export const scheduleIntegration = (integrationLike) => {
  const integrationId = toIntegrationId(integrationLike);
  if (!integrationId) {
    return false;
  }

  stopJob(integrationId);
  if (!shouldSchedule(integrationLike) || typeof triggerHandler !== "function") {
    return false;
  }

  const cronExpression = String(integrationLike.cronExpression).trim();
  const timezone = String(integrationLike.timezone ?? "UTC").trim() || "UTC";
  const task = cron.schedule(
    cronExpression,
    async () => {
      try {
        await triggerHandler(integrationId, {
          source: "cron",
          reason: `Scheduled trigger (${cronExpression})`,
        });
      } catch {
        // Trigger handler is expected to persist errors when needed.
      }
    },
    {
      timezone,
    },
  );

  scheduledJobs.set(integrationId, task);
  return true;
};

export const unscheduleIntegration = (integrationId) => {
  stopJob(String(integrationId ?? "").trim());
};

export const getSchedulerJobCount = () => scheduledJobs.size;
