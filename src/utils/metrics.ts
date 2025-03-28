import { MeterProvider } from "opentelemetry/sdk-metrics";
import { PrometheusExporter } from "opentelemetry/exporter-prometheus";

const prometheusExporter = new PrometheusExporter({
  port: 9464,
  endpoint: "/metrics",
});

const meter = new MeterProvider();
meter.addMetricReader(prometheusExporter);

const dbMeter = meter.getMeter("db-metrics");

export const DBOperationDuration = dbMeter.createHistogram(
  "db_operation_duration",
  {
    description: "Duration of database operations",
    unit: "ms",
  },
);

export const ErrorCounter = dbMeter.createCounter("error_counter", {
  description: "Number of api errors",
});

export const ActiveConnections = dbMeter.createUpDownCounter(
  "active_connections",
  {
    description: "Number of active connections",
  },
);

export const trackDbOperation = (operation: string, collection: string) => {
  const startTime = performance.now();

  return {
    observeDuration: () => {
      const duration = performance.now() - startTime;
      DBOperationDuration.record(duration, {
        operation,
        collection,
      });
    },
  };
};
