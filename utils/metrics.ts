import { Counter, Gauge, Histogram } from "prom-client";

export const DBOperationDuration = new Histogram({
  name: "db_operation_duration",
  help: "Duration of database operations",
  labelNames: ["operation", "collection"],
  buckets: [0.1, 5, 15, 50, 100, 500],
});

export const ErrorCounter = new Counter({
  name: "error_counter",
  help: "Number of api errors",
  labelNames: ["type", "operation"],
});

export const ActiveConnections = new Gauge({
  name: "active_connections",
  help: "Number of active connections",
});

export const trackDbOperation = (operation: string, collection: string) => {
  const endTimer = DBOperationDuration.startTimer();

  return {
    observeDuration: () => {
      endTimer({ operation, collection });
    },
  };
};
