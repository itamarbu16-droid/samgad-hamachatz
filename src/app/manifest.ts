import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return { name: 'סמג״ד המחץ', short_name: 'סמג״ד המחץ', start_url: '/', scope: '/', display: 'standalone', lang: 'he', dir: 'rtl', background_color: '#080808', theme_color: '#080808', icons: [192,512].map(size => ({ src: `/brand/605-icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png' })) };
}
