import { Agent, ToolExecutor, ToolRegistry } from '@jackchen_me/open-multi-agent'

const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY)
const hasOpenAI = Boolean(process.env.OPENAI_API_KEY)

if (!hasAnthropic && !hasOpenAI) {
  console.error('Missing API key. Set ANTHROPIC_API_KEY or OPENAI_API_KEY in .env.')
  process.exit(1)
}

const provider = hasAnthropic ? 'anthropic' : 'openai'
const model = hasAnthropic ? 'claude-sonnet-4-6' : 'gpt-5.4'
const timeoutMs = 60_000

const registry = new ToolRegistry()
const executor = new ToolExecutor(registry)
const agent = new Agent(
  {
    name: 'installer-check',
    model,
    provider,
    maxTurns: 2,
  },
  registry,
  executor,
)

console.log(`Using provider=${provider} model=${model}`)
console.log('Starting live API call...')

const timeoutId = setTimeout(() => {
  console.error(`Timed out after ${timeoutMs / 1000} seconds`)
  process.exit(1)
}, timeoutMs)

let result = null

try {
  // `runAgent()` currently drops provider errors on the floor; the streaming
  // path preserves them as terminal `error` events we can surface directly.
  for await (const event of agent.stream('Reply with exactly: installation working')) {
    if (event.type === 'done') {
      result = event.data
      continue
    }

    if (event.type === 'error') {
      throw event.data instanceof Error
        ? event.data
        : new Error(String(event.data))
    }
  }
} finally {
  clearTimeout(timeoutId)
}

if (
  result === null ||
  result.output.trim() === ''
) {
  throw new Error('The framework completed without any text output.')
}

console.log(result.output)
console.log(
  `tokens in=${result.tokenUsage.input_tokens} out=${result.tokenUsage.output_tokens}`,
)
