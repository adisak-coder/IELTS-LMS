import DOMPurify from 'dompurify';
import { normalizeImageUrl } from './imageUrl';

function normalizeSanitizedImageSources(html: string): string {
  if (typeof document === 'undefined') {
    return html;
  }

  const template = document.createElement('template');
  template.innerHTML = html;

  template.content.querySelectorAll('img[src]').forEach((image) => {
    const source = image.getAttribute('src') ?? '';
    image.setAttribute('src', normalizeImageUrl(source));
  });

  return template.innerHTML;
}

export function sanitizeHtml(html: string): string {
  const sanitized = DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
  });

  return normalizeSanitizedImageSources(sanitized);
}
