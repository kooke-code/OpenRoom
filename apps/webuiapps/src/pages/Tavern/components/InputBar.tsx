import React, { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SendHorizontal } from 'lucide-react';
import styles from '../index.module.scss';

interface InputBarProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

const InputBar: React.FC<InputBarProps> = ({ onSend, disabled }) => {
  const { t } = useTranslation('tavern');
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setValue('');
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  }, [value, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  return (
    <div className={styles.inputBar}>
      <textarea
        ref={textareaRef}
        className={styles.inputField}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onInput={handleInput}
        placeholder={t('chat.placeholder')}
        disabled={disabled}
        rows={1}
      />
      <button className={styles.sendBtn} onClick={handleSend} disabled={disabled || !value.trim()}>
        <SendHorizontal size={18} />
      </button>
    </div>
  );
};

export default InputBar;
