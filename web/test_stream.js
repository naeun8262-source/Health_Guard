import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';

async function main() {
  const result = streamText({
    model: openai('gpt-4o-mini'),
    prompt: 'hello'
  });
  
  let current = result;
  while (current) {
    console.log(Object.getOwnPropertyNames(current).filter(name => name.includes('Response')));
    current = Object.getPrototypeOf(current);
  }
}
main();
