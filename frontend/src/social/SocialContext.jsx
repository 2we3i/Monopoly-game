// SocialContext.jsx
// The logged-in player's social and economy state, shared by every
// screen: crown balance, owned and equipped cosmetics, unread counters,
// the notification centre, toasts, and the messenger/profile overlays.
//
// It holds one "social" socket per tab. The server pushes messages,
// receipts, notifications and wallet changes over it; everything it
// shows is loaded from the server, and every action goes back to the
// server to be checked there.

import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { io } from 'socket.io-client';
import { apiFetch } from '../lib/api';
import { resolveLook, useCatalog } from '../lib/catalog';
import { useSettings } from '../settings/SettingsContext';
import { playEffect } from '../cosmetics/effects';
import { playItemSound } from '../cosmetics/sounds';

const SERVER_URL = import.meta.env.VITE_SERVER_URL || undefined;
const MAX_TOASTS = 4;
const EMPTY_NOTIFICATIONS = {
  items: [], loaded: false, loading: false, hasMore: false,
};

const SocialContext = createContext(null);

export function SocialProvider({ auth, children }) {
  const token = auth.isLoggedIn ? auth.token : null;
  const myId = auth.account?.id || null;
  const catalog = useCatalog();
  const { settings } = useSettings();

  const [economy, setEconomy] = useState(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [notifications, setNotifications] = useState(EMPTY_NOTIFICATIONS);
  const [toasts, setToasts] = useState([]);
  const [messenger, setMessenger] = useState({ open: false, target: null, seq: 0 });
  const [peekId, setPeekId] = useState(null);
  const [connected, setConnected] = useState(false);

  const activeConversation = useRef(null);
  const listeners = useRef(new Map());
  const live = useRef({});
  live.current = {
    catalog, settings, economy, myId, notifications,
  };

  const emitLocal = useCallback((event, payload) => {
    (listeners.current.get(event) || []).forEach((fn) => fn(payload));
  }, []);

  const subscribe = useCallback((event, fn) => {
    const set = listeners.current.get(event) || new Set();
    set.add(fn);
    listeners.current.set(event, set);
    return () => set.delete(fn);
  }, []);

  const refreshEconomy = useCallback(async () => {
    if (!token) return null;
    const data = await apiFetch('/api/economy/me', { token });
    setEconomy(data);
    return data;
  }, [token]);
  const refreshRef = useRef(refreshEconomy);
  refreshRef.current = refreshEconomy;

  // What a fresh notification does besides appearing in the centre: a
  // toast, and for rewards and rank-ups the player's equipped effect and
  // sound.
  const react = useCallback((n) => {
    const { catalog: cat, settings: set, economy: eco } = live.current;
    const look = resolveLook(cat, eco?.loadout);
    const isOpenConversation = ['direct_message', 'group_message'].includes(n.type)
      && activeConversation.current === n.payload?.conversationId;
    if (!isOpenConversation) {
      setToasts((list) => [...list.filter((x) => x.notification.id !== n.id), { key: `${n.id}:${n.count}`, notification: n }].slice(-MAX_TOASTS));
    }
    if (n.type === 'reward') {
      if (look.effectReward) playEffect(look.effectReward.visual);
      playItemSound(look.soundReward, set.cosmeticSounds);
    }
    if (n.type === 'rank_up') {
      if (look.effectRankup) playEffect(look.effectRankup.visual);
      playItemSound(look.soundEvent, set.cosmeticSounds);
    }
    if (n.type === 'mention') playItemSound(look.soundEvent, set.cosmeticSounds);
    if (['item_granted', 'achievement'].includes(n.type)) refreshRef.current().catch(() => {});
  }, []);

  useEffect(() => {
    if (!token) {
      setEconomy(null);
      setUnreadNotifications(0);
      setUnreadMessages(0);
      setNotifications(EMPTY_NOTIFICATIONS);
      setToasts([]);
      setMessenger({ open: false, target: null, seq: 0 });
      return undefined;
    }
    let alive = true;
    apiFetch('/api/economy/me', { token }).then((d) => { if (alive) setEconomy(d); }).catch(() => {});
    const syncSummary = () => apiFetch('/api/social/summary', { token })
      .then((s) => {
        if (!alive) return;
        setUnreadNotifications(s.unreadNotifications);
        setUnreadMessages(s.unreadMessages);
        setEconomy((prev) => (prev ? { ...prev, wallet: s.wallet, loadout: s.loadout } : prev));
      })
      .catch(() => {});

    const socket = io(SERVER_URL, {
      transports: ['websocket', 'polling'],
      reconnectionDelay: 1000,
      reconnectionDelayMax: 8000,
      auth: (cb) => cb({ token, channel: 'social' }),
    });
    socket.on('connect', () => {
      setConnected(true);
      syncSummary();
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('notification:new', ({ notification, unread }) => {
      setUnreadNotifications(unread);
      setNotifications((prev) => (prev.loaded
        ? { ...prev, items: [notification, ...prev.items.filter((x) => x.id !== notification.id)] }
        : prev));
      react(notification);
    });
    socket.on('notification:sync', ({ unread }) => setUnreadNotifications(unread));
    socket.on('wallet:update', ({ wallet }) => setEconomy((prev) => (prev ? { ...prev, wallet } : prev)));
    socket.on('loadout:update', ({ loadout }) => setEconomy((prev) => (prev ? { ...prev, loadout } : prev)));
    socket.on('dm:message', (payload) => {
      const mine = payload.message.senderId === live.current.myId;
      if (!mine && activeConversation.current !== payload.conversation.id) setUnreadMessages((n) => n + 1);
      emitLocal('dm:message', payload);
    });
    socket.on('dm:receipt', (payload) => emitLocal('dm:receipt', payload));
    socket.on('account:blocked', (payload) => {
      window.dispatchEvent(new CustomEvent('landmark:blocked', { detail: payload }));
    });
    return () => {
      alive = false;
      socket.disconnect();
      setConnected(false);
    };
  }, [token, react, emitLocal]);

  // --- economy actions -----------------------------------------------------

  const buy = useCallback(async (itemId) => {
    const res = await apiFetch('/api/economy/buy', { method: 'POST', token, body: { itemId } });
    setEconomy((prev) => ({ ...(prev || {}), wallet: res.wallet, inventory: res.inventory }));
    return res;
  }, [token]);

  const equip = useCallback(async (itemId) => {
    const res = await apiFetch('/api/economy/equip', { method: 'POST', token, body: { itemId } });
    setEconomy((prev) => (prev ? { ...prev, loadout: res.loadout } : prev));
    return res.loadout;
  }, [token]);

  const unequip = useCallback(async (itemId) => {
    const res = await apiFetch('/api/economy/unequip', { method: 'POST', token, body: { itemId } });
    setEconomy((prev) => (prev ? { ...prev, loadout: res.loadout } : prev));
    return res.loadout;
  }, [token]);

  const toggleFavorite = useCallback(async (itemId) => {
    const on = !(live.current.economy?.favorites || []).includes(itemId);
    setEconomy((prev) => (prev ? {
      ...prev,
      favorites: on ? [...prev.favorites, itemId] : prev.favorites.filter((x) => x !== itemId),
    } : prev));
    try {
      const res = await apiFetch('/api/economy/favorite', { method: 'POST', token, body: { itemId, on } });
      setEconomy((prev) => (prev ? { ...prev, favorites: res.favorites } : prev));
    } catch {
      refreshRef.current().catch(() => {});
    }
  }, [token]);

  // --- notifications ---------------------------------------------------------

  const loadNotifications = useCallback(async ({ more = false } = {}) => {
    if (!token) return;
    const current = live.current.notifications;
    const before = more && current.items.length ? current.items[current.items.length - 1].id : null;
    setNotifications((p) => ({ ...p, loading: true }));
    try {
      const res = await apiFetch(`/api/social/notifications${before ? `?before=${before}` : ''}`, { token });
      setNotifications((p) => ({
        items: more ? [...p.items, ...res.notifications.filter((n) => !p.items.some((x) => x.id === n.id))] : res.notifications,
        loaded: true,
        loading: false,
        hasMore: res.notifications.length === 30,
      }));
      setUnreadNotifications(res.unread);
    } catch {
      setNotifications((p) => ({ ...p, loading: false }));
    }
  }, [token]);

  const markNotificationRead = useCallback(async (id) => {
    setNotifications((p) => ({ ...p, items: p.items.map((n) => (n.id === id ? { ...n, read: true } : n)) }));
    const res = await apiFetch(`/api/social/notifications/${id}/read`, { method: 'POST', token }).catch(() => null);
    if (res) setUnreadNotifications(res.unread);
  }, [token]);

  const readAllNotifications = useCallback(async () => {
    setNotifications((p) => ({ ...p, items: p.items.map((n) => ({ ...n, read: true })) }));
    setUnreadNotifications(0);
    await apiFetch('/api/social/notifications/read-all', { method: 'POST', token }).catch(() => {});
  }, [token]);

  const clearNotifications = useCallback(async () => {
    setNotifications({ ...EMPTY_NOTIFICATIONS, loaded: true });
    setUnreadNotifications(0);
    await apiFetch('/api/social/notifications', { method: 'DELETE', token }).catch(() => {});
  }, [token]);

  const dismissToast = useCallback((key) => setToasts((list) => list.filter((x) => x.key !== key)), []);

  // --- people and messages ---------------------------------------------------

  const searchUsers = useCallback(async (q) => {
    if (!token) return [];
    const res = await apiFetch(`/api/social/users?q=${encodeURIComponent(q || '')}`, { token });
    return res.users;
  }, [token]);

  const sendGroup = useCallback(async (recipientIds, body) => apiFetch('/api/social/group', {
    method: 'POST', token, body: { recipientIds, body },
  }), [token]);

  const openMessenger = useCallback((target = null) => {
    setMessenger((m) => ({ open: true, target, seq: m.seq + 1 }));
  }, []);
  const closeMessenger = useCallback(() => setMessenger((m) => ({ ...m, open: false })), []);
  const setActiveConversation = useCallback((id) => { activeConversation.current = id; }, []);

  const ownedIds = useMemo(() => {
    const set = new Set((economy?.inventory || []).map((i) => i.itemId));
    (catalog?.items || []).forEach((i) => { if (i.source === 'starter') set.add(i.id); });
    return set;
  }, [economy, catalog]);

  const value = useMemo(() => ({
    enabled: !!token,
    token,
    myId,
    account: auth.account,
    connected,
    catalog,
    wallet: economy?.wallet || null,
    loadout: economy?.loadout || {},
    inventory: economy?.inventory || [],
    favorites: economy?.favorites || [],
    ledger: economy?.ledger || [],
    economyLoaded: !!economy,
    ownedIds,
    refreshEconomy,
    buy,
    equip,
    unequip,
    toggleFavorite,
    unreadNotifications,
    unreadMessages,
    setUnreadMessages,
    notifications,
    loadNotifications,
    markNotificationRead,
    readAllNotifications,
    clearNotifications,
    toasts,
    dismissToast,
    searchUsers,
    sendGroup,
    subscribe,
    messenger,
    openMessenger,
    closeMessenger,
    setActiveConversation,
    peekId,
    openProfile: setPeekId,
    closeProfile: () => setPeekId(null),
  }), [
    token, myId, auth.account, connected, catalog, economy, ownedIds, refreshEconomy, buy, equip, unequip, toggleFavorite,
    unreadNotifications, unreadMessages, notifications, loadNotifications, markNotificationRead, readAllNotifications,
    clearNotifications, toasts, dismissToast, searchUsers, sendGroup, subscribe, messenger, openMessenger, closeMessenger,
    setActiveConversation, peekId,
  ]);

  return <SocialContext.Provider value={value}>{children}</SocialContext.Provider>;
}

export function useSocial() {
  const ctx = useContext(SocialContext);
  if (!ctx) throw new Error('useSocial must be used within a SocialProvider');
  return ctx;
}
