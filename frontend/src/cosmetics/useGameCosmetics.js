// useGameCosmetics.js
// The player's own cosmetics inside a game: the start sound, the "your
// turn" sound, and the victory / podium / defeat effect at the end. All
// of it is local to this screen - other players see none of it and the
// game is unaffected.

import { useEffect, useRef } from 'react';
import { useSocial } from '../social/SocialContext';
import { useSettings } from '../settings/SettingsContext';
import { useLook } from './Cosmetics';
import { playEffect } from './effects';
import { playItemSound } from './sounds';

export function useMyLook() {
  const social = useSocial();
  return useLook(social.loadout);
}

// Plays once each time `active` turns true.
export function useTurnSound(active) {
  const look = useMyLook();
  const { settings } = useSettings();
  const previous = useRef(active);
  useEffect(() => {
    if (active && !previous.current) playItemSound(look.soundEvent, settings.cosmeticSounds);
    previous.current = active;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}

// Plays the start sound when a room leaves its lobby.
export function useStartSound(phase) {
  const look = useMyLook();
  const { settings } = useSettings();
  const previous = useRef(phase);
  useEffect(() => {
    if (previous.current === 'LOBBY' && phase && phase !== 'LOBBY') playItemSound(look.soundStart, settings.cosmeticSounds);
    previous.current = phase;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);
}

// outcome: 'win' | 'podium' | 'loss' | null. Plays once per `key`.
export function useOutcomeEffects(outcome, key) {
  const look = useMyLook();
  const { settings } = useSettings();
  const played = useRef(null);
  useEffect(() => {
    if (!outcome || played.current === key) return;
    played.current = key;
    const timer = setTimeout(() => {
      if (outcome === 'win') {
        if (look.effectWin) playEffect(look.effectWin.visual);
        playItemSound(look.soundWin, settings.cosmeticSounds);
      } else if (outcome === 'podium') {
        if (look.effectPodium) playEffect(look.effectPodium.visual);
        playItemSound(look.soundWin, settings.cosmeticSounds);
      } else if (look.effectLoss) {
        playEffect(look.effectLoss.visual);
      }
    }, 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, key, look]);
}
