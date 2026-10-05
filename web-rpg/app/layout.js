import './globals.css';

export const metadata = {
  title: 'Alpha RPG Web',
  description: 'RPG web 2D inspirado nas mecânicas do Alpha Bot',
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
