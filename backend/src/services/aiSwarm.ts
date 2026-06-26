import OpenAI from 'openai';

export interface ChatHistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SYSTEM_PROMPT =
  "You are the Xroga AI Assistant. You have access to a 'memory' which is the chat history. Provide concise, helpful responses.";

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_current_weather',
      description: 'Get the current weather for a given location',
      parameters: {
        type: 'object',
        properties: {
          location: { type: 'string', description: 'City and state, e.g. San Francisco, CA' },
          unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
        },
        required: ['location'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'search_web',
      description: 'Search the web for current information on a topic',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The search query' },
        },
        required: ['query'],
      },
    },
  },
];

function getOpenAI(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  return new OpenAI({ apiKey });
}

/** Simple router — picks an agent hint based on user intent */
function routeIntent(message: string): 'general' | 'weather' | 'search' {
  if (/\b(weather|temperature|forecast|rain|sunny)\b/i.test(message)) return 'weather';
  if (/\b(search|look up|find|latest news)\b/i.test(message)) return 'search';
  return 'general';
}

async function executeTool(name: string, argsJson: string): Promise<string> {
  const args = JSON.parse(argsJson) as Record<string, string>;

  if (name === 'get_current_weather') {
    const unit = args.unit === 'celsius' ? 'celsius' : 'fahrenheit';
    const temp = unit === 'celsius' ? 22 : 72;
    return JSON.stringify({
      location: args.location,
      temperature: temp,
      unit,
      condition: 'Partly cloudy',
      source: 'xroga-weather-agent',
    });
  }

  if (name === 'search_web') {
    return JSON.stringify({
      query: args.query,
      results: [
        {
          title: `Results for "${args.query}"`,
          snippet: 'Sample search result from the Xroga web search agent (demo).',
        },
      ],
      source: 'xroga-search-agent',
    });
  }

  return JSON.stringify({ error: `Unknown tool: ${name}` });
}

function buildMessages(
  chatHistory: ChatHistoryMessage[],
  userMessage: string
): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
  const route = routeIntent(userMessage);
  const routeHint =
    route === 'weather'
      ? ' The user may need weather data — use get_current_weather when appropriate.'
      : route === 'search'
        ? ' The user may need web search — use search_web when appropriate.'
        : '';

  return [
    { role: 'system', content: SYSTEM_PROMPT + routeHint },
    ...chatHistory.map((m) => ({ role: m.role, content: m.content })),
    { role: 'user', content: userMessage },
  ];
}

/**
 * Router + Agent swarm. Handles tool calls, then returns an OpenAI streaming response.
 */
export async function runSwarm(
  userId: string,
  userMessage: string,
  chatHistory: ChatHistoryMessage[]
): Promise<AsyncIterable<OpenAI.Chat.Completions.ChatCompletionChunk>> {
  void userId;
  const openai = getOpenAI();
  let messages = buildMessages(chatHistory, userMessage);

  for (let round = 0; round < 3; round++) {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      tools,
      stream: false,
    });

    const choice = completion.choices[0];
    if (!choice) break;

    if (choice.finish_reason === 'tool_calls' && choice.message.tool_calls?.length) {
      messages = [...messages, choice.message];

      for (const toolCall of choice.message.tool_calls) {
        if (toolCall.type !== 'function') continue;
        const result = await executeTool(toolCall.function.name, toolCall.function.arguments);
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result,
        });
      }
      continue;
    }

    break;
  }

  return openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages,
    tools,
    stream: true,
  });
}
