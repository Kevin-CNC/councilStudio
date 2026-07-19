import { useState, useCallback, useRef } from "react";

interface UseMockStreamOptions {
  content: string;
  minDelay?: number;
  maxDelay?: number;
}

interface UseMockStreamReturn {
  streamedContent: string;
  isStreaming: boolean;
  progress: number; // 0-100
  startStream: () => Promise<void>;
  cancelStream: () => void;
}

export function useMockStream({
  content,
  minDelay = 15,
  maxDelay = 65,
}: UseMockStreamOptions): UseMockStreamReturn {
  const [streamedContent, setStreamedContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [progress, setProgress] = useState(0);
  const cancelRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);

  const cancelStream = useCallback(() => {
    cancelRef.current = true;
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    setIsStreaming(false);
  }, []);

  const startStream = useCallback(async () => {
    cancelRef.current = false;
    setStreamedContent("");
    setProgress(0);
    setIsStreaming(true);

    // Split content into chunks (mix of characters and words for realistic feel)
    const chunks: string[] = [];
    let i = 0;
    while (i < content.length) {
      // Sometimes take 1 char, sometimes a word, sometimes up to 3 chars
      const rand = Math.random();
      let step: number;
      if (rand < 0.3) {
        step = 1;
      } else if (rand < 0.7) {
        // Find end of word
        const spaceIdx = content.indexOf(" ", i + 1);
        step = spaceIdx > 0 ? spaceIdx - i + 1 : 1;
      } else {
        step = Math.min(2 + Math.floor(Math.random() * 3), content.length - i);
      }
      chunks.push(content.slice(i, i + step));
      i += step;
    }

    return new Promise<void>((resolve) => {
      let chunkIndex = 0;
      let accumulated = "";

      const tick = () => {
        if (cancelRef.current || chunkIndex >= chunks.length) {
          setIsStreaming(false);
          setProgress(100);
          resolve();
          return;
        }

        accumulated += chunks[chunkIndex];
        setStreamedContent(accumulated);
        setProgress(Math.round((chunkIndex / chunks.length) * 100));
        chunkIndex++;

        const delay = minDelay + Math.random() * (maxDelay - minDelay);
        // Occasionally pause longer (like generating thought)
        const actualDelay = Math.random() < 0.05 ? delay * 3 : delay;

        timeoutRef.current = window.setTimeout(tick, actualDelay);
      };

      tick();
    });
  }, [content, minDelay, maxDelay]);

  return { streamedContent, isStreaming, progress, startStream, cancelStream };
}

// Hook for orchestrating full council run with streaming
interface CouncilRunHook {
  run: (personaConfigs: { id: string; content: string }[]) => Promise<{
    results: Record<string, { content: string; status: "completed" | "cancelled" }>;
  }>;
  cancel: () => void;
  isRunning: boolean;
  streamStates: Record<string, { content: string; isStreaming: boolean; progress: number }>;
}

export function useCouncilStream(): CouncilRunHook {
  const [isRunning, setIsRunning] = useState(false);
  const [streamStates, setStreamStates] = useState<Record<string, { content: string; isStreaming: boolean; progress: number }>>({});
  const cancelRef = useRef(false);

  const cancel = useCallback(() => {
    cancelRef.current = true;
    setIsRunning(false);
  }, []);

  const run = useCallback(async (personaConfigs: { id: string; content: string }[]) => {
    cancelRef.current = false;
    setIsRunning(true);

    // Initialize all stream states
    const initialStates: Record<string, { content: string; isStreaming: boolean; progress: number }> = {};
    personaConfigs.forEach((p) => {
      initialStates[p.id] = { content: "", isStreaming: true, progress: 0 };
    });
    setStreamStates(initialStates);

    const results: Record<string, { content: string; status: "completed" | "cancelled" }> = {};

    // Run all personas concurrently
    const promises = personaConfigs.map(async (persona) => {
      // Simulate streaming for this persona
      const { content } = persona;
      const chunks: string[] = [];
      let i = 0;
      while (i < content.length) {
        const rand = Math.random();
        let step: number;
        if (rand < 0.3) step = 1;
        else if (rand < 0.7) {
          const spaceIdx = content.indexOf(" ", i + 1);
          step = spaceIdx > 0 ? spaceIdx - i + 1 : 1;
        } else {
          step = Math.min(2 + Math.floor(Math.random() * 3), content.length - i);
        }
        chunks.push(content.slice(i, i + step));
        i += step;
      }

      let accumulated = "";
      for (let ci = 0; ci < chunks.length; ci++) {
        if (cancelRef.current) {
          results[persona.id] = { content: accumulated, status: "cancelled" };
          setStreamStates((prev) => ({
            ...prev,
            [persona.id]: { content: accumulated, isStreaming: false, progress: 100 },
          }));
          return;
        }

        accumulated += chunks[ci];
        const prog = Math.round((ci / chunks.length) * 100);
        setStreamStates((prev) => ({
          ...prev,
          [persona.id]: { content: accumulated, isStreaming: true, progress: prog },
        }));

        const delay = 15 + Math.random() * 50;
        await new Promise((r) => setTimeout(r, Math.random() < 0.05 ? delay * 3 : delay));
      }

      results[persona.id] = { content, status: "completed" };
      setStreamStates((prev) => ({
        ...prev,
        [persona.id]: { content, isStreaming: false, progress: 100 },
      }));
    });

    await Promise.all(promises);
    setIsRunning(false);
    return { results };
  }, []);

  return { run, cancel, isRunning, streamStates };
}
