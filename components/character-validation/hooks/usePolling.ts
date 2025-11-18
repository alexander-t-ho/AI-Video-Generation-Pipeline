import { useRef, useEffect, useState } from 'react';
import type { PollingParams } from '../types';
import { POLLING_CONFIG } from '../constants';

export function usePolling() {
  const pollingActiveRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [isPolling, setIsPolling] = useState(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      pollingActiveRef.current = false;
      setIsPolling(false);
      abortControllerRef.current?.abort();
    };
  }, []);

  const startPolling = async ({
    predictionId,
    projectId,
    sceneIndex,
    onSuccess,
    onError,
    onStatus
  }: PollingParams) => {
    // Prevent multiple simultaneous polls
    if (pollingActiveRef.current) {
      console.log('[usePolling] Polling already active, skipping');
      return;
    }

    pollingActiveRef.current = true;
    setIsPolling(true);
    abortControllerRef.current = new AbortController();

    try {
      let attempts = 0;

      while (attempts < POLLING_CONFIG.maxAttempts && pollingActiveRef.current) {
        // Wait before polling (exponential backoff with max delay)
        const delay = Math.min(
          POLLING_CONFIG.maxDelay,
          POLLING_CONFIG.baseDelay * Math.pow(POLLING_CONFIG.backoffFactor, attempts)
        );

        console.log(`[usePolling] Waiting ${delay}ms before poll attempt ${attempts + 1}`);
        await new Promise(resolve => setTimeout(resolve, delay));

        // Check AGAIN after the delay to prevent race conditions
        if (!pollingActiveRef.current) {
          console.log('[usePolling] Polling cancelled after delay');
          return;
        }

        attempts++;
        console.log(`[usePolling] Poll attempt ${attempts}/${POLLING_CONFIG.maxAttempts}`);

        try {
          const pollResponse = await fetch(
            `/api/generate-image/${predictionId}?projectId=${encodeURIComponent(projectId)}&sceneIndex=${sceneIndex}`,
            {
              method: 'GET',
              signal: abortControllerRef.current.signal,
            }
          );

          if (!pollResponse.ok) {
            console.warn('[usePolling] Poll request failed, retrying...');
            continue;
          }

          const pollData = await pollResponse.json();
          console.log('[usePolling] Poll status:', pollData.status);

          // Notify about status if callback provided
          if (onStatus) {
            onStatus(pollData.status);
          }

          if (pollData.status === 'succeeded') {
            console.log('[usePolling] Generation succeeded, stopping polling');
            if (pollData.image) {
              onSuccess(pollData.image.url);
            }
            pollingActiveRef.current = false;
            setIsPolling(false);
            return;
          } else if (pollData.status === 'failed') {
            pollingActiveRef.current = false;
            setIsPolling(false);
            throw new Error(pollData.error || 'Image generation failed');
          } else if (pollData.status === 'canceled') {
            pollingActiveRef.current = false;
            setIsPolling(false);
            throw new Error('Image generation was canceled');
          }
          // Continue polling if status is 'starting' or 'processing'
        } catch (fetchError) {
          // If it's an abort error, stop polling
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            console.log('[usePolling] Request aborted');
            pollingActiveRef.current = false;
            setIsPolling(false);
            return;
          }
          // For other errors, continue polling
          console.warn('[usePolling] Poll request error:', fetchError);
        }
      }

      // If we exit the loop, we've timed out
      pollingActiveRef.current = false;
      setIsPolling(false);
      throw new Error(`Image generation timed out after ${POLLING_CONFIG.maxAttempts} attempts`);
    } catch (error) {
      pollingActiveRef.current = false;
      setIsPolling(false);
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('[usePolling] Request aborted');
        return;
      }
      console.error('[usePolling] Polling error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown polling error';
      onError(errorMessage);
    } finally {
      pollingActiveRef.current = false;
      setIsPolling(false);
    }
  };

  const stopPolling = () => {
    console.log('[usePolling] Stopping polling');
    pollingActiveRef.current = false;
    setIsPolling(false);
    abortControllerRef.current?.abort();
  };

  return {
    startPolling,
    stopPolling,
    isPolling,
    pollingActiveRef,
    abortControllerRef
  };
}
