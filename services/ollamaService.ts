
import { OllamaModel, Message, ToolCall } from '../types';

export class OllamaService {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  async testConnection(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 1500);
      const response = await fetch(`${this.baseUrl}/api/tags`, { signal: controller.signal });
      clearTimeout(id);
      return response.ok;
    } catch (e) {
      return false;
    }
  }

  async listModels(): Promise<OllamaModel[]> {
    const response = await fetch(`${this.baseUrl}/api/tags`);
    if (!response.ok) throw new Error('Failed to fetch models');
    const data = await response.json();
    const models: OllamaModel[] = data.models || [];
    
    const enhancedModels = await Promise.all(models.map(async (m) => {
      try {
        const infoResp = await fetch(`${this.baseUrl}/api/show`, {
          method: 'POST',
          body: JSON.stringify({ name: m.name })
        });
        const info = await infoResp.json();
        
        const hasTools = (
          info.template?.includes('tools') || 
          info.template?.includes('tool_calls') ||
          info.template?.includes('json_object') ||
          m.details.family.includes('llama3') || 
          m.details.family.includes('mistral') ||
          m.name.includes('command-r')
        );
        return { ...m, hasTools: !!hasTools };
      } catch (e) {
        return { ...m, hasTools: false };
      }
    }));

    return enhancedModels;
  }

  private getTools() {
    return [
      {
        type: 'function',
        function: {
          name: 'search_web',
          description: 'Search internet for real-time info.',
          parameters: {
            type: 'object',
            properties: {
              query: { type: 'string', description: 'Search query' }
            },
            required: ['query']
          }
        }
      },
      {
        type: 'function',
        function: {
          name: 'sleep_agent',
          description: 'Pause the agent.',
          parameters: {
            type: 'object',
            properties: {
              seconds: { type: 'number', description: 'Duration' }
            },
            required: ['seconds']
          }
        }
      }
    ];
  }

  async chat(
    model: string,
    messages: Message[],
    onChunk: (content: string) => void,
    onStatus: (status: string) => void,
    useTools: boolean,
    systemInstruction: string,
    signal?: AbortSignal
  ): Promise<{ content: string; tool_calls?: ToolCall[] }> {
    const systemPrompt: Message = {
      id: 'system-init',
      role: 'system',
      content: systemInstruction,
      timestamp: Date.now()
    };

    const body: any = {
      model,
      messages: [systemPrompt, ...messages].map(({ role, content, tool_calls, tool_call_id }) => ({ 
        role, 
        content: content || "",
        ...(tool_calls ? { tool_calls } : {}),
        ...(tool_call_id ? { tool_call_id } : {})
      })),
      stream: true,
      options: {
        num_predict: 512,
        temperature: 0.1, // Slight temp allowed for personality nuance
        num_ctx: 2048,
        num_thread: 8,
        top_k: 20,
        top_p: 0.5,
      },
      keep_alive: "60m"
    };

    if (useTools) {
      body.tools = this.getTools();
    }

    const response = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.error || `Error ${response.status}`);
    }
    
    if (!response.body) throw new Error('No body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = '';
    let toolCalls: ToolCall[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line);
          if (json.status) onStatus(json.status);
          if (json.message?.tool_calls) toolCalls = [...toolCalls, ...json.message.tool_calls];
          if (json.message?.content) {
            fullContent += json.message.content;
            onChunk(json.message.content);
          }
          if (json.done) return { content: fullContent, tool_calls: toolCalls.length > 0 ? toolCalls : undefined };
        } catch (e) {}
      }
    }

    return { content: fullContent, tool_calls: toolCalls.length > 0 ? toolCalls : undefined };
  }
}
