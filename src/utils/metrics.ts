import { MeterProvider } from "opentelemetry/api";
import { PrometheusExporter } from "opentelemetry/exporter-prometheus";

const prometheusExporter = new PrometheusExporter({
  port: 9464,
  endpoint: "/metrics",
});

const meter = new MeterProvider();
meter.addMetricReader(prometheusExporter);

const dbMeter = meter.getMeter("db-metrics");

export const ErrorCounter = dbMeter.createCounter("error_counter", {
  description: "Number of api errors",
});

export const ActiveConnections = dbMeter.createUpDownCounter(
  "active_connections",
  {
    description: "Number of active connections",
  },
);

export const DatabaseMetrics = {
  // Track operation duration
  operationDuration: dbMeter.createHistogram(
    "db_operation_duration",
    {
      description: "Duration of database operations",
      unit: "ms",
    },
  ),

  // Track number of active/ongoing DB operations
  activeOperations: dbMeter.createUpDownCounter(
    "db_active_operations",
    {
      description: "Number of ongoing database operations",
    },
  ),

  // Track connection pool size
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
