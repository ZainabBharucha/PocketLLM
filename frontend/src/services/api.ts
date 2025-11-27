const API_BASE = 'http://localhost:8000';

export interface Message {
  id?: number; // New: DB ID for feedback
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  feedback?: 'up' | 'down' | null; // New: Feedback state
}

export interface Session {
  id: string;
  title: string;
  date: string;
}

export const InferService = {
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
        onToken(data.token);
      } catch (e) {
        console.error("Parse error", e);
      }
    };

    eventSource.onerror = (err) => {
      console.error("Stream Error:", err);
      eventSource.close();
      onComplete();
    };
    
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
  },

  // New: Submit Feedback
  submitFeedback: async (messageId: number, vote: 'up' | 'down') => {
    await fetch(`${API_BASE}/messages/${messageId}/feedback`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vote })
    });
  }
};