type ModelSpeed = "fast" | "deep";

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export async function getGroqChatCompletion(
  messages: ChatMessage[],
  speed: ModelSpeed = "deep"
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch("/api/studio-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, speed, stream: false }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch AI response");
  }

    return response.json();
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error("Request timed out. The AI is taking too long to respond.");
    }
    throw error;
  }
}

export async function getGroqStreamingCompletion(
  messages: ChatMessage[],
  onChunk: (chunk: string) => void,
  speed: ModelSpeed = "deep"
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 20000); // 20s initial timeout for stream

  try {
    const response = await fetch("/api/studio-chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages, speed, stream: true }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || "Failed to fetch AI response");
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) throw new Error("No response body");

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    if (chunk) {
      onChunk(chunk);
    }
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      throw new Error("Request timed out. The AI is taking too long to respond.");
    }
    throw error;
  }
}
