export type ServerSentEvent<T = unknown> = {
  event: string;
  data: T;
};

export async function consumeEventStream(
  response: Response,
  onEvent: (message: ServerSentEvent<Record<string, unknown>>) => void
): Promise<void> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const error =
      typeof payload.error === "string"
        ? payload.error
        : `Request failed with status ${response.status}.`;
    throw new Error(error);
  }

  if (!response.body) throw new Error("The response stream is unavailable.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    buffer += decoder.decode(value, { stream: !done });

    const frames = buffer.split(/\r?\n\r?\n/);
    buffer = frames.pop() ?? "";

    for (const frame of frames) {
      let event = "message";
      const dataLines: string[] = [];
      for (const line of frame.split(/\r?\n/)) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
      }
      if (dataLines.length === 0) continue;
      const raw = dataLines.join("\n");
      const data = JSON.parse(raw) as Record<string, unknown>;
      onEvent({ event, data });
    }

    if (done) break;
  }
}
