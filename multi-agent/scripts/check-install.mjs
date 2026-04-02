import { OpenMultiAgent } from '@jackchen_me/open-multi-agent'

const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY)
const hasOpenAI = Boolean(process.env.OPENAI_API_KEY)

new OpenMultiAgent({ defaultModel: 'claude-sonnet-4-6' })

console.log('open-multi-agent import: ok')
console.log(`ANTHROPIC_API_KEY: ${hasAnthropic ? 'set' : 'missing'}`)
console.log(`OPENAI_API_KEY: ${hasOpenAI ? 'set' : 'missing'}`)

if (!hasAnthropic && !hasOpenAI) {
  console.log('\nAdd at least one key to .env in this project root before running an agent.')
} else {
  console.log('\nConfig looks ready. Run "npm run start" to make a live API call.')
}
