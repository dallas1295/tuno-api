import { MeterProvider } from "npm:@opentelemetry/sdk-metrics";
import { PrometheusExporter } from "npm:@opentelemetry/exporter-prometheus";

const prometheusExporter = new PrometheusExporter({
  port: 9464,
  endpoint: "/metrics",
});
const meterProvider = new MeterProvider({
  readers: [prometheusExporter],
});

const errorMeter = meterProvider.getMeter("error-meter");
const dbMeter = meterProvider.getMeter("db-metrics");
const httpMeter = meterProvider.getMeter("http-metrics");

export const ErrorCounter = errorMeter.createCounter("error_counter", {
  description: "Number of api errors",
});

export const ActiveConnections = dbMeter.createUpDownCounter(
  "active_connections",
  {
    description: "Number of active connections",
  },
);

export const DatabaseMetrics = {
  operationDuration: dbMeter.createHistogram(
    "db_operation_duration",
    {
      description: "Duration of database operations",
      unit: "ms",
    },
  ),

  activeOperations: dbMeter.createUpDownCounter(
    "db_active_operations",
    {
      description: "Number of ongoing database operations",
    },
  ),

  connectionPoolSize: dbMeter.createUpDownCounter(
    "db_connection_pool_size",
    {
      description: "Current size of the database connection pool",
    },
  ),

  track(operation: string, collection: string) {
    const startTime = performance.now();
    this.activeOperations.add(1, { operation, collection });

    return {
      end: () => {
        const duration = performance.now() - startTime;
        this.operationDuration.record(duration, {
          operation,
          collection,
        });
        this.activeOperations.add(-1, { operation, collection });
      },
    };
  },
};

export const HTTPMetrics = {
  requestsTotal: httpMeter.createCounter("http_requests_total", {
    description: "Total number of HTTP requests",
  }),

  requestDuration: httpMeter.createHistogram("http_request_duration_seconds", {
    description: "Duration of HTTP requests",
    unit: "s",
  }),

  requestDistribution: httpMeter.createHistogram(
    "http_request_distribution_seconds",
    {
      description: "Distribution of HTTP request durations",
      unit: "s",
    },
  ),

  activeRequests: httpMeter.createUpDownCounter("active_requests", {
    description: "Current number of active HTTP requests",
  }),

  track(path: string, method: string) {
    const startTime = performance.now();
    this.activeRequests.add(1);

    return {
      end: (statusCode: number) => {
        const duration = (performance.now() - startTime) / 1000; // Convert to seconds
        this.activeRequests.add(-1);

        this.requestsTotal.add(1, {
          method,
          path,
          status: statusCode.toString(),
        });

        this.requestDuration.record(duration, {
          method,
          path,
        });

        this.requestDistribution.record(duration, {
          path,
          status_code: statusCode.toString(),
        });
      },
    };
  },
};
