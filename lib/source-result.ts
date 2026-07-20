import { SourceResult } from "./types";

export function sourceSuccess<T>(data: T, fetchedAt = Date.now()): SourceResult<T> {
  return { status: "success", data, fetchedAt };
}

export function sourcePartial<T>(data: T, failedItems: number, fetchedAt = Date.now()): SourceResult<T> {
  return { status: "success", data, fetchedAt, partial: { failedItems } };
}

export function sourceFailure<T>(error: unknown, fetchedAt = Date.now()): SourceResult<T> {
  const message = error instanceof Error ? error.message : "Unknown source error";
  return { status: "failed", data: null, fetchedAt, error: { code: "SOURCE_REQUEST_FAILED", message } };
}

export function sourceStale<T>(data: T, observedAt: number, error: unknown, fetchedAt = Date.now()): SourceResult<T> {
  return {
    status: "stale",
    data,
    observedAt,
    fetchedAt,
    error: { code: "SOURCE_STALE", message: error instanceof Error ? error.message : String(error) },
  };
}

export function sourceData<T>(result: SourceResult<T> | undefined, fallback: T): T {
  return result?.status === "success" || result?.status === "stale" ? result.data : fallback;
}
