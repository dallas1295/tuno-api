export function createContext(timeout: number) {
  const controller = new AbortController();
  const signal = controller.signal;
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  return {
    ctx: { signal },
    cancel: () => clearTimeout(timeoutId),
  };
}
