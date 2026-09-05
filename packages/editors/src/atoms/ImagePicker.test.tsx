import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorContextProvider } from '../context.js';
import { FIXTURE_CONTEXT } from '../test/fixtures.js';
import { IMAGE_MAX_BYTES, ImagePicker, formatBytes, readImageAsDataUri } from './ImagePicker.js';

afterEach(cleanup);

const wrap = (ui: React.ReactElement) =>
  render(<EditorContextProvider value={FIXTURE_CONTEXT}>{ui}</EditorContextProvider>);

const png = (bytes: number, name = 'a.png') => new File([new Uint8Array(bytes)], name, { type: 'image/png' });

describe('readImageAsDataUri', () => {
  it('converts small images and rejects oversize ones', async () => {
    await expect(readImageAsDataUri(png(10))).resolves.toMatch(/^data:image\/png;base64,/);
    await expect(readImageAsDataUri(png(IMAGE_MAX_BYTES + 1))).rejects.toThrow(/limit is 64 KB/);
    expect(formatBytes(IMAGE_MAX_BYTES)).toBe('64 KB');
  });
});

describe('ImagePicker', () => {
  it('previews the value and round-trips URL edits', async () => {
    const onChange = vi.fn();
    wrap(<ImagePicker value="https://cdn/x.png" onChange={onChange} label="Image" />);
    expect(screen.getByRole('img', { name: 'Image preview' }).querySelector('img')).toHaveAttribute(
      'src',
      'https://cdn/x.png',
    );
    const url = screen.getByLabelText('Image');
    await userEvent.clear(url);
    expect(onChange).toHaveBeenLastCalledWith(undefined);
    await userEvent.type(url, 'https://cdn/y.png');
    expect(onChange).toHaveBeenLastCalledWith('https://cdn/y.png');
  });

  it('uploads a file as a data URI and reports oversize files', async () => {
    const onChange = vi.fn();
    wrap(<ImagePicker value={undefined} onChange={onChange} label="Image" />);
    const file = screen.getByLabelText('Upload image');
    await userEvent.upload(file, png(16));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/png;base64,/)),
    );

    await userEvent.upload(file, png(IMAGE_MAX_BYTES + 1, 'big.png'));
    expect(await screen.findByRole('alert')).toHaveTextContent(/big\.png/);
  });

  it('clears and renders inline without a label', async () => {
    const onChange = vi.fn();
    wrap(<ImagePicker value="https://cdn/x.png" onChange={onChange} label="Image" mode="inline" />);
    expect(screen.queryByText('Image')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear image' }));
    expect(onChange).toHaveBeenCalledWith(undefined);
  });
});
