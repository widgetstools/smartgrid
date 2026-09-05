import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Toaster } from './sonner.js';
import { ThemeProvider } from '../providers/ThemeProvider.js';

vi.mock('sonner', () => ({
  Toaster: ({ theme, className }: { theme?: string; className?: string }) => (
    <div className={className} data-theme={theme} data-testid="sonner-root" />
  ),
}));

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('Sonner Toaster', () => {
  it('passes the resolved theme from ThemeProvider through to sonner', () => {
    render(
      <ThemeProvider defaultTheme="dark" ignorePersisted>
        <Toaster />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('sonner-root')).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByTestId('sonner-root')).toHaveClass('toaster', 'group');
  });

  it('never hands sonner the "os" mode — only the resolved light/dark', () => {
    render(
      <ThemeProvider defaultTheme="os" ignorePersisted>
        <Toaster />
      </ThemeProvider>,
    );
    const mode = screen.getByTestId('sonner-root').getAttribute('data-theme');
    expect(['light', 'dark']).toContain(mode);
  });
});
