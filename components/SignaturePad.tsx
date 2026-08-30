import React, { useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { firestoreService } from '../lib/services';
import { Button, Card, InlineNote } from './ui';

/**
 * Sign once, appears on every report card you sign.
 *
 * Drawn on a canvas rather than typed, because a typed name is not a signature and
 * reads as one on a document parents keep. Saved as a PNG against the signer's own
 * account: only they can set it, and the report card pulls it from whoever actually
 * signed that report — never borrowed from another member of staff.
 *
 * No library: a canvas and pointer events do this in far less code than a dependency.
 */
export const SignaturePad: React.FC<{ label?: string }> = ({ label = 'Your signature' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);

  const [saved, setSaved] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [hasInk, setHasInk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    firestoreService
      .getMySignature()
      .then((sig) => {
        if (!cancelled) setSaved(sig);
      })
      .catch(() => {
        /* An unreachable server should not stop the page rendering. */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Size the backing store to the device pixel ratio, or the ink looks furry.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#0f172a';
  }, [loading]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawing.current = true;
    dirty.current = true;
    setHasInk(true);
    const { x, y } = pos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const { x, y } = pos(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const end = () => {
    drawing.current = false;
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    dirty.current = false;
    setHasInk(false);
    setStatus(null);
  };

  const save = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !dirty.current) return;
    setBusy(true);
    setStatus(null);
    try {
      const dataUrl = canvas.toDataURL('image/png');
      await firestoreService.saveMySignature(dataUrl);
      setSaved(dataUrl);
      clear();
      setStatus({ tone: 'ok', text: 'Signature saved. It will appear on report cards you sign from now on.' });
    } catch (err) {
      setStatus({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not save that signature.' });
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Remove your saved signature? Report cards you sign after this will show a blank line.')) return;
    setBusy(true);
    setStatus(null);
    try {
      await firestoreService.saveMySignature(null);
      setSaved(null);
      setStatus({ tone: 'ok', text: 'Signature removed.' });
    } catch (err) {
      setStatus({ tone: 'bad', text: err instanceof Error ? err.message : 'Could not remove that signature.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <p className="text-[15px] font-bold tracking-[-0.02em] text-slate-900 dark:text-white">{label}</p>
        <p className="mt-1 text-[11.5px] text-slate-500 leading-relaxed">
          Sign once here and it is printed on every report card you sign. It is stored against your account only —
          nobody else can put it on a document.
        </p>
      </div>

      {loading ? (
        <div className="h-[132px] rounded-[14px] skeleton bg-slate-100 dark:bg-slate-800" />
      ) : saved ? (
        <div className="flex flex-col gap-3">
          <div className="rounded-[14px] border border-slate-200 dark:border-slate-700 bg-white p-3 flex items-center justify-center">
            <img src={saved} alt="Your saved signature" className="max-h-[92px] object-contain" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon="edit" onClick={() => setSaved(null)} disabled={busy}>
              Draw a new one
            </Button>
            <Button variant="secondary" icon="delete" onClick={remove} loading={busy}>
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <canvas
            ref={canvasRef}
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerLeave={end}
            aria-label="Signature drawing area"
            className="w-full h-[132px] rounded-[14px] border border-dashed border-slate-300 dark:border-slate-600 bg-white touch-none cursor-crosshair"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button icon="save" onClick={save} loading={busy} disabled={!hasInk}>
              Save signature
            </Button>
            <Button variant="secondary" icon="reset" onClick={clear} disabled={!hasInk || busy}>
              Clear
            </Button>
            <span className="text-[11px] text-slate-400 inline-flex items-center gap-1.5">
              <Icon name="edit" className="text-[13px]" />
              Draw with a mouse, trackpad or finger
            </span>
          </div>
        </div>
      )}

      {status && (
        <InlineNote tone={status.tone === 'ok' ? 'mint' : 'blush'} icon={status.tone === 'ok' ? 'check_circle' : 'priority_high'}>
          {status.text}
        </InlineNote>
      )}
    </Card>
  );
};
