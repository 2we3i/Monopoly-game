// RaiseFundsModal.jsx
// Landing on a square the player cannot afford: everything they could turn
// into cash - houses, mortgages, selling a deed back to the bank - with what
// each brings in, a running balance against the price, and the Buy button
// the moment the money is there. Nothing is sold on the player's behalf;
// every sale is their own click, and the server checks each one.

import { useEffect, useMemo, useState } from 'react';
import {
  MORTGAGE_ROUNDS, TILE_TYPES, bankBuybackValue, formatMoney, getTileName, groupTileIds,
  mortgageValue, ownedTileIds, tileAccentColor,
} from '../boardData';
import { useTranslation } from '../i18n/LanguageContext';
import { usePendingAction } from '../hooks/usePendingAction';
import { hexToRgba } from '../colorUtils';
import Modal from './Modal';
import Icon from './icons';

export default function RaiseFundsModal({
  gameState, playerId, tileId, onClose, actions,
}) {
  const { t, language } = useTranslation();
  const { board, properties, players } = gameState;
  const me = players.find((p) => p.id === playerId);
  const tile = board[tileId];
  const [pending, run] = usePendingAction(gameState.receivedAt);
  const [confirmSell, setConfirmSell] = useState(null);

  useEffect(() => {
    if (confirmSell == null) return undefined;
    const id = setTimeout(() => setConfirmSell(null), 4000);
    return () => clearTimeout(id);
  }, [confirmSell]);

  const rows = useMemo(() => ownedTileIds(playerId, properties)
    .map((id) => board[id])
    .filter(Boolean)
    .map((asset) => {
      const ps = properties[asset.id];
      const group = asset.type === TILE_TYPES.PROPERTY ? groupTileIds(board, asset.group) : [asset.id];
      const maxHouses = Math.max(...group.map((gid) => properties[gid]?.houses || 0));
      return {
        asset, ps, groupHasHouses: maxHouses > 0, canSellHouse: ps.houses > 0 && ps.houses >= maxHouses,
      };
    })
    .sort((a, b) => Number(a.ps.mortgaged) - Number(b.ps.mortgaged) || a.asset.id - b.asset.id), [board, properties, playerId]);

  if (!tile || !me) return null;

  const money = me.money;
  const short = Math.max(0, tile.price - money);
  const enough = short === 0;
  const progress = Math.min(1, Math.max(0, money) / (tile.price || 1));
  const accent = tileAccentColor(tile);
  const busy = !!pending;

  return (
    <Modal
      onClose={onClose}
      widthClass="max-w-xl"
      title={t('raise.title')}
      subtitle={t('raise.subtitle')}
      icon={<Icon.cash className="h-5 w-5" />}
      accent={`linear-gradient(90deg, ${accent}, ${hexToRgba(accent, 0.5)})`}
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <button type="button" onClick={onClose} className="btn-quiet px-4">{t('raise.back')}</button>
          <button
            type="button"
            disabled={!enough || busy}
            onClick={() => run('buy', () => actions.buyProperty(tileId))}
            className="btn-primary px-5 py-3 text-[15px]"
          >
            <Icon.check className="h-5 w-5" />
            {pending === 'buy' ? t('raise.working') : t('raise.buy', { price: tile.price })}
          </button>
        </div>
      )}
    >
      <div className="mb-3 rounded-xl border border-white/[0.08] bg-white/[0.03] p-3">
        <div className="flex items-center gap-2">
          <span className="h-4 w-4 shrink-0 rounded" style={{ backgroundColor: accent }} />
          <p className="min-w-0 flex-1 truncate text-[14px] font-bold text-parch">{getTileName(tile, language)}</p>
          <p className="text-[12.5px] text-parch/55">
            {t('raise.price')} <span className="font-bold text-parch tnum">{formatMoney(tile.price)}</span>
          </p>
        </div>
        <div
          className="mt-2 h-2.5 overflow-hidden rounded-full bg-black/35"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={tile.price}
          aria-valuenow={Math.max(0, money)}
        >
          <div className={`h-full rounded-full transition-[width] duration-300 ${enough ? 'bg-go-light' : 'bg-brass'}`} style={{ width: `${progress * 100}%` }} />
        </div>
        <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
          <span className="text-parch/55">
            {t('raise.balance')} <span className={`font-bold tnum ${money < 0 ? 'text-rent-light' : 'text-parch'}`}>{formatMoney(money)}</span>
          </span>
          {enough ? (
            <span className="flex items-center gap-1 font-bold text-go-light">
              <Icon.check className="h-4 w-4" />
              {t('raise.enough')}
            </span>
          ) : (
            <span className="font-bold text-rent-light">
              {t('raise.short')} <span className="tnum">{formatMoney(short)}</span>
            </span>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="my-8 text-center text-[13px] text-parch/45">{t('raise.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {rows.map(({
            asset, ps, groupHasHouses, canSellHouse,
          }) => {
            const houseValue = Math.floor((asset.houseCost || 0) / 2);
            const sellValue = bankBuybackValue(asset);
            const confirming = confirmSell === asset.id;
            return (
              <li key={asset.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.025] px-2.5 py-2">
                <span className="h-8 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: tileAccentColor(asset) }} />
                <div className="min-w-0 flex-1 basis-36">
                  <p className="truncate text-[13px] font-semibold text-parch">{getTileName(asset, language)}</p>
                  <p className="flex flex-wrap items-center gap-1.5 text-[11px] text-parch/40">
                    <span className="tnum">${asset.price}</span>
                    {ps.houses > 0 && (
                      <span className="text-go-light">
                        {ps.houses === 5
                          ? t('property.hotel')
                          : t(ps.houses === 1 ? 'property.houseCount' : 'property.housesCount', { count: ps.houses })}
                      </span>
                    )}
                    {ps.mortgaged && <span className="pill bg-rent/25 text-rent-light">{t('raise.mortgaged')}</span>}
                  </p>
                </div>
                {!ps.mortgaged && (
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {ps.houses > 0 && (
                      <button
                        type="button"
                        disabled={busy || !canSellHouse}
                        title={canSellHouse ? undefined : t('raise.unevenHouses')}
                        onClick={() => run(`house:${asset.id}`, () => actions.sellHouse(asset.id))}
                        className="btn-ghost px-2.5 py-1.5 text-[12px]"
                      >
                        <Icon.home className="h-3.5 w-3.5" />
                        {pending === `house:${asset.id}` ? t('raise.working') : `${ps.houses === 5 ? t('raise.sellHotel') : t('raise.sellHouse')} +$${houseValue}`}
                      </button>
                    )}
                    {ps.houses === 0 && (
                      <button
                        type="button"
                        disabled={busy}
                        title={t('raise.mortgageHint', { rounds: MORTGAGE_ROUNDS })}
                        onClick={() => run(`mortgage:${asset.id}`, () => actions.mortgage(asset.id))}
                        className="btn-ghost px-2.5 py-1.5 text-[12px]"
                      >
                        <Icon.lock className="h-3.5 w-3.5" />
                        {pending === `mortgage:${asset.id}` ? t('raise.working') : `${t('raise.mortgage')} +$${mortgageValue(asset)}`}
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy || groupHasHouses}
                      title={groupHasHouses ? t('raise.groupHasHouses') : t('raise.sellToBankHint')}
                      onClick={() => {
                        if (!confirming) {
                          setConfirmSell(asset.id);
                          return;
                        }
                        setConfirmSell(null);
                        run(`sell:${asset.id}`, () => actions.sellToBank(asset.id));
                      }}
                      className={`${confirming ? 'btn-danger' : 'btn-ghost'} px-2.5 py-1.5 text-[12px]`}
                    >
                      <Icon.cash className="h-3.5 w-3.5" />
                      {pending === `sell:${asset.id}`
                        ? t('raise.working')
                        : confirming ? t('raise.confirmSell', { amount: sellValue }) : `${t('raise.sellToBank')} +$${sellValue}`}
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-snug text-parch/40">
        <Icon.warning className="mt-px h-3.5 w-3.5 shrink-0 text-brass/60" />
        {t('raise.mortgageHint', { rounds: MORTGAGE_ROUNDS })} · {t('raise.sellToBankHint')}
      </p>
    </Modal>
  );
}
