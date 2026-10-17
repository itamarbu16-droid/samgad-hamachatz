import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return { name: 'סמג״ד רומח', short_name: 'סמג״ד רומח', start_url: '/', scope: '/', display: 'standalone', lang: 'he', dir: 'rtl', background_color: '#080808', theme_color: '#080808', icons: [512].map(size => ({ src: `/brand/75-crest.png`, sizes: `${size}x${size}`, type: 'image/png' })) };
}
