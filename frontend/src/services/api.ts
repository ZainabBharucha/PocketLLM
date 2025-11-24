const API_BASE = 'http://localhost:8000';

export interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface Session {
  id: string;
  title: string;
  date: string;
}

export const InferService = {
  /**
   * Streaming Inference using Server-Sent Events (SSE).
   * Architecture Requirement: Surface "Effective Parameters" if possible.
   */
  streamResponse: (
    prompt: string, 
    sessionId: string, 
    params: { maxTokens: number; temp: number },
    onToken: (token: string) => void,
    onComplete: () => void,
    onError: (err: any) => void
  ) => {
    const url = new URL(`${API_BASE}/infer`);
    url.searchParams.append('prompt', prompt);
    url.searchParams.append('session_id', sessionId);
    url.searchParams.append('max_tokens', params.maxTokens.toString());
    url.searchParams.append('temperature', params.temp.toString());

    const eventSource = new EventSource(url.toString());

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        // The backend sends { "token": "...", "cached": boolean }
        onToken(data.token);
      } catch (e) {
        console.error("Parse error", e);
      }
    };

    eventSource.onerror = (err) => {
      // EventSource tries to reconnect automatically, but we usually want to close on error for this app
      console.error("Stream Error:", err);
      eventSource.close();
      onComplete(); // Treat error as completion of stream for UI safety
    };

    // Close the connection explicitly when needed? 
    // Usually the server closes it, but EventSource keeps listening.
    // For this prototype, we rely on the server keeping the connection open 
    // until done, or we detect a "done" signal if we implemented one.
    // Since our backend generator just finishes, the browser might try to reconnect.
    // We will attach a listener for the component to close it.
    
    return eventSource; 
  },

  getHistory: async (sessionId: string): Promise<Message[]> => {
    const res = await fetch(`${API_BASE}/history/${sessionId}`);
    return res.json();
  },

  getSessions: async (): Promise<Session[]> => {
    const res = await fetch(`${API_BASE}/sessions`);
    return res.json();
  },

  getMetrics: async () => {
    const res = await fetch(`${API_BASE}/metrics`);
    return res.json();
  }
};