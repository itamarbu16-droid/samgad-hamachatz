import type { MetadataRoute } from 'next';
export default function manifest(): MetadataRoute.Manifest {
  return { name: 'סמג״ד המחץ', short_name: 'סמג״ד המחץ', start_url: '/', scope: '/', display: 'standalone', lang: 'he', dir: 'rtl', background_color: '#f5f7f8', theme_color: '#112b38', icons: [192,512].map(size => ({ src: `/icon-${size}.png`, sizes: `${size}x${size}`, type: 'image/png' })) };
}
