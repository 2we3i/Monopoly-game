// PlayerCard.jsx
// One row per player in the sidebar: avatar, name, money, and status badges
// (current turn, in jail, disconnected, bankrupt).

import { useTranslation } from '../i18n/LanguageContext';

export default function PlayerCard({ player, isCurrentTurn, isMe, propertyCount }) {
  const { t } = useTranslation();
  return (
    <div
      className={`relative flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-all ${
        player.bankrupt
          ? 'border-ink/10 bg-ink/5 opacity-50'
          : isCurrentTurn
            ? 'border-brass bg-brass/15 shadow-brass'
            : 'border-board-line bg-board-tile'
      }`}
    >
      <div className="relative shrink-0">
        <span
          className="block h-9 w-9 rounded-full shadow-token ring-2 ring-white/50"
          style={{ backgroundColor: player.color }}
          aria-hidden="true"
        />
        {!player.connected && !player.bankrupt && (
          <span
            className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-board-tile bg-ink-faint"
            title={t('sidebar.disconnected')}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
          <span className="truncate">{player.nickname}</span>
          {isMe && <span className="text-xs font-normal text-ink-faint">{t('sidebar.you')}</span>}
        </p>
        <div className="flex items-center gap-1.5 text-xs text-ink-faint">
          <span>{t(propertyCount === 1 ? 'sidebar.property' : 'sidebar.properties', { count: propertyCount })}</span>
          {player.inJail && <span className="rounded bg-rent/15 px-1.5 py-0.5 font-medium text-rent">{t('sidebar.inJail')}</span>}
        </div>
      </div>

      <div className="shrink-0 text-right">
        {player.bankrupt ? (
          <span className="text-xs font-bold uppercase tracking-wide text-rent">{t('sidebar.bankrupt')}</span>
        ) : (
          <span className={`font-display text-lg font-semibold ${player.money < 0 ? 'text-rent' : 'text-ink'}`}>
            ${player.money.toLocaleString()}
          </span>
        )}
      </div>

      {isCurrentTurn && !player.bankrupt && (
        <span className="absolute -left-1 -top-1 h-3 w-3 animate-pulse rounded-full bg-brass ring-2 ring-board" />
      )}
    </div>
  );
}
