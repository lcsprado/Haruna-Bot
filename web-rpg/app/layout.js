import './globals.css';

export const metadata = {
  title: 'Alpha RPG Web',
  description: 'RPG web 2D inspirado nas mecânicas do Alpha Bot',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#080a0f',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
