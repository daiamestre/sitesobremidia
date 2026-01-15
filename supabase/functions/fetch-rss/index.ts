import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RssItem {
  title: string;
  link: string;
  pubDate?: string;
  description?: string;
  imageUrl?: string;
}

function parseRss(xmlText: string): RssItem[] {
  const items: RssItem[] = [];

  // Simple regex-based parser for RSS items
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  const titleRegex = /<title>(?:<!\[CDATA\[(.*?)]]>|(.*?))<\/title>/i;
  const linkRegex = /<link>(.*?)<\/link>/i;
  const pubDateRegex = /<pubDate>(.*?)<\/pubDate>/i;
  const descRegex = /<description>(?:<!\[CDATA\[(.*?)]]>|(.*?))<\/description>/i;

  // Helper to extract attributes robustly
  const extractAttribute = (tag: string, attr: string) => {
    const regex = new RegExp(`${attr}=["']([^"']+)["']`, 'i');
    const match = tag.match(regex);
    return match ? match[1] : null;
  };

  let match;
  while ((match = itemRegex.exec(xmlText)) !== null) {
    const itemContent = match[1];

    const titleMatch = itemContent.match(titleRegex);
    const linkMatch = itemContent.match(linkRegex);
    const pubDateMatch = itemContent.match(pubDateRegex);
    const descMatch = itemContent.match(descRegex);

    // Attempt to find image
    let imageUrl = '';

    const enclosureMatch = itemContent.match(/<enclosure[^>]*>/i);
    const mediaContentMatch = itemContent.match(/<media:content[^>]*>/i);
    const mediaGroupMatch = itemContent.match(/<media:group>([\s\S]*?)<\/media:group>/i);

    // 1. Try media:content (Standard for G1)
    if (mediaContentMatch) {
      imageUrl = extractAttribute(mediaContentMatch[0], 'url') || '';
    }

    // 2. Try inside media:group if not found
    if (!imageUrl && mediaGroupMatch) {
      const innerMedia = mediaGroupMatch[1].match(/<media:content[^>]*>/i);
      if (innerMedia) {
        imageUrl = extractAttribute(innerMedia[0], 'url') || '';
      }
    }

    // 3. Try enclosure
    if (!imageUrl && enclosureMatch) {
      imageUrl = extractAttribute(enclosureMatch[0], 'url') || '';
    }

    // 4. Try img tag in description
    if (!imageUrl && descMatch) {
      const descContent = descMatch[1] || descMatch[2] || '';
      const imgMatch = descContent.match(/<img[^>]+src=["']([^"']+)["'][^>]*>/i);
      if (imgMatch) imageUrl = imgMatch[1];
    }

    if (titleMatch) {
      items.push({
        title: (titleMatch[1] || titleMatch[2] || '').trim(),
        link: linkMatch ? linkMatch[1].trim() : '',
        pubDate: pubDateMatch ? pubDateMatch[1].trim() : undefined,
        description: descMatch ? (descMatch[1] || descMatch[2] || '').trim() : undefined,
        imageUrl: imageUrl || undefined
      });
    }
  }

  return items;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { feedUrl, maxItems = 10 } = await req.json();

    if (!feedUrl) {
      return new Response(
        JSON.stringify({ error: 'feedUrl is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Fetching RSS feed: ${feedUrl}`);

    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RSSFetcher/1.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch RSS: ${response.status}`);
    }

    const xmlText = await response.text();
    const items = parseRss(xmlText).slice(0, maxItems);

    console.log(`Parsed ${items.length} items from RSS feed`);

    return new Response(
      JSON.stringify({ items }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('RSS fetch error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
