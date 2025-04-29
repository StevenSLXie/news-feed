import { NextRequest } from 'next/server';
import { extract } from '@extractus/article-extractor';
import * as cheerio from 'cheerio';

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
      article = null;
    }
    // Fallback to Cheerio if extraction fails or content too short
    let content = article?.content || '';
    if (!content || content.length < 100) {
      const htmlRes = await fetch(url);
      const html = await htmlRes.text();
      const $ = cheerio.load(html);
      const paras = $('article p, main p, .prose p, .content p, #main p')
        .map((_: number, el: cheerio.Element) => $(el).text())
        .get();
      const fallback = paras.join('\n\n');
      if (!fallback || fallback.length < 100) {
        return new Response(JSON.stringify({ error: 'Could not extract article content or content too short.' }), { status: 422 });
      }
      content = fallback;
      article = { title: article?.title || $('title').text(), content };
    }
    // Title and content ready for prompt
    const title = article?.title || '';
    if (!OPENAI_API_KEY) {
      return new Response(JSON.stringify({ error: 'OpenAI API key not set.' }), { status: 500 });
    }
    // Prepare prompt for summary
    const prompt = `Summarize the following news article in about 100 words, focusing on the main points.\n\nTitle: ${title}\n\nContent: ${content}`;

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
