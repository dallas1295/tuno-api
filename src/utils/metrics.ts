/**
 * @file Defines Prometheus metrics for monitoring the tonotes application.
 * This module exports histograms, counters, and gauges for tracking database
 * operation durations, errors, and active connections.
 */

import { Counter, Gauge, Histogram } from "prom-client";

/**
 * Histogram for tracking the duration of database operations.
 *
 * This metric allows us to monitor the performance of database queries and
 * identify potential bottlenecks. The buckets define the ranges for grouping
 * operation durations.
 */
export const DBOperationDuration = new Histogram({
  name: "db_operation_duration",
  help: "Duration of database operations",
  labelNames: ["operation", "collection"],
  buckets: [0.1, 5, 15, 50, 100, 500], // Durations in milliseconds
});

/**
 * Counter for tracking the number of errors in the application.
 *
 * This metric allows us to monitor the error rate and identify potential issues
 * that are causing errors.  Labels are used to categorize the errors by type
 * and operation.
 */
export const ErrorCounter = new Counter({
  name: "error_counter",
  help: "Number of api errors",
  labelNames: ["type", "operation"],
});

/**
 * Gauge for tracking the number of active database connections.
 *
 * This metric allows us to monitor the database connection pool and ensure that
 * we are not exceeding the maximum number of allowed connections.
 */
export const ActiveConnections = new Gauge({
  name: "active_connections",
  help: "Number of active connections",
});

/**
 * A function for tracking the duration of a specific database operation.
 *
 * @param operation The name of the database operation being tracked (e.g., "insert", "find", "update").
 * @param collection The name of the collection being accessed (e.g., "users", "notes").
 * @returns An object with an `observeDuration` method that should be called when the
 *          operation is complete to record the duration.
 */
export const trackDbOperation = (operation: string, collection: string) => {
  const endTimer = DBOperationDuration.startTimer();

  return {
    /**
     * Observes and records the duration of the database operation.
     * This method should be called when the operation is complete.
     */
    observeDuration: () => {
      endTimer({ operation, collection });
    },
  };
};
