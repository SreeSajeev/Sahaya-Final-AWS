import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Hero / welcome section matching sahaya-operations-suite.
 * Gradient bg, grid overlay, radial glow; content in relative z-10 container.
 */
interface HeroSectionProps {
  children: ReactNode;
  className?: string;
}

export function HeroSection({ children, className }: HeroSectionProps) {
  return (
    <section
      className={cn(
        'relative overflow-hidden py-8',
        className
      )}
    >
      {/* Subtle gradient bg — hidden on mobile for plain background */}
      <div
        className="pointer-events-none absolute inset-0 hidden md:block"
        style={{
          background:
            'linear-gradient(180deg, hsl(285 30% 96%) 0%, hsl(30 5% 98%) 100%)',
        }}
      />
      {/* Grid overlay — hidden on mobile */}
      <div
        className="pointer-events-none absolute inset-0 hidden md:block"
        style={{
          backgroundImage: `
            linear-gradient(hsl(285 45% 55% / 0.025) 1px, transparent 1px),
            linear-gradient(90deg, hsl(285 45% 55% / 0.025) 1px, transparent 1px)
          `,
          backgroundSize: '48px 48px',
        }}
      />
      {/* Radial glow — hidden on mobile */}
      <div
        className="pointer-events-none absolute hidden md:block"
        style={{
          top: '-20%',
          right: '10%',
          width: 400,
          height: 300,
          background:
            'radial-gradient(ellipse, hsl(32 95% 52% / 0.06) 0%, transparent 70%)',
        }}
      />
      <div className="relative z-10 w-full md:mx-auto md:max-w-7xl px-3 md:px-6">{children}</div>
    </section>
  );
}
