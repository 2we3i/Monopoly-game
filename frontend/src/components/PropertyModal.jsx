// PropertyModal.jsx
// Detail view for a single tile, opened by clicking any tile on the board.
// Shows rent table (properties), current owner, and - if the viewer owns
// it and it's their turn - build/sell house and mortgage/unmortgage
// actions. All actions are still validated server-side; this UI just
// avoids showing buttons for actions that would obviously fail.

import { GROUP_COLORS, TILE_TYPES } from '../boardData';

const RENT_LABELS = ['Base rent', '1 house', '2 houses', '3 houses', '4 houses', 'Hotel'];

export default function PropertyModal({
  tile, properties, players, myPlayerId, isMyTurn, onClose,
  onBuildHouse, onSellHouse, onMortgage, onUnmortgage,
}) {
  if (!tile) return null;
  const propState = properties[tile.id];
  const owner = propState?.ownerId ? players.find((p) => p.id === propState.ownerId) : null;
  const isOwner = propState?.ownerId === myPlayerId;
  const isPurchasable = [TILE_TYPES.PROPERTY, TILE_TYPES.RAILROAD, TILE_TYPES.UTILITY].includes(tile.type);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/55 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="max-h-[85vh] w-full max-w-sm overflow-y-auto scrollbar-thin rounded-t-2xl border border-brass/25 bg-board shadow-board texture-parchment sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {tile.group && <div className="h-4 w-full" style={{ backgroundColor: GROUP_COLORS[tile.group], boxShadow: 'inset 0 -2px 4px rgba(0,0,0,0.15)' }} />}

        <div className="p-5">
          <div className="mb-1 flex items-start justify-between gap-3">
            <h3 className="font-display text-2xl font-bold text-ink">{tile.name}</h3>
            <button type="button" onClick={onClose} className="shrink-0 rounded-full p-1.5 text-ink-faint transition-colors hover:bg-ink/5 hover:text-ink">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </div>

          {owner ? (
            <div className="mb-4 flex items-center gap-2 text-sm text-ink-soft">
              <span className="h-3 w-3 rounded-full shadow-token ring-1 ring-white/60" style={{ backgroundColor: owner.color }} />
              Owned by {owner.nickname}
              {propState.mortgaged && <span className="rounded bg-ink/10 px-1.5 py-0.5 text-xs font-semibold">Mortgaged</span>}
            </div>
          ) : isPurchasable ? (
            <p className="mb-4 text-sm text-ink-faint">Unowned · ${tile.price} to purchase</p>
          ) : null}

          {tile.type === TILE_TYPES.PROPERTY && (
            <div className="mb-4 overflow-hidden rounded-lg border border-board-line">
              {tile.rent.map((amount, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between px-3 py-1.5 text-sm ${
                    propState?.houses === i ? 'bg-brass/15 font-semibold text-ink' : 'text-ink-soft'
                  } ${i > 0 ? 'border-t border-board-line' : ''}`}
                >
                  <span>{RENT_LABELS[i]}</span>
                  <span className="font-display">${amount}</span>
                </div>
              ))}
            </div>
          )}

          {tile.type === TILE_TYPES.RAILROAD && (
            <div className="mb-4 overflow-hidden rounded-lg border border-board-line text-sm text-ink-soft">
              <p className="px-3 py-2">1 owned: $25 · 2 owned: $50 · 3 owned: $100 · 4 owned: $200</p>
            </div>
          )}

          {tile.type === TILE_TYPES.UTILITY && (
            <div className="mb-4 overflow-hidden rounded-lg border border-board-line text-sm text-ink-soft">
              <p className="px-3 py-2">1 owned: 4× dice roll · Both owned: 10× dice roll</p>
            </div>
          )}

          {isOwner && (
            <div className="flex flex-col gap-2 border-t border-board-line pt-4">
              {tile.type === TILE_TYPES.PROPERTY && !propState.mortgaged && (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!isMyTurn}
                    onClick={() => onBuildHouse(tile.id)}
                    className="flex-1 rounded-lg bg-gradient-to-b from-go to-go-deep px-3 py-2 text-sm font-semibold text-white shadow-tile transition-transform active:scale-95 disabled:opacity-40"
                  >
                    Build (${tile.houseCost})
                  </button>
                  {propState.houses > 0 && (
                    <button
                      type="button"
                      disabled={!isMyTurn}
                      onClick={() => onSellHouse(tile.id)}
                      className="flex-1 rounded-lg border-2 border-rent px-3 py-2 text-sm font-semibold text-rent transition-transform active:scale-95 disabled:opacity-40"
                    >
                      Sell house
                    </button>
                  )}
                </div>
              )}
              {propState.mortgaged ? (
                <button
                  type="button"
                  disabled={!isMyTurn}
                  onClick={() => onUnmortgage(tile.id)}
                  className="rounded-lg bg-gradient-to-b from-brass-bright to-brass px-3 py-2 text-sm font-semibold text-brass-ink shadow-tile transition-transform active:scale-95 disabled:opacity-40"
                >
                  Pay off mortgage (${Math.ceil((tile.price / 2) * 1.1)})
                </button>
              ) : (
                (propState.houses === 0 || tile.type !== TILE_TYPES.PROPERTY) && (
                  <button
                    type="button"
                    disabled={!isMyTurn}
                    onClick={() => onMortgage(tile.id)}
                    className="rounded-lg border-2 border-ink/15 px-3 py-2 text-sm font-semibold text-ink-soft transition-transform hover:border-ink/30 active:scale-95 disabled:opacity-40"
                  >
                    Mortgage for ${Math.floor(tile.price / 2)}
                  </button>
                )
              )}
              {!isMyTurn && (
                <p className="text-center text-xs text-ink-faint">You can only manage properties on your turn.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
