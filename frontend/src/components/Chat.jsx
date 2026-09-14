// Chat.jsx
// The Monopoly room chat: the shared room chat in its speech-bubble form,
// with Monopoly's own system lines.
import { useTranslation } from '../i18n/LanguageContext';
import { formatLogEntry } from '../i18n/logFormatter';
import RoomChat from './chat/RoomChat';

export default function Chat({
  messages, onSend, playerId, players = [], board,
}) {
  const { t, language } = useTranslation();
  return (
    <RoomChat
      variant="bubbles"
      messages={messages}
      onSend={onSend}
      players={players}
      myPlayerId={playerId}
      renderSystem={(msg) => formatLogEntry(msg, t, language, board)}
    />
  );
}
