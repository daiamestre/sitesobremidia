
import { useState, useCallback } from 'react';

/**
 * Hook to throw errors from async code causing them to be caught by ErrorBoundary.
 * Usage:
 * const throwError = useAsyncError();
 * fetch('/api').catch(throwError);
 */
export const useAsyncError = () => {
    const [_, setError] = useState();
    return useCallback((e: any) => {
        setError(() => { throw e; });
    }, []);
};
