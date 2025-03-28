import { MeterProvider } from "opentelemetry/api";
import { PrometheusExporter } from "opentelemetry/exporter-prometheus";

const prometheusExporter = new PrometheusExporter({
  port: 9464,
  endpoint: "/metrics",
});

const meter = new MeterProvider();
meter.addMetricReader(prometheusExporter);

// Create separate meters for different concerns
const dbMeter = meter.getMeter("db-metrics");
const httpMeter = meter.getMeter("http-metrics");
const systemMeter = meter.getMeter("system-metrics");
const businessMeter = meter.getMeter("business-metrics");

export const Metrics = {
  http: {
    counters: {
      requestsTotal: httpMeter.createCounter("http_requests_total", {
        description: "Total number of HTTP requests",
      }),
      activeRequests: httpMeter.createUpDownCounter("active_requests", {
        description: "Current number of active HTTP requests",
      }),
    },
    histograms: {
      requestDuration: httpMeter.createHistogram("http_request_duration", {
        description: "Duration of HTTP requests",
        unit: "ms",
      }),
    },
    track: {
      request: (method: string, path: string) => {
        const startTime = performance.now();
        Metrics.http.counters.activeRequests.add(1);

        return {
          end: (statusCode: number) => {
            const duration = performance.now() - startTime;
            Metrics.http.counters.activeRequests.add(-1);
            Metrics.http.counters.requestsTotal.add(1, {
              method,
              path,
              status: statusCode.toString(),
            });
            Metrics.http.histograms.requestDuration.record(duration, {
              method,
              path,
            });
          },
        };
      },
    },
  },

  db: {
    histograms: {
      operationDuration: dbMeter.createHistogram("db_operation_duration", {
        description: "Duration of database operations",
        unit: "ms",
      }),
    },
    counters: {
      errors: dbMeter.createCounter("error_counter", {
        description: "Number of api errors",
      }),
      activeConnections: dbMeter.createUpDownCounter("active_connections", {
        description: "Number of active connections",
      }),
    },
    track: {
      operation: (operation: string, collection: string) => {
        const startTime = performance.now();
        return {
          observeDuration: () => {
            const duration = performance.now() - startTime;
            Metrics.db.histograms.operationDuration.record(duration, {
              operation,
              collection,
            });
          },
        };
      },
    },
  },

  auth: {
    counters: {
      attempts: httpMeter.createCounter("auth_attempts_total", {
        description: "Total number of authentication attempts",
      }),
      unauthorized: httpMeter.createCounter("unauthorized_access_total", {
        description: "Total number of unauthorized access attempts",
      }),
    },
    track: {
      attempt: (
        status: "success" | "failure",
        type: "login" | "refresh" | "2fa",
      ) => {
        Metrics.auth.counters.attempts.add(1, { status, type });
      },
      unauthorized: (path: string, reason: string) => {
        Metrics.auth.counters.unauthorized.add(1, { path, reason });
      },
    },
  },

  system: {
    gauges: {
      memoryUsage: systemMeter.createUpDownCounter("system_memory_usage", {
        description: "Current system memory usage in bytes",
        unit: "bytes",
      }),
      cpuUsage: systemMeter.createUpDownCounter("system_cpu_usage", {
        description: "Current CPU usage percentage",
        unit: "%",
      }),
    },
  },

  business: {
    counters: {
      notesCreated: businessMeter.createCounter("notes_created_total", {
        description: "Total number of notes created",
      }),
      todosCompleted: businessMeter.createCounter("todos_completed_total", {
        description: "Total number of todos completed",
      }),
    },
    track: {
      note: (userId: string) => {
        Metrics.business.counters.notesCreated.add(1, { user_id: userId });
      },
      todo: (userId: string) => {
        Metrics.business.counters.todosCompleted.add(1, { user_id: userId });
      },
    },
  },
};
