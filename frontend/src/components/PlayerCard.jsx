// PlayerCard.jsx
// One player's at-a-glance standing: money, holdings and status. The
// expanded state adds their actual deeds, which is what makes the panel
// useful for deciding who to trade with.

import { useMemo } from 'react';
import { TILE_TYPES, formatMoney, getTileName, netWorth, ownedTileIds, tileAccentColor } from '../boardData';
import { useTranslation } from '../i18n/LanguageContext';
import { hexToRgba } from '../colorUtils';
import PlayerAvatar from './PlayerAvatar';
import Icon from './icons';

// Groups the player's deeds by color group (plus stations/utilities) and
// records how close each one is to a monopoly - the single most useful
// fact when sizing up an opponent or planning a trade.
function useHoldings(player, board, properties) {
  return useMemo(() => {
    const mine = ownedTileIds(player.id, properties);
    const buckets = new Map();
    const totals = new Map();

    board.forEach((tile) => {
      let key = null;
      if (tile.type === TILE_TYPES.PROPERTY) key = `g:${tile.group}`;
      else if (tile.type === TILE_TYPES.RAILROAD) key = 'rail';
      else if (tile.type === TILE_TYPES.UTILITY) key = 'util';
      if (!key) return;
      totals.set(key, (totals.get(key) || 0) + 1);
    });

    mine.forEach((tileId) => {
      const tile = board[tileId];
      if (!tile) return;
      let key = null;
      if (tile.type === TILE_TYPES.PROPERTY) key = `g:${tile.group}`;
      else if (tile.type === TILE_TYPES.RAILROAD) key = 'rail';
      else if (tile.type === TILE_TYPES.UTILITY) key = 'util';
      if (!key) return;
      if (!buckets.has(key)) buckets.set(key, { key, color: tileAccentColor(tile), tiles: [], total: totals.get(key) || 0, kind: tile.type });
      buckets.get(key).tiles.push(tile);
    });

    return { tileIds: mine, groups: [...buckets.values()] };
  }, [player.id, board, properties]);
}

