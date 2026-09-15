// PropertyModal.jsx
// The title deed for one tile: what it costs, what it charges, who owns
// it, and every action its owner can take on it.

import {
  MORTGAGE_ROUNDS, TILE_TYPES, currentRent, getTileName, groupTileIds, mortgageRoundsLeft, mortgageValue,
  priceChangeFor, railroadOwnedCount, tileAccentColor, unmortgageCost, utilityMultiplier,
} from '../boardData';
import { useTranslation } from '../i18n/LanguageContext';
import CustomPricingSection, { PriceChangeBadge } from './CustomPricingSection';
import Modal from './Modal';
import PlayerAvatar from './PlayerAvatar';
import { hexToRgba, isLightColor } from '../colorUtils';
import Icon from './icons';

const RENT_ROW_KEYS = ['property.baseRent', 'property.houseCount', 'property.housesCount', 'property.housesCount', 'property.housesCount', 'property.hotel'];
const RENT_ROW_COUNTS = [null, 1, 2, 3, 4, null];

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-lg border border-ink/10 bg-ink/[0.04] px-2.5 py-1.5">
      <p className="text-[9.5px] font-bold uppercase tracking-wide text-ink-faint">{label}</p>
      <p className={`text-[14px] font-bold tnum ${tone === 'rent' ? 'text-rent' : 'text-ink'}`}>{value}</p>
    </div>
  );
}

