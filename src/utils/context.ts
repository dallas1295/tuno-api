import { Context } from "jsr:@oak/oak";

export function createContext(timeout: number) {
  const controller = new AbortController();
  const signal = controller.signal;
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return {
    ctx: { signal } as Partial<Context>,
    cancel: () => clearTimeout(timeoutId),
  };
}