export default function PlayerCard({
  player, isCurrentTurn, isMe, board, properties, onTrade, expanded, onToggleExpand, onSelectTile,
}) {
  const { t, language } = useTranslation();
  const holdings = useHoldings(player, board, properties);
  const worth = useMemo(() => netWorth(player, board, properties), [player, board, properties]);
  const count = holdings.tileIds.length;

  return (
    <div
      className={`relative overflow-hidden rounded-xl border transition-all duration-200
        ${player.bankrupt
          ? 'border-white/5 bg-white/[0.02] opacity-60'
          : isCurrentTurn
            ? 'border-brass/60 bg-brass/[0.10] shadow-[0_0_0_1px_rgba(201,152,47,0.25),0_8px_24px_-12px_rgba(201,152,47,0.7)]'
            : 'border-white/[0.08] bg-white/[0.035] hover:border-white/[0.16]'}`}
    >
      {/* Identity stripe - the player's color, always on the same edge. */}
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ backgroundColor: player.bankrupt ? '#555' : player.color }} />

      <div className="flex items-center gap-3 py-2.5 pl-3.5 pr-3">
        <div className="relative shrink-0">
          <PlayerAvatar
            player={player}
            sizeClassName="h-10 w-10"
            ringClassName=""
            title={player.nickname}
          />
          {/* The ring is the player's own color, not a generic white one:
              it is the same cue their token carries on the board. */}
          <span
            className="pointer-events-none absolute inset-0 rounded-full"
            style={{ boxShadow: `0 0 0 2px ${hexToRgba(player.color, 0.9)}` }}
          />
          {!player.connected && !player.bankrupt && (
            <span
              className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-felt-700 bg-parch/40"
              title={t('sidebar.disconnected')}
            />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-[13.5px] font-bold text-parch">{player.nickname}</p>
            {isMe && <span className="shrink-0 text-[11px] font-medium text-parch/40">{t('sidebar.you')}</span>}
            {player.isHost && <Icon.crown className="h-3.5 w-3.5 shrink-0 text-brass/70" title={t('waiting.host')} />}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center gap-1 text-[11px] text-parch/45">
              <Icon.bank className="h-3 w-3" />
              <span className="tnum">{count}</span>
            </span>
            <span className="text-parch/20">·</span>
            <span className="inline-flex items-center gap-1 text-[11px] text-parch/45" title={t('sidebar.netWorth')}>
              <Icon.target className="h-3 w-3" />
              <span className="tnum">{formatMoney(worth)}</span>
            </span>
            {player.inJail && (
              <span className="pill bg-rent/20 text-rent-light"><Icon.jail className="h-2.5 w-2.5" />{t('sidebar.inJail')}</span>
            )}
            {player.getOutOfJailFreeCards > 0 && (
              <span className="pill bg-go/20 text-go-light" title={t('game.useJailCard')}>
                <Icon.scroll className="h-2.5 w-2.5" />{player.getOutOfJailFreeCards}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          {player.bankrupt ? (
            <span className="pill bg-rent/20 text-rent-light">{t('sidebar.bankrupt')}</span>
          ) : (
            <span className={`font-display text-[17px] font-bold leading-none tnum ${player.money < 0 ? 'text-rent-light' : 'text-parch'}`}>
              {formatMoney(player.money)}
            </span>
          )}
          <div className="flex items-center gap-1">
            {onTrade && !isMe && !player.bankrupt && (
              <button
                type="button"
                onClick={() => onTrade(player)}
                title={t('trade.tradeWith')}
                aria-label={t('trade.tradeWith')}
                className="flex h-6 items-center gap-1 rounded-md border border-brass/35 px-1.5 text-[10px] font-bold uppercase tracking-wide text-brass-light transition-colors hover:bg-brass/20"
              >
                <Icon.trade className="h-3 w-3" />
                {t('trade.tradeWith')}
              </button>
            )}
            {count > 0 && (
              <button
                type="button"
                onClick={onToggleExpand}
                title={t('sidebar.showProperties')}
                aria-label={t('sidebar.showProperties')}
                className="flex h-6 w-6 items-center justify-center rounded-md text-parch/40 transition-colors hover:bg-white/10 hover:text-parch"
              >
                {expanded ? <Icon.chevronUp className="h-3.5 w-3.5" /> : <Icon.chevronDown className="h-3.5 w-3.5" />}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Color-group progress: how close this player is to each monopoly. */}
      {count > 0 && (
        <div className="flex flex-wrap items-center gap-1 px-3.5 pb-2.5 pl-3.5">
          {holdings.groups.map((g) => {
            const complete = g.tiles.length === g.total;
            return (
              <span
                key={g.key}
                title={`${g.tiles.length}/${g.total}`}
                className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold ${complete ? 'text-ink' : 'text-parch/80'}`}
                style={{
                  backgroundColor: complete ? g.color : hexToRgba(g.color, 0.22),
                  boxShadow: complete ? `0 0 0 1px ${hexToRgba(g.color, 0.9)}` : `inset 0 0 0 1px ${hexToRgba(g.color, 0.5)}`,
                }}
              >
                {g.kind === TILE_TYPES.RAILROAD && <Icon.train className="h-2.5 w-2.5" />}
                {g.kind === TILE_TYPES.UTILITY && <Icon.bolt className="h-2.5 w-2.5" />}
                <span className="tnum">{g.tiles.length}/{g.total}</span>
                {complete && <Icon.check className="h-2.5 w-2.5" />}
              </span>
            );
          })}
        </div>
      )}

      {expanded && count > 0 && (
        <div className="animate-fade-in border-t border-white/[0.07] bg-black/15 px-2.5 py-2">
          <div className="flex flex-col gap-1">
            {holdings.tileIds.map((tileId) => {
              const tile = board[tileId];
              const ps = properties[tileId];
              return (
                <button
                  key={tileId}
                  type="button"
                  onClick={() => onSelectTile?.(tileId)}
                  className="flex items-center gap-2 rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-white/[0.07]"
                >
                  <span className="h-3.5 w-3.5 shrink-0 rounded-[3px]" style={{ backgroundColor: tileAccentColor(tile) }} />
                  <span className="min-w-0 flex-1 truncate text-[12px] text-parch/80">{getTileName(tile, language)}</span>
                  {ps?.houses > 0 && (
                    <span className="shrink-0 text-[10px] font-bold text-go-light">
                      {ps.houses === 5 ? t('property.hotel') : `${ps.houses}×`}
                    </span>
                  )}
                  {ps?.mortgaged && <Icon.lock className="h-3 w-3 shrink-0 text-rent-light" />}
                  <span className="shrink-0 text-[11px] font-semibold text-parch/40 tnum">${tile.price}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
