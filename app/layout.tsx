import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'BEASTINDEX — How fit are you, really?',
  description:
    'Rank your strength, speed and fitness against 2.4 million real competition lifts, ' +
    '56,000 marathon finishers and nationally representative health survey data.',
  icons: { icon: '/logo/favicon.svg' },
  openGraph: {
    title: 'BEASTINDEX',
    description: 'Find out which animal you are. Ranked against real data.',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Archivo+Expanded:wght@700;800;900&family=Saira+Condensed:wght@600;700;800&family=Archivo:wght@400;500;600;700&family=Newsreader:ital,wght@1,300;1,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
