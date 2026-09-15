// AgeGate.jsx
// The 18+ question in front of the board-games section. A "yes" lasts for
// this browser session (sessionStorage), so moving between the games does
// not ask again, while a new session does. Closing the dialog any other
// way - Escape, the backdrop, the cross - counts as "no".

import { useTranslation } from '../../i18n/LanguageContext';
import Modal from '../Modal';

const STORAGE_KEY = 'landmark_age_confirmed';
let confirmedThisPage = false;

export function isAgeConfirmed() {
  if (confirmedThisPage) return true;
  try {
    return sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function confirmAge() {
  confirmedThisPage = true;
  try {
    sessionStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // Storage blocked: the in-memory flag still covers this page.
  }
}

export default function AgeGate({ onConfirm, onDecline }) {
  const { t } = useTranslation();
  return (
    <Modal
      onClose={onDecline}
      title={t('tabletop.age.title')}
      subtitle={t('tabletop.age.subtitle')}
      icon={<span className="text-[12.5px] font-black">18+</span>}
      accent="linear-gradient(90deg, #7c2019, #e0695c)"
      footer={(
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onDecline} className="btn-ghost px-6 py-3">{t('tabletop.age.no')}</button>
          <button type="button" onClick={onConfirm} className="btn-primary px-6 py-3">{t('tabletop.age.yes')}</button>
        </div>
      )}
    >
      <p className="font-display text-[24px] font-black leading-tight text-parch 4xl:text-[30px]">{t('tabletop.age.question')}</p>
      <p className="mt-2 text-[13.5px] leading-snug text-parch/60">{t('tabletop.age.text')}</p>
    </Modal>
  );
}
