// kit.jsx
// Form controls and dialogs the Creator's sections share: inputs, toggles,
// localized text fields, a picture field with upload, tabs, a search box,
// the confirmation dialog (with a second step for critical actions), a
// before/after view and a small toast system.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { Button, DashIcon, Dialog } from '../ui/dash';

const inputClass = 'h-9 w-full rounded-lg border border-white/10 bg-black/30 px-3 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:border-brass/60 focus:outline-none disabled:opacity-50 4xl:h-11 4xl:text-[15px]';

export function Label({ children, hint }) {
  return (
    <span className="mb-1 flex items-baseline gap-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500 4xl:text-[12.5px]">
      {children}
      {hint && <span className="normal-case tracking-normal text-zinc-600">{hint}</span>}
    </span>
  );
}

export function FieldRow({ label, hint, children, className = '' }) {
  return (
    <label className={`block min-w-0 ${className}`}>
      {label && <Label hint={hint}>{label}</Label>}
      {children}
    </label>
  );
}

export function TextInput({
  value, onChange, placeholder, className = '', ...rest
}) {
  return (
    <input
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`${inputClass} ${className}`}
      {...rest}
    />
  );
}

export function NumberInput({
  value, onChange, min, max, step = 1, className = '', ...rest
}) {
  return (
    <input
      type="number"
      value={value ?? ''}
      min={min}
      max={max}
      step={step}
      onChange={(e) => onChange(e.target.value === '' ? '' : Number(e.target.value))}
      className={`${inputClass} tnum ${className}`}
      {...rest}
    />
  );
}

export function TextArea({
  value, onChange, rows = 3, placeholder, className = '', ...rest
}) {
  return (
    <textarea
      value={value ?? ''}
      rows={rows}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:border-brass/60 focus:outline-none 4xl:text-[15px] ${className}`}
      {...rest}
    />
  );
}

export function Select({
  value, onChange, options, className = '', ...rest
}) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className={`h-9 w-full rounded-lg border border-white/10 bg-[#121418] px-2.5 text-[13px] text-zinc-200 focus:border-brass/60 focus:outline-none 4xl:h-11 4xl:text-[15px] ${className}`}
      {...rest}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>
      ))}
    </select>
  );
}

export function Toggle({
  checked, onChange, label, hint, disabled,
}) {
  return (
    <label className={`flex cursor-pointer items-start gap-3 ${disabled ? 'opacity-50' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={!!checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-full transition-colors ${checked ? 'bg-emerald-500/80' : 'bg-white/15'}`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${checked ? 'left-[18px]' : 'left-0.5'}`} />
      </button>
      {(label || hint) && (
        <span className="min-w-0">
          {label && <span className="block text-[13px] text-zinc-200 4xl:text-[15px]">{label}</span>}
          {hint && <span className="block text-[11.5px] text-zinc-500 4xl:text-[13px]">{hint}</span>}
        </span>
      )}
    </label>
  );
}

export function SearchBox({
  value, onChange, placeholder, className = '',
}) {
  return (
    <div className={`relative min-w-[200px] ${className}`}>
      <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-zinc-500"><DashIcon name="search" className="h-4 w-4" /></span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${inputClass} pl-8`}
      />
    </div>
  );
}

