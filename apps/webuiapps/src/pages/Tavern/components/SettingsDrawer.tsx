import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import styles from '../index.module.scss';

interface SettingsDrawerProps {
  visible: boolean;
  onClose: () => void;
  userName: string;
  onSave: (userName: string) => void;
}

const SettingsDrawer: React.FC<SettingsDrawerProps> = ({ visible, onClose, userName, onSave }) => {
  const { t } = useTranslation('tavern');
  const [name, setName] = useState(userName);

  useEffect(() => {
    setName(userName);
  }, [userName]);

  const handleSave = useCallback(() => {
    const trimmed = name.trim() || 'User';
    onSave(trimmed);
    onClose();
  }, [name, onSave, onClose]);

  if (!visible) return null;

  return (
    <>
      <div className={styles.drawerOverlay} onClick={onClose} />
      <div className={styles.drawer}>
        <div className={styles.drawerTitle}>
          {t('settings.title')}
          <button className={styles.drawerCloseBtn} onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        <div className={styles.formGroup}>
          <label className={styles.formLabel}>{t('settings.userName')}</label>
          <input
            className={styles.formInput}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('settings.userNamePlaceholder')}
          />
        </div>

        <button className={styles.formBtn} onClick={handleSave}>
          {t('settings.save')}
        </button>
      </div>
    </>
  );
};

export default SettingsDrawer;
