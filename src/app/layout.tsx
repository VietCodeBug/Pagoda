import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'An Nhiên · Virtual Temple Online',
  description: 'Một khoảng an nhiên giữa thế giới rộng lớn. Khám phá ngôi chùa 3D, gặp gỡ bạn bè và gửi một lời nguyện.',
  icons: { icon: '/icon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Browser extensions can inject root attributes before React hydrates the page.
  return (
    <html lang="vi" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
