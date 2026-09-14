// SectionHeader.jsx
// A section's heading row: a title, how fresh the data is, a refresh button
// and any filters the section adds on the right.

import { useTranslation } from '../../i18n/LanguageContext';
import { Button } from '../ui/dash';

export default function SectionHeader({
  title, subtitle, updatedAt, onRefresh, loading, children,
}) {
  const { t, language } = useTranslation();
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-0 flex-1">
        {title && <h2 className="text-[14px] font-semibold text-zinc-100">{title}</h2>}
        {subtitle && <p className="text-[12px] text-zinc-500">{subtitle}</p>}
      </div>
      {children}
      {onRefresh && (
        <div className="flex items-center gap-2">
          {updatedAt && (
            <span className="text-[11px] text-zinc-600">
              {t('common.updated', { time: new Date(updatedAt).toLocaleTimeString(language === 'ru' ? 'ru-RU' : 'en-GB') })}
            </span>
          )}
          <Button icon="refresh" onClick={onRefresh} disabled={loading}>{t('common.refresh')}</Button>
        </div>
      )}
    </div>
  );
}
