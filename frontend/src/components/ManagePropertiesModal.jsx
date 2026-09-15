// ManagePropertiesModal.jsx
// Every deed the player owns in one place, grouped the way the rules
// actually work (by color group), with the build / sell / mortgage
// actions inline. Without this, managing a portfolio means hunting for
// individual tiles on the board and opening them one at a time.

import { useMemo } from 'react';
import {
  MORTGAGE_ROUNDS, TILE_TYPES, formatMoney, getTileName, mortgageRoundsLeft, mortgageValue, netWorth,
  ownedTileIds, tileAccentColor, unmortgageCost,
} from '../boardData';
import { useTranslation } from '../i18n/LanguageContext';
import Modal from './Modal';
import { hexToRgba } from '../colorUtils';
import Icon from './icons';

function ActionButton({ children, onClick, disabled, title, tone = 'ghost' }) {
  const tones = {
    build: 'border-go/40 bg-go/15 text-go-light hover:bg-go/25',
    sell: 'border-rent/40 bg-rent/12 text-rent-light hover:bg-rent/22',
    ghost: 'border-white/12 bg-white/[0.04] text-parch/70 hover:bg-white/[0.1] hover:text-parch',
    brass: 'border-brass/45 bg-brass/15 text-brass-light hover:bg-brass/25',
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex h-7 shrink-0 items-center gap-1 rounded-lg border px-2 text-[11px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

export default function ManagePropertiesModal({
  gameState, playerId, isMyTurn, onClose, onSelectTile, onBuildHouse, onSellHouse, onMortgage, onUnmortgage,
  highlightOn = false, alwaysHighlight = false, onToggleHighlight,
}) {
  const { t, language } = useTranslation();
  const { board, properties, players } = gameState;
  const me = players.find((p) => p.id === playerId);

  const groups = useMemo(() => {
    const mine = ownedTileIds(playerId, properties);
    const map = new Map();
    mine.forEach((tileId) => {
      const tile = board[tileId];
      if (!tile) return;
      const key = tile.type === TILE_TYPES.PROPERTY ? `g:${tile.group}` : tile.type;
      if (!map.has(key)) {
        const totalInGroup = tile.type === TILE_TYPES.PROPERTY
          ? board.filter((x) => x.type === TILE_TYPES.PROPERTY && x.group === tile.group).length
          : board.filter((x) => x.type === tile.type).length;
        map.set(key, {
          key,
          label: tile.type === TILE_TYPES.PROPERTY ? tile.group : t(`tileType.${tile.type}`),
          color: tileAccentColor(tile),
          kind: tile.type,
          total: totalInGroup,
          tiles: [],
        });
      }
      map.get(key).tiles.push(tile);
    });
    return [...map.values()];
  }, [board, properties, playerId, t]);

  const worth = me ? netWorth(me, board, properties) : 0;
  const totalTiles = groups.reduce((n, g) => n + g.tiles.length, 0);

  return (
    <Modal
      onClose={onClose}
      widthClass="max-w-2xl"
      title={t('manage.title')}
      subtitle={t('manage.subtitle')}
      icon={<Icon.bank className="h-5 w-5" />}
    >
      {/* Show these deeds on the board itself, wherever the camera is. */}
      <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.08] bg-white/[0.03] px-3 py-2">
        <Icon.target className="h-4 w-4 shrink-0 text-brass-light" />
        <p className="min-w-0 flex-1 basis-40 text-[12px] leading-snug text-parch/60">
          {alwaysHighlight ? t('highlight.always') : t('highlight.hint')}
        </p>
        <button
          type="button"
          aria-pressed={highlightOn}
          disabled={alwaysHighlight || totalTiles === 0 || !onToggleHighlight}
          onClick={onToggleHighlight}
          className={`${highlightOn ? 'btn-primary' : 'btn-ghost'} shrink-0 px-3 py-1.5 text-[12.5px]`}
        >
          <Icon.eye className="h-4 w-4" />
          {highlightOn ? t('highlight.buttonOn') : t('highlight.button')}
        </button>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-2">
        <div className="panel-flat px-3 py-2">
          <p className="section-label">{t('manage.cash')}</p>
          <p className={`font-display text-[18px] font-bold tnum ${me?.money < 0 ? 'text-rent-light' : 'text-parch'}`}>
            {formatMoney(me?.money || 0)}
          </p>
        </div>
        <div className="panel-flat px-3 py-2">
          <p className="section-label">{t('sidebar.netWorth')}</p>
          <p className="font-display text-[18px] font-bold text-parch tnum">{formatMoney(worth)}</p>
        </div>
        <div className="panel-flat px-3 py-2">
          <p className="section-label">{t('manage.deeds')}</p>
          <p className="font-display text-[18px] font-bold text-parch tnum">{totalTiles}</p>
        </div>
      </div>

      {totalTiles === 0 ? (
        <div className="my-10 flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
            <Icon.bank className="h-6 w-6 text-parch/25" />
          </span>
          <p className="text-[13px] text-parch/45">{t('manage.empty')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((group) => {
            const complete = group.kind === TILE_TYPES.PROPERTY && group.tiles.length === group.total;
            const minHouses = Math.min(...group.tiles.map((x) => properties[x.id].houses));
            const maxHouses = Math.max(...group.tiles.map((x) => properties[x.id].houses));
            return (
              <section key={group.key} className="overflow-hidden rounded-xl border border-white/[0.08]">
                <header
                  className="flex items-center gap-2 px-3 py-1.5"
                  style={{ backgroundColor: hexToRgba(group.color, 0.22), borderBottom: `1px solid ${hexToRgba(group.color, 0.35)}` }}
                >
                  <span className="h-3 w-3 rounded-[3px]" style={{ backgroundColor: group.color }} />
                  <span className="flex-1 text-[12px] font-bold uppercase tracking-wide text-parch/85">{group.label}</span>
                  <span className="text-[11px] font-semibold text-parch/45 tnum">{group.tiles.length}/{group.total}</span>
                  {complete && (
                    <span className="pill bg-brass/30 text-brass-light">
                      <Icon.check className="h-3 w-3" />{t('manage.monopoly')}
                    </span>
                  )}
                </header>

                <div className="divide-y divide-white/[0.06]">
                  {group.tiles.map((tile) => {
                    const ps = properties[tile.id];
                    const roundsLeft = mortgageRoundsLeft(ps, gameState.round);
                    const canBuild = group.kind === TILE_TYPES.PROPERTY && complete && !ps.mortgaged
                      && ps.houses < 5 && ps.houses <= minHouses && isMyTurn && (me?.money || 0) >= tile.houseCost;
                    const canSell = group.kind === TILE_TYPES.PROPERTY && ps.houses > 0 && ps.houses >= maxHouses && isMyTurn;
                    return (
                      <div key={tile.id} className="flex items-center gap-2 px-2.5 py-2 hover:bg-white/[0.03]">
                        <button
                          type="button"
                          onClick={() => onSelectTile(tile.id)}
                          className="min-w-0 flex-1 text-left"
                          title={t('tooltip.clickForDetails')}
                        >
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-semibold text-parch">{getTileName(tile, language)}</span>
                            {ps.mortgaged && (
                              <span
                                className={`pill shrink-0 ${roundsLeft === 0 ? 'bg-rent text-white' : 'bg-rent/25 text-rent-light'}`}
                                title={roundsLeft === 0 ? t('mortgageTimer.explainLast') : t('mortgageTimer.explain', { count: roundsLeft })}
                              >
                                {t('property.mortgagedShort')}
                                {roundsLeft != null && ` · ${roundsLeft === 0 ? t('mortgageTimer.lastRound') : t('mortgageTimer.tileShort', { count: roundsLeft })}`}
                              </span>
                            )}
                          </span>
                          <span className="flex items-center gap-2 text-[11px] text-parch/40">
                            <span className="tnum">${tile.price}</span>
                            {ps.houses > 0 && (
                              <span className="flex items-center gap-0.5 text-go-light">
                                {ps.houses === 5
                                  ? <><Icon.hotel className="h-3 w-3" />{t('property.hotel')}</>
                                  : <><Icon.home className="h-3 w-3" />{ps.houses}</>}
                              </span>
                            )}
                          </span>
                        </button>

                        <div className="flex shrink-0 items-center gap-1">
                          {group.kind === TILE_TYPES.PROPERTY && (
                            <>
                              <ActionButton
                                tone="build"
                                disabled={!canBuild}
                                onClick={() => onBuildHouse(tile.id)}
                                title={t('property.build', { cost: tile.houseCost })}
                              >
                                <Icon.plus className="h-3 w-3" />
                                <span className="tnum">${tile.houseCost}</span>
                              </ActionButton>
                              {ps.houses > 0 && (
                                <ActionButton
                                  tone="sell"
                                  disabled={!canSell}
                                  onClick={() => onSellHouse(tile.id)}
                                  title={t('property.sellHouse', { amount: Math.floor(tile.houseCost / 2) })}
                                >
                                  <Icon.minus className="h-3 w-3" />
                                  <span className="tnum">${Math.floor(tile.houseCost / 2)}</span>
                                </ActionButton>
                              )}
                            </>
                          )}
                          {ps.mortgaged ? (
                            <ActionButton
                              tone="brass"
                              disabled={!isMyTurn || (me?.money || 0) < unmortgageCost(tile)}
                              onClick={() => onUnmortgage(tile.id)}
                              title={t('property.payOffMortgage', { cost: unmortgageCost(tile) })}
                            >
                              <Icon.lock className="h-3 w-3" />
                              <span className="tnum">-${unmortgageCost(tile)}</span>
                            </ActionButton>
                          ) : (
                            <ActionButton
                              disabled={!isMyTurn || ps.houses > 0}
                              onClick={() => onMortgage(tile.id)}
                              title={`${t('property.mortgageFor', { amount: mortgageValue(tile) })} · ${t('mortgageTimer.mortgageHint', { count: MORTGAGE_ROUNDS })}`}
                            >
                              <Icon.cash className="h-3 w-3" />
                              <span className="tnum">+${mortgageValue(tile)}</span>
                            </ActionButton>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {!isMyTurn && totalTiles > 0 && (
        <p className="mt-3 text-center text-[11.5px] text-parch/35">{t('property.turnOnlyHint')}</p>
      )}
    </Modal>
  );
}
