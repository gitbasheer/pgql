// Utility to mock p-retry with deterministic retry counting
export function createMockPRetry() {
  let callCount = 0;
  let failTimes = 0;
  let lastError: any = null;

  // Set how many times to fail before succeeding
  function setFailTimes(n: number) {
    failTimes = n;
    callCount = 0;
    lastError = null;
  }

  // The mock implementation
  async function mockPRetry(fn: any, options?: any) {
    const maxRetries = (options?.retries ?? 3) + 1;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      callCount++;
      try {
        if (callCount <= failTimes) {
          throw new Error('Mock retry failure');
        }
        return await fn(attempt);
      } catch (error) {
        lastError = error;
        if (options?.onFailedAttempt) {
          await options.onFailedAttempt({
            attemptNumber: attempt,
            message: error instanceof Error ? error.message : String(error),
            retriesLeft: maxRetries - attempt,
            name: 'MockRetryError',
            stack: ''
          });
        }
        if (attempt === maxRetries) throw lastError;
      }
    }
    throw lastError;
  }

  return {
    mockPRetry,
    setFailTimes,
    getCallCount: () => callCount
  };
}
