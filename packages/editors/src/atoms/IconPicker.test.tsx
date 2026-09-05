import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorContextProvider } from '../context.js';
import { FIXTURE_CONTEXT } from '../test/fixtures.js';
import { CURATED_EMOJI, IconPicker, IconPreview } from './IconPicker.js';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={FIXTURE_CONTEXT}>{ui}</EditorContextProvider>);

describe('IconPreview', () => {
  it('renders system svg from context, images and emoji', () => {
    wrap(
      <>
        <IconPreview icon={{ kind: 'system', name: 'alert' }} />
        <IconPreview icon={{ kind: 'image', src: 'https://cdn/i.png', size: 24 }} />
        <IconPreview icon={{ kind: 'emoji', value: '🚀' }} />
      </>,
    );
    expect(screen.getByRole('img', { name: 'Icon alert' }).querySelector('svg')).toBeInTheDocument();
    const img = document.querySelector('img');
    expect(img).toHaveAttribute('src', 'https://cdn/i.png');
    expect(img).toHaveStyle({ width: '24px' });
    expect(screen.getByRole('img', { name: 'Emoji 🚀' })).toHaveTextContent('🚀');
  });
});

describe('IconPicker', () => {
  it('shows the current icon and round-trips a system pick, preserving size', async () => {
    const onChange = vi.fn();
    wrap(<IconPicker value={{ kind: 'system', name: 'alert', size: 20 }} onChange={onChange} label="Icon" />);
    const trigger = screen.getByRole('button', { name: 'Icon' });
    expect(trigger.querySelector('svg')).toBeInTheDocument();
    expect(trigger).toHaveTextContent('Alert');

    await userEvent.click(trigger);
    await userEvent.type(screen.getByLabelText('Search icons'), 'bu');
    expect(screen.queryByRole('button', { name: 'alert' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'buy' }));
    expect(onChange).toHaveBeenCalledWith({ kind: 'system', name: 'buy', size: 20 });
  });

  it('picks an emoji and steps the size', async () => {
    const onChange = vi.fn();
    wrap(<IconPicker value={{ kind: 'system', name: 'alert' }} onChange={onChange} label="Icon" />);
    await userEvent.click(screen.getByRole('button', { name: 'Icon' }));
    await userEvent.click(screen.getByRole('button', { name: 'Larger' }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'system', name: 'alert', size: 18 });

    await userEvent.click(screen.getByRole('tab', { name: 'Emoji' }));
    const first = CURATED_EMOJI[0] as string;
    await userEvent.click(screen.getByRole('button', { name: `Emoji ${first}` }));
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'emoji', value: first });
  });

  it('accepts an image URL and clears', async () => {
    const onChange = vi.fn();
    wrap(<IconPicker value={{ kind: 'emoji', value: '🚀' }} onChange={onChange} label="Icon" />);
    await userEvent.click(screen.getByRole('button', { name: 'Icon' }));
    await userEvent.click(screen.getByRole('tab', { name: 'Image' }));
    await userEvent.type(screen.getByPlaceholderText('https://… or data:'), 'https://cdn/i.png');
    expect(onChange).toHaveBeenLastCalledWith({ kind: 'image', src: 'https://cdn/i.png' });

    await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it('renders inline without a label', () => {
    wrap(
      <IconPicker value={{ kind: 'emoji', value: '🚀' }} onChange={() => {}} label="Icon" mode="inline" />,
    );
    expect(screen.queryByText('Icon')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Icon' })).toHaveTextContent('🚀');
  });
});
