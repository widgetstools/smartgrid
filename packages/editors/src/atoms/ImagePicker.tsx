/**
 * ImagePicker — `x-editor: 'image'`.
 *
 * Edits an image reference string: an absolute/relative URL or a `data:`
 * URI. Shows a preview, a URL input, a drop zone / file button that
 * converts a local file into a data URI via FileReader (capped at
 * `IMAGE_MAX_BYTES` = 64 KB; oversize files raise an inline error above
 * the control) and a clear button.
 *
 * Options: `maxBytes?: number` (override the 64 KB cap),
 * `placeholder?: string` (URL input).
 *
 * Also exports `readImageAsDataUri(file, maxBytes)` which IconPicker reuses.
 */
import { useId, useRef, useState, type DragEvent } from 'react';
import { Button, cn } from '@smartgrid/ui';
import { Image as ImageIcon, Upload, X } from 'lucide-react';
import { Field } from '../lib/Field.js';
import { TextInput } from '../lib/inputs.js';
import type { EditorProps } from '../types.js';

/** Default upper bound for inlined images, in bytes. */
export const IMAGE_MAX_BYTES = 64 * 1024;

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10 * 1024 ? 1 : 0)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Read a File as a `data:` URI. Rejects with a readable message when the
 * file is not an image or exceeds `maxBytes`.
 */
export function readImageAsDataUri(file: File, maxBytes = IMAGE_MAX_BYTES): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type && !file.type.startsWith('image/')) {
      reject(new Error(`"${file.name}" is not an image`));
      return;
    }
    if (file.size > maxBytes) {
      reject(new Error(`"${file.name}" is ${formatBytes(file.size)}; the limit is ${formatBytes(maxBytes)}`));
      return;
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Could not read "${file.name}"`));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') resolve(result);
      else reject(new Error(`Could not read "${file.name}"`));
    };
    reader.readAsDataURL(file);
  });
}

export type ImagePickerProps = EditorProps<string>;

export function ImagePicker(props: ImagePickerProps) {
  const {
    value,
    onChange,
    mode = 'panel',
    readOnly,
    disabled,
    errors,
    label,
    description,
    className,
    options,
  } = props;
  const autoId = useId();
  const id = props.id ?? autoId;
  const locked = !!readOnly || !!disabled;
  const maxBytes = typeof options?.maxBytes === 'number' ? options.maxBytes : IMAGE_MAX_BYTES;
  const placeholder =
    typeof options?.placeholder === 'string' ? options.placeholder : 'https://… or data:image/…';
  const [error, setError] = useState<string | undefined>();
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const takeFile = async (file: File | undefined) => {
    if (!file || locked) return;
    try {
      const uri = await readImageAsDataUri(file, maxBytes);
      setError(undefined);
      onChange(uri);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onDrop = (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    setDragging(false);
    void takeFile(e.dataTransfer.files?.[0]);
  };

  const previewSize = mode === 'panel' ? 'h-16 w-16' : 'h-control-sm w-control-sm';
  const preview = (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted',
        previewSize,
        dragging && 'ring-1 ring-ring',
      )}
      onDragOver={(e) => {
        if (locked) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      aria-label={value ? 'Image preview' : 'No image'}
      role="img"
    >
      {value ? (
        <img src={value} alt="" className="max-h-full max-w-full object-contain" />
      ) : (
        <ImageIcon className="h-4 w-4 text-muted-foreground" aria-hidden />
      )}
    </div>
  );

  return (
    <Field mode={mode} label={label} description={description} errors={errors} id={id} className={className}>
      <div className="flex min-w-0 flex-col gap-1">
        {error && (
          <p className="text-2xs text-destructive" role="alert">
            {error}
          </p>
        )}
        <div className={cn('flex min-w-0 items-center gap-1', mode === 'panel' && 'items-start gap-2')}>
          {preview}
          <div
            className={cn(
              'flex min-w-0 flex-1 gap-1',
              mode === 'panel' ? 'flex-col' : 'flex-row items-center',
            )}
          >
            <TextInput
              id={id}
              value={value}
              onChange={onChange}
              placeholder={placeholder}
              mode={mode}
              readOnly={readOnly}
              disabled={disabled}
              mono
              className="min-w-0 flex-1"
            />
            <div className="flex items-center gap-1">
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label="Upload image"
                disabled={locked}
                onChange={(e) => {
                  void takeFile(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={locked}
                aria-label="Choose image file"
                onClick={() => fileRef.current?.click()}
                className="gap-1"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden />
                {mode === 'panel' && <span>Upload</span>}
              </Button>
              {value !== undefined && !locked && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-control-sm w-control-sm px-0"
                  aria-label="Clear image"
                  onClick={() => onChange(undefined)}
                >
                  <X className="h-3.5 w-3.5" aria-hidden />
                </Button>
              )}
            </div>
            {mode === 'panel' && (
              <p className="text-2xs text-muted-foreground">
                Drop a file on the preview or upload one (max {formatBytes(maxBytes)}); larger images should
                be hosted by URL.
              </p>
            )}
          </div>
        </div>
      </div>
    </Field>
  );
}
