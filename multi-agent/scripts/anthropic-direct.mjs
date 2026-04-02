import Anthropic from '@anthropic-ai/sdk'

if (!process.env.ANTHROPIC_API_KEY) {
  console.error('Missing ANTHROPIC_API_KEY in .env')
  process.exit(1)
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const model = 'claude-sonnet-4-6'

console.log(`Using Anthropic SDK directly with model=${model}`)
console.log('Starting live API call...')

const response = await client.messages.create({
  model,
  max_tokens: 32,
  messages: [{ role: 'user', content: 'Reply with exactly: installation working' }],
})

const text = response.content
  .filter(block => block.type === 'text')
  .map(block => block.text)
  .join('')

console.log(text)
console.log(
  `tokens in=${response.usage.input_tokens} out=${response.usage.output_tokens}`,
)
