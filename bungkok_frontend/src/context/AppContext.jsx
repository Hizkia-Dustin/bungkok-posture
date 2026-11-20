import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import {
  claimAchievementRequest, clearSessionHistory, createReportRequest, deleteAccountRequest,
  equipRewardsRequest, fetchAccount, fetchConfiguration, fetchSessionHistory,
  joinChallengeRequest, redeemRewardRequest, replyReportRequest, updateAccount,
} from '../services/postureApi';

const EMPTY_USER = {
  id: '', email: '', name: 'Pengguna', avatar: '', role: 'user', points: 0,
  totalPointsCumulative: 0, level: 1, targetLevel: 2, levelProgressMax: 100,
  pointsToNextLevel: 100, selectedBadge: 'Belum ada', targetDuration: 15,
  reminderSoundActive: true, reminderVolume: 60, breakReminderActive: true,
};
const EMPTY_CONFIG = {
  shop: [],
  reminder: { mode: 'speech', message: 'Badan kamu mulai bungkuk. Yuk, tegakkan posturmu.', language: 'id-ID', rate: 1 },
};
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(EMPTY_USER);
  const [sessions, setSessions] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [badges, setBadges] = useState([]);
  const [ownedItems, setOwnedItems] = useState({});
  const [equippedItems, setEquippedItemsState] = useState({});
  const [pointsHistory, setPointsHistory] = useState([]);
  const [reports, setReports] = useState([]);
  const [appConfig, setAppConfig] = useState(EMPTY_CONFIG);
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [achievementToast, setAchievementToast] = useState({ visible: false, badge: null });

  const applyState = (state) => {
    if (!state) return;
    setUser({ ...EMPTY_USER, ...state.user });
    setChallenges(state.challenges || []);
    setBadges(state.badges || []);
    setOwnedItems(state.ownedItems || {});
    setEquippedItemsState(state.equippedItems || {});
    setPointsHistory(state.pointsHistory || []);
    setReports(state.reports || []);
  };

  const refreshAccount = async () => {
    const [state, history, configuration] = await Promise.all([
      fetchAccount(), fetchSessionHistory(), fetchConfiguration(),
    ]);
    applyState(state);
    setSessions(Array.isArray(history) ? history : []);
    setAppConfig(configuration || EMPTY_CONFIG);
    return state;
  };

  useEffect(() => {
    let alive = true;
    let hydrationTimer;
    let readyTimer;
    let lastHydratedToken = '';

    const hydrateAccount = (session) => {
      const token = session?.access_token || '';
      if (!token || token === lastHydratedToken) return;
      lastHydratedToken = token;

      // Jalankan setelah callback auth Supabase selesai. Memanggil getSession
      // dari dalam callback onAuthStateChange dapat membuat keduanya saling menunggu.
      clearTimeout(hydrationTimer);
      hydrationTimer = window.setTimeout(async () => {
        if (!alive) return;
        try {
          await refreshAccount();
        } catch (error) {
          console.error('[account background sync]', error);
        }
      }, 0);
    };

    const sync = (session) => {
      if (!alive) return;
      setIsAuthenticated(Boolean(session));
      setAuthReady(true);
      if (!session) {
        lastHydratedToken = '';
        applyState({ user: EMPTY_USER });
        setSessions([]);
        setAppConfig(EMPTY_CONFIG);
        return;
      }

      // Ambil nama dari metadata Supabase Auth agar langsung tampil tanpa jeda
      if (session.user) {
        const metaName = session.user.user_metadata?.full_name || session.user.user_metadata?.name || session.user.email?.split('@')[0];
        setUser((prev) => ({ ...prev, id: session.user.id, email: session.user.email || '', name: metaName || prev.name || 'Pengguna' }));
      }

      // Dashboard dibuka dari data sesi; detail akun menyusul tanpa menahan UI.
      hydrateAccount(session);
    };

    // Jangan biarkan animasi pembuka menutup layar tanpa batas saat jaringan buruk.
    readyTimer = window.setTimeout(() => {
      if (alive) setAuthReady(true);
    }, 3000);

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) throw error;
        sync(data.session);
      })
      .catch((error) => {
        console.error('[auth session restore]', error);
        if (alive) {
          setIsAuthenticated(false);
          setAuthReady(true);
        }
      })
      .finally(() => clearTimeout(readyTimer));

    const { data } = supabase.auth.onAuthStateChange((_event, session) => sync(session));
    return () => {
      alive = false;
      clearTimeout(hydrationTimer);
      clearTimeout(readyTimer);
      data.subscription.unsubscribe();
    };
  }, []);

  const openModal = (type, payload = {}) => setActiveModal({ type, payload });
  const closeModal = () => setActiveModal(null);
  const triggerAchievement = (badge) => setAchievementToast({ visible: true, badge });
  const dismissAchievement = () => setAchievementToast({ visible: false, badge: null });

  const logout = async () => {
    await supabase.auth.signOut();
    closeModal();
  };

  const completeSession = async (serverResult) => {
    await refreshAccount();
    if (serverResult?.badges?.length) triggerAchievement(serverResult.badges[0]);
    return serverResult;
  };

  const redeemItem = async (itemId) => {
    const item = appConfig.shop.find((entry) => entry.id === itemId);
    if (!item || ownedItems[itemId]) return;
    if (user.role !== 'admin' && user.points < item.price) return openModal('poin-kurang', { item, userPoints: user.points });
    const state = await redeemRewardRequest(itemId);
    applyState(state);
    openModal('hadiah-berhasil', { item, newPoints: state.user.points, usedPoints: user.role === 'admin' ? 0 : item.price });
  };

  const claimAchievement = async (badgeId) => {
    const badge = badges.find((item) => item.id === badgeId);
    if (!badge?.unlocked || badge.claimed) return false;
    const state = await claimAchievementRequest(badgeId);
    applyState(state);
    triggerAchievement({ ...badge, claimed: true, message: `+${badge.rewardPoints || 0} poin masuk ke saldo` });
    return true;
  };

  const joinChallenge = async (challengeId) => {
    const state = await joinChallengeRequest(challengeId);
    applyState(state);
    openModal('bergabung-sukses', { challenge: state.challenges.find((item) => item.id === challengeId) });
  };

  const setEquippedItems = async (value) => {
    const next = typeof value === 'function' ? value(equippedItems) : value;
    const state = await equipRewardsRequest(next);
    applyState(state);
  };

  const addReport = async (data) => {
    const ticket = await createReportRequest({
      title: data.title, category: data.category, description: data.content || data.description,
      device: navigator.userAgent,
    });
    setReports((previous) => [ticket, ...previous]);
    openModal('laporan-berhasil', { ticket });
  };

  const replyToTicket = async (ticketId, text) => {
    applyState(await replyReportRequest(ticketId, text));
    openModal('balasan-terkirim', { ticketId });
  };

  const updateUserProfile = async (updated) => {
    applyState(await updateAccount(updated));
    openModal('profil-disimpan');
  };

  const updatePreferences = async (updated) => applyState(await updateAccount(updated));

  const clearHistory = async () => {
    await clearSessionHistory();
    setSessions([]);
  };

  const deleteAccount = async () => {
    await deleteAccountRequest();
    await logout();
  };

  return <AppContext.Provider value={{
    user, setUser, logout, completeSession, sessions, setSessions, hasData: sessions.length > 0,
    setHasData: () => {}, challenges, setChallenges, badges, setBadges, ownedItems,
    equippedItems, setEquippedItems, pointsHistory, reports, appConfig, authReady,
    isAuthenticated, refreshAccount, activeModal, openModal, closeModal, redeemItem,
    claimAchievement, joinChallenge, addReport, replyToTicket, updateUserProfile,
    clearHistory, deleteAccount, deleteDemoAccount: deleteAccount, updatePreferences, achievementToast,
    triggerAchievement, dismissAchievement,
  }}>{children}</AppContext.Provider>;
}

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error('useApp must be used within an AppProvider');
  return value;
}
