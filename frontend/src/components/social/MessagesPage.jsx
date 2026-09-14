// MessagesPage.jsx
// The messenger as a full page (/messages). Opening a conversation from
// anywhere else while this page is shown targets this messenger rather
// than a drawer on top of it.

import { useEffect } from 'react';
import { useTranslation } from '../../i18n/LanguageContext';
import { useSocial } from '../../social/SocialContext';
import PlatformShell, { LoginRequired } from '../platform/PlatformShell';
import Messenger from './Messenger';

export default function MessagesPage({ auth }) {
  const { t } = useTranslation();
  const social = useSocial();
  const { open, target, seq } = social.messenger;

  useEffect(() => {
    if (open) social.closeMessenger();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <PlatformShell auth={auth} active="messages" fullHeight>
      {!auth.isLoggedIn ? <LoginRequired text={t('messages.loginRequired')} /> : (
        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-white/[0.07] bg-[#121418]">
          <Messenger target={target} targetKey={seq} layout="page" />
        </div>
      )}
    </PlatformShell>
  );
}
