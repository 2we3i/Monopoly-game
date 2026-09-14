// GuestGate.jsx
// What a guest sees when they try something only registered players may
// do. The server refuses the action regardless; this explains why and
// offers the way forward.

import { useTranslation } from '../i18n/LanguageContext';
import Modal from './Modal';
import Icon from './icons';

export default function GuestGate({ onLogin, onRegister, onClose }) {
  const { t } = useTranslation();
  return (
    <Modal
      onClose={onClose}
      title={t('gate.title')}
      subtitle={t('gate.subtitle')}
      icon={<Icon.lock className="h-5 w-5" />}
      footer={(
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={onClose} className="btn-quiet px-4">{t('gate.notNow')}</button>
          <button type="button" onClick={onLogin} className="btn-ghost px-4">{t('gate.login')}</button>
          <button type="button" onClick={onRegister} className="btn-primary px-4">{t('gate.register')}</button>
        </div>
      )}
    >
      <ul className="flex flex-col gap-2.5">
        {['create', 'invite', 'stats'].map((key) => (
          <li key={key} className="flex items-start gap-2.5 text-[13.5px] text-parch/80">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-go/20 text-go-light">
              <Icon.check className="h-3 w-3" />
            </span>
            {t(`gate.perk.${key}`)}
          </li>
        ))}
      </ul>
      <p className="mt-4 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5 text-[12.5px] leading-snug text-parch/55">
        {t('gate.guestCanJoin')}
      </p>
    </Modal>
  );
}
