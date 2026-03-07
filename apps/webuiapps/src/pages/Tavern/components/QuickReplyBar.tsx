import React, { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { QuickReply } from '../types';
import styles from '../index.module.scss';

interface QuickReplyBarProps {
  quickReplies: QuickReply[];
  onSend: (message: string) => void;
  userName: string;
  characterName: string;
}

const QuickReplyBar: React.FC<QuickReplyBarProps> = ({
  quickReplies,
  onSend,
  userName,
  characterName,
}) => {
  const { t } = useTranslation('tavern');
  const [activeReply, setActiveReply] = useState<QuickReply | null>(null);
  const [inputValue, setInputValue] = useState('');

  const replaceVars = useCallback(
    (text: string, extra?: string): string => {
      let result = text
        .replace(/\{\{user\}\}/gi, userName)
        .replace(/\{\{char\}\}/gi, characterName);
      if (extra) {
        result = result.replace(/\{\{input\}\}/gi, extra);
      }
      return result;
    },
    [userName, characterName],
  );

  const handleClick = useCallback(
    (qr: QuickReply) => {
      if (qr.requiresInput) {
        setActiveReply(qr);
        setInputValue('');
      } else {
        onSend(replaceVars(qr.message));
      }
    },
    [onSend, replaceVars],
  );

  const handleInputSend = useCallback(() => {
    if (!activeReply || !inputValue.trim()) return;
    onSend(replaceVars(activeReply.message, inputValue.trim()));
    setActiveReply(null);
    setInputValue('');
  }, [activeReply, inputValue, onSend, replaceVars]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleInputSend();
      }
      if (e.key === 'Escape') {
        setActiveReply(null);
      }
    },
    [handleInputSend],
  );

  if (quickReplies.length === 0) return null;

  return (
    <div className={styles.quickReplyBar}>
      {activeReply ? (
        <div className={styles.quickReplyInput}>
          <input
            className={styles.quickReplyInputField}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activeReply.inputPlaceholder || t('quickReply.inputPlaceholder')}
            autoFocus
          />
          <button className={styles.quickReplySendBtn} onClick={handleInputSend}>
            {t('quickReply.send')}
          </button>
        </div>
      ) : (
        quickReplies.map((qr) => (
          <button
            key={qr.id}
            className={styles.quickReplyBtn}
            onClick={() => handleClick(qr)}
            title={qr.message}
          >
            {qr.label}
          </button>
        ))
      )}
    </div>
  );
};

export default QuickReplyBar;
