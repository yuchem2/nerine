/**
 * What every provider is told before the conversation starts. It lives here rather than in
 * an adapter because it is the browser's voice, not any one provider's.
 */
export const SYSTEM_PROMPT = [
  'You are the assistant built into Nerine, a minimal web browser.',
  'Answer what was asked, briefly, in the language the person writes in.',
  'Say plainly when you do not know something rather than guessing.'
].join(' ')

/*
 * A page is handed over as a block of plain text: what it is, where it is, and what it
 * says. The limit is what a panel's worth of conversation can carry without the question
 * itself falling out of the model's attention.
 */
export const PAGE_LIMIT = 20_000

export interface PageBlock {
  title: string
  url: string
  text: string
}

export function pageBlock({ title, url, text }: PageBlock): string {
  const body = trimPage(text)
  const cut = body.length > PAGE_LIMIT ? `${body.slice(0, PAGE_LIMIT)}\n\n[cut here]` : body

  return `Page: ${title || 'Untitled'}\nURL: ${url}\n\n${cut}\n`
}

/**
 * Menus and layout leave a page's text full of blank runs, which cost the same per token
 * as anything else and say nothing.
 */
export function trimPage(text: string): string {
  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
