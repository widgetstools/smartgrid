import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { ThemeProvider, useTheme } from './ThemeProvider.js';

function Probe() {
  const { theme, resolvedTheme, setTheme, setCvd, setVariant, toggleTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button type="button" onClick={() => setTheme('light')}>
        light
      </button>
      <button type="button" onClick={() => setTheme('os')}>
        os
      </button>
      <button type="button" onClick={() => setCvd(true)}>
        cvd
      </button>
      <button type="button" onClick={() => setVariant('paper')}>
        paper
      </button>
      <button type="button" onClick={toggleTheme}>
        toggle
      </button>
    </div>
  );
}

const html = () => document.documentElement;

beforeEach(() => {
  localStorage.clear();
  html().removeAttribute('data-theme');
  html().removeAttribute('data-variant');
  html().removeAttribute('data-cvd');
});

afterEach(cleanup);

describe('ThemeProvider', () => {
  it('renders children and paints the default theme on <html>', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <span>SmartGrid</span>
      </ThemeProvider>,
    );
    expect(screen.getByText('SmartGrid')).toBeInTheDocument();
    expect(html().getAttribute('data-theme')).toBe('light');
    expect(html().getAttribute('data-variant')).toBe('clinical');
    expect(localStorage.getItem('smartgrid:theme')).toBe('light');
  });

  it('exposes theme + resolvedTheme and updates <html> through setTheme', () => {
    render(
      <ThemeProvider defaultTheme="dark">
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('dark');
    expect(screen.getByTestId('resolved').textContent).toBe('dark');
    expect(html().getAttribute('data-theme')).toBe('dark');

    act(() => screen.getByText('light').click());
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(html().getAttribute('data-theme')).toBe('light');
  });

  it('resolves "os" via prefers-color-scheme while persisting "os"', () => {
    // src/test/setup.ts stubs matchMedia with matches:false → light.
    render(
      <ThemeProvider defaultTheme="dark">
        <Probe />
      </ThemeProvider>,
    );
    act(() => screen.getByText('os').click());
    expect(screen.getByTestId('theme').textContent).toBe('os');
    expect(screen.getByTestId('resolved').textContent).toBe('light');
    expect(html().getAttribute('data-theme')).toBe('light');
    expect(localStorage.getItem('smartgrid:theme')).toBe('os');
  });

  it('applies cvd and variant', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <Probe />
      </ThemeProvider>,
    );
    act(() => screen.getByText('cvd').click());
    expect(html().getAttribute('data-cvd')).toBe('on');
    act(() => screen.getByText('paper').click());
    expect(html().getAttribute('data-variant')).toBe('paper');
  });

  it('toggleTheme cycles light → dark → os → light', () => {
    render(
      <ThemeProvider defaultTheme="light">
        <Probe />
      </ThemeProvider>,
    );
    const t = () => screen.getByTestId('theme').textContent;
    act(() => screen.getByText('toggle').click());
    expect(t()).toBe('dark');
    act(() => screen.getByText('toggle').click());
    expect(t()).toBe('os');
    act(() => screen.getByText('toggle').click());
    expect(t()).toBe('light');
  });

  it('restores a persisted preference over the default', () => {
    localStorage.setItem('smartgrid:theme', 'light');
    localStorage.setItem('smartgrid:variant', 'paper');
    render(
      <ThemeProvider defaultTheme="dark">
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('light');
    expect(html().getAttribute('data-variant')).toBe('paper');
  });

  it('ignores persisted preferences when asked', () => {
    localStorage.setItem('smartgrid:theme', 'light');
    render(
      <ThemeProvider defaultTheme="dark" ignorePersisted>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId('theme').textContent).toBe('dark');
  });

  it('useTheme outside a provider returns a read-only fallback', () => {
    render(<Probe />);
    expect(['light', 'dark', 'os']).toContain(screen.getByTestId('theme').textContent);
    act(() => screen.getByText('light').click()); // noop, must not throw
  });
});
