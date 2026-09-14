// SettingsModal.jsx
// Everything a player can change about how the game looks and reads on
// their own screen. Each control is wired to real behaviour - nothing
// here is decorative.

import { useTranslation } from '../i18n/LanguageContext';
import { useSettings } from '../settings/SettingsContext';
import Modal from './Modal';
import Icon from './icons';

function Row({ icon: IconCmp, title, hint, children }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
      {IconCmp && (
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-parch/60">
          <IconCmp className="h-4 w-4" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-parch">{title}</p>
        {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-parch/40">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${checked ? 'bg-brass' : 'bg-white/15'}`}
    >
      <span
        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[1.4rem]' : 'left-0.5'}`}
      />
    </button>
  );
}

function Segmented({ value, onChange, options }) {
  return (
    <div className="flex rounded-lg border border-white/10 bg-black/25 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-2.5 py-1 text-[11.5px] font-bold transition-colors ${
            value === opt.value ? 'bg-brass text-ink' : 'text-parch/55 hover:text-parch'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export default function SettingsModal({ onClose }) {
  const { t, language, setLanguage, languages } = useTranslation();
  const { settings, update, reset } = useSettings();

  return (
    <Modal
      onClose={onClose}
      widthClass="max-w-lg"
      title={t('settings.title')}
      subtitle={t('settings.subtitle')}
      icon={<Icon.settings className="h-5 w-5" />}
      footer={(
        <div className="flex items-center justify-between gap-3">
          <button type="button" onClick={reset} className="btn-quiet px-3 py-2 text-[12.5px]">
            <Icon.refresh className="h-4 w-4" />
            {t('settings.reset')}
          </button>
          <button type="button" onClick={onClose} className="btn-primary px-5">{t('settings.done')}</button>
        </div>
      )}
    >
      <div className="flex flex-col gap-4">
        <section className="flex flex-col gap-1.5">
          <p className="section-label">{t('settings.language')}</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.entries(languages).map(([code, meta]) => (
              <button
                key={code}
                type="button"
                onClick={() => setLanguage(code)}
                className={`flex items-center justify-between rounded-xl border px-3 py-2.5 text-left transition-all ${
                  code === language
                    ? 'border-brass bg-brass/15 text-parch'
                    : 'border-white/[0.08] bg-white/[0.03] text-parch/60 hover:bg-white/[0.07]'
                }`}
              >
                <span className="text-[13px] font-semibold">{meta.nativeLabel}</span>
                {code === language && <Icon.check className="h-4 w-4 text-brass-light" />}
              </button>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-1.5">
          <p className="section-label">{t('settings.boardSection')}</p>
          <Row
            icon={Icon.eye}
            title={t('settings.tileLabels')}
            hint={t('settings.tileLabelsHint')}
          >
            <Segmented
              value={settings.tileLabels}
              onChange={(v) => update({ tileLabels: v })}
              options={[
                { value: 'auto', label: t('settings.auto') },
                { value: 'always', label: t('settings.always') },
                { value: 'never', label: t('settings.never') },
              ]}
            />
          </Row>
          <Row icon={Icon.home} title={t('settings.tileArt')} hint={t('settings.tileArtHint')}>
            <Toggle checked={settings.tileArt} onChange={(v) => update({ tileArt: v })} label={t('settings.tileArt')} />
          </Row>
          <Row icon={Icon.target} title={t('settings.tooltips')} hint={t('settings.tooltipsHint')}>
            <Toggle checked={settings.showTooltips} onChange={(v) => update({ showTooltips: v })} label={t('settings.tooltips')} />
          </Row>
          <Row icon={Icon.users} title={t('settings.largeTokens')} hint={t('settings.largeTokensHint')}>
            <Toggle checked={settings.largeTokens} onChange={(v) => update({ largeTokens: v })} label={t('settings.largeTokens')} />
          </Row>
          <Row icon={Icon.search} title={t('settings.zoomSpeed')} hint={t('settings.zoomSpeedHint')}>
            <Segmented
              value={String(settings.zoomSpeed)}
              onChange={(v) => update({ zoomSpeed: Number(v) })}
              options={[
                { value: '0.6', label: t('settings.slow') },
                { value: '1', label: t('settings.normal') },
                { value: '1.6', label: t('settings.fast') },
              ]}
            />
          </Row>
        </section>

        <section className="flex flex-col gap-1.5">
          <p className="section-label">{t('settings.interfaceSection')}</p>
          <Row icon={Icon.scroll} title={t('settings.activityLog')} hint={t('settings.activityLogHint')}>
            <Toggle checked={settings.showActivityLog} onChange={(v) => update({ showActivityLog: v })} label={t('settings.activityLog')} />
          </Row>
          <Row icon={Icon.dice} title={t('settings.animations')} hint={t('settings.animationsHint')}>
            <Toggle checked={settings.animations} onChange={(v) => update({ animations: v })} label={t('settings.animations')} />
          </Row>
        </section>

        <p className="flex items-start gap-2 rounded-xl bg-white/[0.03] px-3 py-2 text-[11.5px] leading-snug text-parch/40">
          <Icon.warning className="mt-px h-3.5 w-3.5 shrink-0 text-brass/60" />
          {t('settings.localOnly')}
        </p>
      </div>
    </Modal>
  );
}