export default function PropertyModal({
  tile, gameState, myPlayerId, isMyTurn, onClose, onBuildHouse, onSellHouse, onMortgage, onUnmortgage, onSetCustomPrice,
}) {
  const { t, language } = useTranslation();
  if (!tile) return null;

  const { board, properties, players } = gameState;
  const propState = properties[tile.id];
  const owner = propState?.ownerId ? players.find((p) => p.id === propState.ownerId) : null;
  const isOwner = propState?.ownerId === myPlayerId;
  const accent = tileAccentColor(tile);
  const ownable = !!propState;
  const rentNow = currentRent(tile, propState, board, properties);
  const mortgageLeft = mortgageRoundsLeft(propState, gameState.round);
  const inAuction = gameState.auction?.tileId === tile.id;
  const visitorChange = !isOwner ? priceChangeFor(propState, myPlayerId) : null;

  const groupIds = tile.type === TILE_TYPES.PROPERTY ? groupTileIds(board, tile.group) : [];
  const groupOwnedByMe = groupIds.length > 0 && groupIds.every((id) => properties[id]?.ownerId === myPlayerId);
  const minHousesInGroup = groupIds.length > 0 ? Math.min(...groupIds.map((id) => properties[id]?.houses || 0)) : 0;
  const maxHousesInGroup = groupIds.length > 0 ? Math.max(...groupIds.map((id) => properties[id]?.houses || 0)) : 0;

  const canBuild = isOwner && tile.type === TILE_TYPES.PROPERTY && !propState.mortgaged
    && groupOwnedByMe && propState.houses < 5 && propState.houses <= minHousesInGroup;
  const canSell = isOwner && tile.type === TILE_TYPES.PROPERTY && propState.houses > 0 && propState.houses >= maxHousesInGroup;

  const buildBlockReason = !isOwner || tile.type !== TILE_TYPES.PROPERTY ? null
    : propState.mortgaged ? t('property.blockedMortgaged')
      : !groupOwnedByMe ? t('property.blockedNoMonopoly')
        : propState.houses >= 5 ? t('property.blockedHotel')
          : propState.houses > minHousesInGroup ? t('property.blockedUneven')
            : null;

  return (
    <Modal
      onClose={onClose}
      widthClass="max-w-md"
      accent={`linear-gradient(90deg, ${accent}, ${hexToRgba(accent, 0.55)})`}
      title={getTileName(tile, language)}
      subtitle={t(`tileType.${tile.type}`)}
      icon={<span className="h-5 w-5 rounded-md" style={{ backgroundColor: accent }} />}
    >
      {/* The deed itself, on the same parchment as the board. */}
      <div className="overflow-hidden rounded-xl bg-board shadow-deed">
        <div
          className="flex items-center justify-between px-4 py-2"
          style={{ backgroundColor: accent, color: isLightColor(accent) ? '#1f2417' : '#fff' }}
        >
          <span className="text-[11px] font-black uppercase tracking-[0.16em]">{t('property.titleDeed')}</span>
          {tile.type === TILE_TYPES.PROPERTY && (
            <span className="text-[11px] font-bold uppercase tracking-wide opacity-80">{tile.group}</span>
          )}
        </div>

        <div className="p-4">
          <h3 className="mb-3 text-center font-display text-xl font-black leading-tight text-ink">
            {getTileName(tile, language)}
          </h3>

          <div className="mb-3 grid grid-cols-3 gap-1.5">
            <Stat label={t('tooltip.price')} value={`$${tile.price}`} />
            {rentNow != null && <Stat label={t('tooltip.rentNow')} value={`$${rentNow}`} tone="rent" />}
            {tile.type === TILE_TYPES.UTILITY && (
              <Stat label={t('tooltip.rentNow')} value={`${utilityMultiplier(owner?.id, board, properties)}×`} tone="rent" />
            )}
            <Stat label={t('property.mortgageValue')} value={`$${mortgageValue(tile)}`} />
            {tile.type === TILE_TYPES.PROPERTY && <Stat label={t('property.houseCost')} value={`$${tile.houseCost}`} />}
          </div>

          {tile.type === TILE_TYPES.PROPERTY && (
            <div className="overflow-hidden rounded-lg border border-ink/12">
              {tile.rent.map((amount, i) => {
                const active = propState?.ownerId && propState.houses === i;
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between px-3 py-1.5 text-[12.5px] ${i > 0 ? 'border-t border-ink/10' : ''} ${
                      active ? 'bg-brass/25 font-bold text-ink' : 'text-ink-soft'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      {i > 0 && i < 5 && Array.from({ length: i }).map((_, h) => <Icon.home key={h} className="h-3 w-3 text-go" />)}
                      {i === 5 && <Icon.hotel className="h-3.5 w-3.5 text-rent" />}
                      {t(RENT_ROW_KEYS[i], RENT_ROW_COUNTS[i] != null ? { count: RENT_ROW_COUNTS[i] } : undefined)}
                    </span>
                    <span className="font-display font-bold tnum">${amount}</span>
                  </div>
                );
              })}
              <p className="border-t border-ink/10 bg-ink/[0.04] px-3 py-1.5 text-[11px] text-ink-faint">
                {t('property.monopolyHint')}
              </p>
            </div>
          )}

          {tile.type === TILE_TYPES.RAILROAD && (
            <div className="overflow-hidden rounded-lg border border-ink/12">
              {(tile.rent || []).map((amount, i) => {
                const active = owner && railroadOwnedCount(owner.id, board, properties) === i + 1;
                return (
                  <div
                    key={i}
                    className={`flex items-center justify-between px-3 py-1.5 text-[12.5px] ${i > 0 ? 'border-t border-ink/10' : ''} ${
                      active ? 'bg-brass/25 font-bold text-ink' : 'text-ink-soft'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <Icon.train className="h-3.5 w-3.5" />
                      {t('property.stationsOwned', { count: i + 1 })}
                    </span>
                    <span className="font-display font-bold tnum">${amount}</span>
                  </div>
                );
              })}
            </div>
          )}

          {tile.type === TILE_TYPES.UTILITY && (
            <div className="overflow-hidden rounded-lg border border-ink/12 text-[12.5px] text-ink-soft">
              <p className="px-3 py-1.5">{t('property.utilityOne')}</p>
              <p className="border-t border-ink/10 px-3 py-1.5">{t('property.utilityBoth')}</p>
            </div>
          )}

          {!ownable && tile.amount != null && (
            <p className="rounded-lg bg-rent/10 px-3 py-2 text-center text-[13px] font-semibold text-rent tnum">
              -${tile.amount}
            </p>
          )}
        </div>
      </div>

      {/* Ownership */}
      {ownable && (
        <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-white/[0.08] bg-white/[0.03] p-2.5">
          {owner ? (
            <>
              <PlayerAvatar player={owner} sizeClassName="h-8 w-8" ringClassName="ring-2 ring-white/20" />
              <div className="min-w-0 flex-1">
                <p className="text-[12.5px] font-bold text-parch">{t('property.ownedBy', { name: owner.nickname })}</p>
                <p className="text-[11px] text-parch/40">
                  {propState.houses === 5
                    ? t('property.hotel')
                    : propState.houses > 0
                      ? t('property.housesCount', { count: propState.houses })
                      : t('property.noBuildings')}
                </p>
              </div>
              {propState.mortgaged && <span className="pill bg-rent/25 text-rent-light"><Icon.lock className="h-3 w-3" />{t('property.mortgaged')}</span>}
            </>
          ) : (
            <>
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-go/20 text-go-light">
                <Icon.flag className="h-4 w-4" />
              </span>
              <p className="text-[12.5px] font-semibold text-go-light">{t('property.unowned', { price: tile.price })}</p>
            </>
          )}
        </div>
      )}

      {/* The mortgage timer: how long the owner has left to pay it off. */}
      {ownable && propState.mortgaged && mortgageLeft != null && (
        <div className={`mt-2 flex items-start gap-2.5 rounded-xl border p-2.5 ${mortgageLeft === 0 ? 'border-rent/50 bg-rent/15' : 'border-white/[0.08] bg-white/[0.03]'}`}>
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${mortgageLeft === 0 ? 'bg-rent text-white' : 'bg-white/10 text-parch/70'}`}>
            <Icon.lock className="h-4 w-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-bold text-parch">
              {t('mortgageTimer.title')} · {mortgageLeft === 0 ? t('mortgageTimer.lastRound') : t('mortgageTimer.roundsLeft', { count: mortgageLeft })}
            </p>
            <p className="text-[11px] leading-snug text-parch/50">
              {mortgageLeft === 0 ? t('mortgageTimer.explainLast') : t('mortgageTimer.explain', { count: mortgageLeft })}
            </p>
            <div className="mt-1.5 flex gap-[3px]" aria-hidden="true">
              {Array.from({ length: MORTGAGE_ROUNDS }).map((_, i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i < MORTGAGE_ROUNDS - mortgageLeft ? 'bg-rent-light' : 'bg-white/15'}`} />
              ))}
            </div>
          </div>
        </div>
      )}

      {inAuction && (
        <p className="mt-2 flex items-center gap-2 rounded-xl border border-brass/45 bg-brass/10 px-3 py-2 text-[12.5px] font-bold text-brass-light">
          <Icon.bank className="h-4 w-4" />
          {t('auction.title')}
        </p>
      )}

      {/* A family price that applies to the viewer: what they pay here and how it last moved. */}
      {visitorChange && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-brass/35 bg-brass/10 px-3 py-2">
          <Icon.users className="h-4 w-4 text-brass-light" />
          <span className="text-[12.5px] font-bold text-parch">
            {t('familyPrice.yourPrice')}: <span className="text-brass-light tnum">${visitorChange.to}</span>
          </span>
          {visitorChange.from != null && <span className="text-[11px] text-parch/45 tnum">{t('familyPrice.was', { amount: visitorChange.from })}</span>}
          <PriceChangeBadge change={visitorChange} />
        </div>
      )}

      {/* Owner actions */}
      {isOwner && (
        <div className="mt-3 flex flex-col gap-2">
          <p className="section-label">{t('property.manage')}</p>
          {tile.type === TILE_TYPES.PROPERTY && !propState.mortgaged && (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={!canBuild || !isMyTurn}
                onClick={() => onBuildHouse(tile.id)}
                className="btn-success flex-1"
              >
                <Icon.home className="h-4 w-4" />
                {propState.houses === 4 ? t('property.buildHotel', { cost: tile.houseCost }) : t('property.build', { cost: tile.houseCost })}
              </button>
              {propState.houses > 0 && (
                <button
                  type="button"
                  disabled={!canSell || !isMyTurn}
                  onClick={() => onSellHouse(tile.id)}
                  className="btn-danger flex-1"
                >
                  {t('property.sellHouse', { amount: Math.floor(tile.houseCost / 2) })}
                </button>
              )}
            </div>
          )}
          {buildBlockReason && (
            <p className="flex items-start gap-1.5 rounded-lg bg-white/[0.04] px-2.5 py-1.5 text-[11.5px] text-parch/50">
              <Icon.warning className="mt-px h-3.5 w-3.5 shrink-0 text-brass/70" />
              {buildBlockReason}
            </p>
          )}
          {propState.mortgaged ? (
            <button type="button" disabled={!isMyTurn} onClick={() => onUnmortgage(tile.id)} className="btn-primary">
              {t('property.payOffMortgage', { cost: unmortgageCost(tile) })}
            </button>
          ) : (
            (propState.houses === 0 || tile.type !== TILE_TYPES.PROPERTY) && (
              <button type="button" disabled={!isMyTurn} onClick={() => onMortgage(tile.id)} className="btn-ghost">
                <Icon.lock className="h-4 w-4" />
                {t('property.mortgageFor', { amount: mortgageValue(tile) })}
              </button>
            )
          )}
          {!isMyTurn && <p className="text-center text-[11px] text-parch/35">{t('property.turnOnlyHint')}</p>}

          <CustomPricingSection
            tile={tile}
            propState={propState}
            gameState={gameState}
            myPlayerId={myPlayerId}
            onSetCustomPrice={onSetCustomPrice}
          />
        </div>
      )}
    </Modal>
  );
}
