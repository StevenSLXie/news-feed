import { NextRequest } from 'next/server';
import { extract } from '@extractus/article-extractor';

export const runtime = 'nodejs'; // Ensure Node.js runtime for fetch and libraries

// IMPORTANT: You must set your OpenAI API key in the environment as OPENAI_API_KEY
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

interface Article {
  title?: string;
  content?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ error: 'Missing or invalid URL' }), { status: 400 });
    }
    // Basic URL validation
    try {
      new URL(url);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid URL' }), { status: 400 });
    }
    // Fetch and extract article content
    let article: Article | null = null;
    try {
      article = await extract(url);
    } catch {
      return new Response(JSON.stringify({ error: 'Failed to extract article content.' }), { status: 500 });
    }
    if (!article || !article.content || article.content.length < 100) {
      return new Response(JSON.stringify({ error: 'Could not extract article content or content too short.' }), { status: 422 });
    }
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not set.' }), { status: 500 });
    }
    // Prepare prompt for summary
    const prompt = `Summarize the following news article in about 100 words, focusing on the main points.\n\nTitle: ${article.title || ''}\n\nContent: ${article.content}`;

    // Call OpenAI API with streaming
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful assistant that summarizes news articles.' },
          { role: 'user', content: prompt },
        ],
        max_tokens: 400,
        temperature: 0.5,
        stream: true,
      }),
    });

    if (!openaiRes.ok || !openaiRes.body) {
      return new Response(JSON.stringify({ error: 'Failed to get summary from OpenAI.' }), { status: 502 });
    }

    // Stream OpenAI response to client
    return new Response(openaiRes.body, {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Unexpected server error.' }), { status: 500 });
  }
}
