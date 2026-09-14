// MafiaSettings.jsx
// The host's rule book. Every control here sends a patch to the server,
// which merges it into the room's settings and hands the whole table
// back - so what the lobby shows is always what the engine will actually
// play, never a local guess at it.

import { useTranslation } from '../../i18n/LanguageContext';
import Modal from '../Modal';
import Icon from '../icons';

const ROLE_IDS = ['MAFIA', 'DON', 'SHERIFF', 'DOCTOR', 'MANIAC'];

const MODIFIERS = [
  'randomRoles', 'doctorSelfHeal', 'immortal', 'doubleVote', 'secretVote', 'extraManiac',
  'nightEvents', 'dayEvents', 'roleSwap', 'fastNight', 'fastDay', 'chaos',
];

export function Toggle({ checked, onChange, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-30 ${checked ? 'bg-rent' : 'bg-white/15'}`}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? 'left-[1.4rem]' : 'left-0.5'}`} />
    </button>
  );
}

export function Segmented({ value, onChange, options, disabled }) {
  return (
    <div className="flex shrink-0 rounded-lg border border-white/10 bg-black/30 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-2 py-1 text-[11.5px] font-bold transition-colors disabled:opacity-40 ${
            String(value) === String(opt.value) ? 'bg-rent text-white' : 'text-parch/55 hover:text-parch'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Stepper({ value, onChange, min = 0, max = 9, disabled }) {
  return (
    <div className="flex shrink-0 items-center gap-1 rounded-lg border border-white/10 bg-black/30 p-0.5">
      <button
        type="button"
        disabled={disabled || value <= min}
        onClick={() => onChange(value - 1)}
        className="flex h-6 w-6 items-center justify-center rounded-md text-parch/60 transition-colors hover:bg-white/10 hover:text-parch disabled:opacity-25"
      >
        <Icon.minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-6 text-center text-[13px] font-bold text-parch tnum">{value}</span>
      <button
        type="button"
        disabled={disabled || value >= max}
        onClick={() => onChange(value + 1)}
        className="flex h-6 w-6 items-center justify-center rounded-md text-parch/60 transition-colors hover:bg-white/10 hover:text-parch disabled:opacity-25"
      >
        <Icon.plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function Row({ title, hint, children }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-white/[0.07] bg-white/[0.025] px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-parch">{title}</p>
        {hint && <p className="mt-0.5 text-[11.5px] leading-snug text-parch/40">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Section({ title, icon: IconCmp, children }) {
  return (
    <section className="flex flex-col gap-1.5">
      <p className="section-label flex items-center gap-1.5">
        {IconCmp && <IconCmp className="h-3.5 w-3.5" />}
        {title}
      </p>
      {children}
    </section>
  );
}

export default function MafiaSettingsModal({ settings, roleSummary, playerCount, isHost, onPatch, onPreset, onRandom, onClose }) {
  const { t } = useTranslation();
  const locked = !isHost;
  const set = (patch) => { if (isHost) onPatch(patch); };
  const fun = settings.fun || { enabled: false, modifiers: {} };

  const secs = (key, value, options) => (
    <Segmented
      disabled={locked}
      value={value}
      onChange={(v) => set(key(Number(v)))}
      options={options.map((n) => ({ value: n, label: `${n}${t('mafia.secondsShort')}` }))}
    />
  );

  return (
    <Modal
      onClose={onClose}
      widthClass="max-w-2xl"
      title={t('mafia.settingsTitle')}
      subtitle={locked ? t('mafia.settingsHostOnly') : t('mafia.settingsSubtitle')}
      icon={<Icon.settings className="h-5 w-5" />}
      footer={(
        <div className="flex items-center justify-between gap-2">
          <button type="button" disabled={locked} onClick={onRandom} className="btn-ghost px-3 py-2 text-[12.5px]">
            🎲 {t('mafia.randomSettings')}
          </button>
          <button type="button" onClick={onClose} className="btn-primary px-5">{t('settings.done')}</button>
        </div>
      )}
    >
      <div className="flex flex-col gap-4">
        {/* Presets ------------------------------------------------- */}
        <Section title={t('mafia.presets')} icon={Icon.scroll}>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {['CLASSIC', 'FAST', 'BIG_PARTY', 'WITH_MANIAC', 'CHAOS', 'FUN'].map((id) => (
              <button
                key={id}
                type="button"
                disabled={locked}
                onClick={() => onPreset(id)}
                className="rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-left text-[12.5px] font-semibold text-parch/80 transition-all hover:border-rent/50 hover:bg-rent/10 hover:text-parch disabled:opacity-40"
              >
                {t(`mafia.preset.${id}`)}
              </button>
            ))}
          </div>
        </Section>

        {/* Roles --------------------------------------------------- */}
        <Section title={t('mafia.rolesSection')} icon={Icon.users}>
          <Row title={t('mafia.autoBalance')} hint={t('mafia.autoBalanceHint')}>
            <Toggle disabled={locked} checked={settings.autoBalance} onChange={(v) => set({ autoBalance: v })} label={t('mafia.autoBalance')} />
          </Row>
          {ROLE_IDS.map((id) => (
            <Row key={id} title={t(`mafia.role.${id}`)} hint={t(`mafia.roleHint.${id}`)}>
              <Stepper
                disabled={locked || settings.autoBalance}
                value={settings.roles?.[id] || 0}
                min={0}
                max={id === 'DON' ? 1 : 6}
                onChange={(v) => set({ roles: { ...settings.roles, [id]: v } })}
              />
            </Row>
          ))}
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5">
            <span className="mr-1 text-[11.5px] text-parch/45">{t('mafia.dealPreview', { count: playerCount })}</span>
            {Object.entries(roleSummary || {}).filter(([, n]) => n > 0).map(([id, n]) => (
              <span key={id} className={`pill ${id === 'MAFIA' || id === 'DON' ? 'bg-rent/25 text-rent-light' : id === 'MANIAC' ? 'bg-violet-500/25 text-violet-200' : 'bg-white/[0.08] text-parch/70'}`}>
                {t(`mafia.role.${id}`)} · {n}
              </span>
            ))}
          </div>
        </Section>

        {/* Night --------------------------------------------------- */}
        <Section title={t('mafia.nightSection')} icon={Icon.eye}>
          <Row title={t('mafia.nightDuration')}>
            {secs((v) => ({ night: { durationSec: v } }), settings.night.durationSec, [20, 30, 40, 60])}
          </Row>
          <Row title={t('mafia.allowChangeTarget')} hint={t('mafia.allowChangeTargetHint')}>
            <Toggle disabled={locked} checked={settings.night.allowChangeTarget} onChange={(v) => set({ night: { allowChangeTarget: v } })} label={t('mafia.allowChangeTarget')} />
          </Row>
          <Row title={t('mafia.allowRepeatTarget')} hint={t('mafia.allowRepeatTargetHint')}>
            <Toggle disabled={locked} checked={settings.night.allowRepeatTarget} onChange={(v) => set({ night: { allowRepeatTarget: v } })} label={t('mafia.allowRepeatTarget')} />
          </Row>
          <Row title={t('mafia.showOwnResult')} hint={t('mafia.showOwnResultHint')}>
            <Toggle disabled={locked} checked={settings.night.showOwnResult} onChange={(v) => set({ night: { showOwnResult: v } })} label={t('mafia.showOwnResult')} />
          </Row>
        </Section>

        {/* Day ----------------------------------------------------- */}
        <Section title={t('mafia.daySection')} icon={Icon.chat}>
          <Row title={t('mafia.discussion')}>
            {secs((v) => ({ day: { discussionSec: v } }), settings.day.discussionSec, [60, 90, 120, 180])}
          </Row>
          <Row title={t('mafia.voteDuration')}>
            {secs((v) => ({ day: { voteSec: v } }), settings.day.voteSec, [20, 30, 45, 60])}
          </Row>
          <Row title={t('mafia.allowVoteChange')}>
            <Toggle disabled={locked} checked={settings.day.allowVoteChange} onChange={(v) => set({ day: { allowVoteChange: v } })} label={t('mafia.allowVoteChange')} />
          </Row>
          <Row title={t('mafia.allowAbstain')}>
            <Toggle disabled={locked} checked={settings.day.allowAbstain} onChange={(v) => set({ day: { allowAbstain: v } })} label={t('mafia.allowAbstain')} />
          </Row>
          <Row title={t('mafia.executionRule')} hint={t('mafia.executionRuleHint')}>
            <Segmented
              disabled={locked}
              value={settings.day.executionRule}
              onChange={(v) => set({ day: { executionRule: v } })}
              options={[
                { value: 'PLURALITY', label: t('mafia.plurality') },
                { value: 'MAJORITY', label: t('mafia.majority') },
              ]}
            />
          </Row>
          <Row title={t('mafia.tieResolution')} hint={t('mafia.tieResolutionHint')}>
            <Segmented
              disabled={locked}
              value={settings.day.tieResolution}
              onChange={(v) => set({ day: { tieResolution: v } })}
              options={[
                { value: 'NO_EXECUTION', label: t('mafia.tieNobody') },
                { value: 'RANDOM', label: t('mafia.tieRandom') },
                { value: 'REVOTE', label: t('mafia.tieRevote') },
              ]}
            />
          </Row>
        </Section>

        {/* Information --------------------------------------------- */}
        <Section title={t('mafia.infoSection')} icon={Icon.scroll}>
          {['revealRoleOnDeath', 'showDeathCause', 'showNightResults', 'showVoteCounts', 'showPlayerStats', 'showHistory'].map((key) => (
            <Row key={key} title={t(`mafia.info.${key}`)}>
              <Toggle disabled={locked} checked={settings.info[key]} onChange={(v) => set({ info: { [key]: v } })} label={t(`mafia.info.${key}`)} />
            </Row>
          ))}
        </Section>

        {/* Win ----------------------------------------------------- */}
        <Section title={t('mafia.winSection')} icon={Icon.crown}>
          {['mafiaWinsOnParity', 'maniacBlocksTownWin', 'maniacWinsAtParity'].map((key) => (
            <Row key={key} title={t(`mafia.win.${key}`)} hint={t(`mafia.winHint.${key}`)}>
              <Toggle disabled={locked} checked={settings.win[key]} onChange={(v) => set({ win: { [key]: v } })} label={t(`mafia.win.${key}`)} />
            </Row>
          ))}
        </Section>

        {/* Fun ----------------------------------------------------- */}
        <Section title={`🎉 ${t('mafia.funSection')}`} icon={Icon.chance}>
          <Row title={t('mafia.funEnabled')} hint={t('mafia.funEnabledHint')}>
            <Toggle disabled={locked} checked={fun.enabled} onChange={(v) => set({ fun: { enabled: v } })} label={t('mafia.funEnabled')} />
          </Row>
          <div className={`grid gap-1.5 sm:grid-cols-2 ${fun.enabled ? '' : 'pointer-events-none opacity-40'}`}>
            {MODIFIERS.map((key) => (
              <button
                key={key}
                type="button"
                disabled={locked || !fun.enabled}
                onClick={() => set({ fun: { modifiers: { [key]: !fun.modifiers?.[key] } } })}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-left transition-all ${
                  fun.modifiers?.[key]
                    ? 'border-rent/60 bg-rent/15 text-parch'
                    : 'border-white/[0.08] bg-white/[0.03] text-parch/55 hover:bg-white/[0.07]'
                }`}
              >
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${fun.modifiers?.[key] ? 'border-rent bg-rent text-white' : 'border-white/20'}`}>
                  {fun.modifiers?.[key] && <Icon.check className="h-3 w-3" />}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] font-semibold">{t(`mafia.mod.${key}`)}</span>
                  <span className="block truncate text-[11px] text-parch/40">{t(`mafia.modHint.${key}`)}</span>
                </span>
              </button>
            ))}
          </div>
        </Section>
      </div>
    </Modal>
  );
}
