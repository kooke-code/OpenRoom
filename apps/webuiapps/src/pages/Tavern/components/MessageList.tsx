import React, { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Import, MessageCircle } from 'lucide-react';
import type { Message, RegexScript } from '../types';
import MessageBubble from './MessageBubble';
import styles from '../index.module.scss';

interface MessageListProps {
  messages: Message[];
  characterName: string;
  characterAvatar: string;
  userName: string;
  regexScripts: RegexScript[];
  hasCharacter: boolean;
  onImport?: () => void;
}

const MessageList: React.FC<MessageListProps> = ({
  messages,
  characterName,
  characterAvatar,
  userName,
  regexScripts,
  hasCharacter,
  onImport,
}) => {
  const { t } = useTranslation('tavern');
  const listRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  useEffect(() => {
    if (messages.length > lastCountRef.current && listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
    lastCountRef.current = messages.length;
  }, [messages.length]);

  if (!hasCharacter) {
    return (
      <div className={styles.messageList}>
        <div className={styles.emptyState}>
          <Import size={40} className={styles.emptyIcon} />
          <p>{t('chat.emptyState')}</p>
          {onImport && (
            <button className={styles.emptyImportBtn} onClick={onImport}>
              {t('topBar.import')}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className={styles.messageList}>
        <div className={styles.emptyState}>
          <MessageCircle size={40} className={styles.emptyIcon} />
          <p>{t('chat.emptySession')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.messageList} ref={listRef}>
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          characterName={characterName}
          characterAvatar={characterAvatar}
          userName={userName}
          regexScripts={regexScripts}
        />
      ))}
    </div>
  );
};

export default MessageList;