// { en, ru } side by side.
export function LocalizedInputs({
  value, onChange, label, multiline = false, rows = 2,
}) {
  const v = value || {};
  const set = (lang, text) => onChange({ ...v, [lang]: text });
  const Control = multiline ? TextArea : TextInput;
  return (
    <div>
      {label && <Label>{label}</Label>}
      <div className="grid gap-2 sm:grid-cols-2">
        {['ru', 'en'].map((lang) => (
          <div key={lang} className="relative">
            <span className="pointer-events-none absolute right-2 top-2 z-10 rounded bg-white/10 px-1 text-[9.5px] font-bold uppercase text-zinc-400">{lang}</span>
            <Control value={v[lang] || ''} onChange={(text) => set(lang, text)} rows={rows} className="pr-9" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function Tabs({ value, onChange, tabs }) {
  return (
    <div className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-white/[0.07]">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          onClick={() => onChange(tab.value)}
          className={`-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-[12.5px] font-medium transition-colors 4xl:text-[14.5px] ${
            value === tab.value ? 'border-brass-light text-zinc-50' : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          {tab.icon && <DashIcon name={tab.icon} className="h-3.5 w-3.5" />}
          {tab.label}
          {tab.count != null && <span className="rounded bg-white/10 px-1 text-[10.5px] text-zinc-400 tnum">{tab.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ icon = 'box', title, text, action }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/[0.05] text-zinc-500"><DashIcon name={icon} className="h-5 w-5" /></span>
      {title && <p className="text-[13.5px] font-medium text-zinc-300">{title}</p>}
      {text && <p className="max-w-md text-[12.5px] text-zinc-500">{text}</p>}
      {action}
    </div>
  );
}

export function Toolbar({ children, className = '' }) {
  return <div className={`flex flex-wrap items-center gap-2 ${className}`}>{children}</div>;
}

// --- values -----------------------------------------------------------------------

export function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? '✓' : '✗';
  if (typeof value === 'number') return value.toLocaleString();
  if (typeof value === 'string') return value;
  try {
    const text = JSON.stringify(value);
    return text.length > 140 ? `${text.slice(0, 140)}…` : text;
  } catch {
    return String(value);
  }
}

function flatten(value, prefix = '', out = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    Object.entries(value).forEach(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k, out));
  } else {
    out[prefix || 'value'] = value;
  }
  return out;
}

// The keys that changed between two values, with both sides.
export function ValueDiff({ before, after, limit = 40 }) {
  const { t } = useTranslation();
  const a = flatten(before ?? {});
  const b = flatten(after ?? {});
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])]
    .filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
  if (!keys.length) return <p className="text-[12px] text-zinc-500">{t('creator.diff.none')}</p>;
  return (
    <div className="overflow-hidden rounded-lg border border-white/[0.07]">
      <table className="w-full text-left text-[12px] 4xl:text-[13.5px]">
        <thead>
          <tr className="bg-white/[0.03] text-[10.5px] uppercase tracking-wider text-zinc-500">
            <th className="px-2.5 py-1.5 font-medium">{t('creator.diff.field')}</th>
            <th className="px-2.5 py-1.5 font-medium">{t('creator.diff.before')}</th>
            <th className="px-2.5 py-1.5 font-medium">{t('creator.diff.after')}</th>
          </tr>
        </thead>
        <tbody>
          {keys.slice(0, limit).map((k) => (
            <tr key={k} className="border-t border-white/[0.05] align-top">
              <td className="px-2.5 py-1.5 font-mono text-[11px] text-zinc-400">{k}</td>
              <td className="break-all px-2.5 py-1.5 text-red-300/90">{formatValue(a[k])}</td>
              <td className="break-all px-2.5 py-1.5 text-emerald-300/90">{formatValue(b[k])}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {keys.length > limit && <p className="border-t border-white/[0.05] px-2.5 py-1.5 text-[11px] text-zinc-500">+{keys.length - limit}</p>}
    </div>
  );
}

// --- confirmation -----------------------------------------------------------------------------
//
// ask({ title, message, confirmLabel, tone, critical, typeToConfirm, details })
// resolves true or false. A critical action has two steps: the question,
// then "this cannot be undone lightly - are you sure?" (optionally typing a
// word).

function ConfirmDialog({ request, onDone }) {
  const { t } = useTranslation();
  const [step, setStep] = useState(1);
  const [typed, setTyped] = useState('');
  const needsSecond = !!request.critical;
  const word = request.typeToConfirm || null;
  const canConfirm = step === 1 || !word || typed.trim().toLowerCase() === String(word).toLowerCase();

  const confirm = () => {
    if (needsSecond && step === 1) {
      setStep(2);
      return;
    }
    onDone(true);
  };

  return (
    <Dialog
      title={step === 1 ? request.title : t('creator.confirm.secondTitle')}
      onClose={() => onDone(false)}
      width="max-w-lg"
      footer={(
        <>
          <Button onClick={() => onDone(false)}>{t('common.cancel')}</Button>
          <Button tone={request.tone || 'danger'} disabled={!canConfirm} onClick={confirm} icon={step === 1 && needsSecond ? 'arrowUp' : 'check'}>
            {step === 1 && needsSecond ? t('creator.confirm.continue') : (request.confirmLabel || t('creator.confirm.yes'))}
          </Button>
        </>
      )}
    >
      {step === 1 ? (
        <div className="flex flex-col gap-3">
          {request.message && <p className="text-zinc-300">{request.message}</p>}
          {request.details}
          {needsSecond && (
            <p className="flex items-center gap-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
              <DashIcon name="shield" className="h-4 w-4 shrink-0" />
              {t('creator.confirm.criticalNote')}
            </p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-zinc-200">{request.secondMessage || request.message}</p>
          <p className="rounded-lg border border-red-400/25 bg-red-500/[0.08] px-3 py-2 text-[12.5px] text-red-200">{t('creator.confirm.secondText')}</p>
          {word && (
            <FieldRow label={t('creator.confirm.typeWord', { word })}>
              <TextInput value={typed} onChange={setTyped} autoFocus placeholder={word} />
            </FieldRow>
          )}
        </div>
      )}
    </Dialog>
  );
}

const CreatorContext = createContext(null);

export function CreatorProvider({ children, token, me }) {
  const [request, setRequest] = useState(null);
  const [toasts, setToasts] = useState([]);
  const resolver = useRef(null);
  const nextId = useRef(1);

  const ask = useCallback((options) => new Promise((resolve) => {
    resolver.current = resolve;
    setRequest({ ...options, key: Date.now() });
  }), []);

  const done = (answer) => {
    setRequest(null);
    resolver.current?.(answer);
    resolver.current = null;
  };

  const toast = useCallback((message, tone = 'green') => {
    const id = nextId.current;
    nextId.current += 1;
    setToasts((list) => [...list, { id, message, tone }]);
    setTimeout(() => setToasts((list) => list.filter((x) => x.id !== id)), 4200);
  }, []);

  const can = useCallback((permission) => !!me?.permissions?.includes(permission), [me]);
  const value = useMemo(() => ({
    ask, toast, token, me, can,
  }), [ask, toast, token, me, can]);

  return (
    <CreatorContext.Provider value={value}>
      {children}
      {request && <ConfirmDialog key={request.key} request={request} onDone={done} />}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[90] flex w-[min(92vw,380px)] flex-col gap-2">
        {toasts.map((x) => (
          <div
            key={x.id}
            className={`pointer-events-auto animate-slide-up rounded-xl border px-3.5 py-2.5 text-[12.5px] shadow-deep backdrop-blur 4xl:text-[14.5px] ${
              x.tone === 'red' ? 'border-red-400/30 bg-[#2a1414]/95 text-red-200' : 'border-emerald-400/25 bg-[#10231b]/95 text-emerald-100'
            }`}
          >
            {x.message}
          </div>
        ))}
      </div>
    </CreatorContext.Provider>
  );
}

export function useCreator() {
  return useContext(CreatorContext);
}

// --- requests ------------------------------------------------------------------------------------

export async function creatorRequest(token, path, { method = 'GET', body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data.code || null;
    throw err;
  }
  return data;
}

export async function uploadFile(token, path, file, fields = {}) {
  const form = new FormData();
  form.append('file', file);
  Object.entries(fields).forEach(([k, v]) => { if (v != null) form.append(k, v); });
  const res = await fetch(path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
  return data;
}

// Runs an action with a busy flag, a toast on success and on failure.
export function useAction() {
  const { toast } = useCreator();
  const [busy, setBusy] = useState(false);
  const run = useCallback(async (fn, successMessage) => {
    setBusy(true);
    try {
      const out = await fn();
      if (successMessage) toast(successMessage);
      return out;
    } catch (err) {
      toast(err.message, 'red');
      return null;
    } finally {
      setBusy(false);
    }
  }, [toast]);
  return [busy, run];
}

// A picture: preview, a URL, and an upload that stores the file in the
// media library and fills the URL in.
export function ImageField({
  value, onChange, label, title,
}) {
  const { t } = useTranslation();
  const { token, toast } = useCreator();
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy(true);
    try {
      const { asset } = await uploadFile(token, '/api/admin/media', file, { title: title || file.name });
      onChange(asset.url);
      toast(t('creator.media.uploaded'));
    } catch (err) {
      toast(err.message, 'red');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      {label && <Label>{label}</Label>}
      <div className="flex gap-3">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-[repeating-conic-gradient(#1b1d22_0%_25%,#15171b_0%_50%)] bg-[length:16px_16px] 4xl:h-24 4xl:w-24">
          {value ? <img src={value} alt="" className="h-full w-full object-contain" /> : <DashIcon name="eye" className="h-5 w-5 text-zinc-600" />}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <TextInput value={value || ''} onChange={onChange} placeholder="/media/…" />
          <div className="flex flex-wrap gap-2">
            <input ref={input} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={pick} />
            <Button icon="plus" disabled={busy} onClick={() => input.current?.click()}>{busy ? t('common.loading') : t('creator.media.upload')}</Button>
            {value && <Button tone="subtle" icon="close" onClick={() => onChange('')}>{t('creator.media.clear')}</Button>}
          </div>
        </div>
      </div>
    </div>
  );
}

export function useDebounced(value, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return debounced;
}

export function localizedText(value, language) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return value[language] || value.en || value.ru || '';
}
