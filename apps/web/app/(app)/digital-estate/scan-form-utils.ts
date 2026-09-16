export function removeScanResumeParam(href: string): string {
  const url = new URL(href, 'https://ai-operations.local');
  url.searchParams.delete('resume');
  return `${url.pathname}${url.search}${url.hash}`;
}
