import React from 'react';
import { useTranslation } from 'react-i18next';
import { Import, MessageSquarePlus, Settings } from 'lucide-react';
import { useTavernState, useTavernDispatch } from '../store/TavernContext';
import styles from '../index.module.scss';

interface TopBarProps {
  onNewSession: () => void;
}

const TopBar: React.FC<TopBarProps> = ({ onNewSession }) => {
  const { t } = useTranslation('tavern');
  const { characters, activeCharacterId } = useTavernState();
  const dispatch = useTavernDispatch();
  const character = characters.find((c) => c.id === activeCharacterId);

  return (
    <div className={styles.topBar}>
      <div className={styles.topBarTitle}>{character?.name || 'Tavern'}</div>
      <button
        className={styles.topBarBtn}
        onClick={() => dispatch({ type: 'SHOW_IMPORT_MODAL', payload: true })}
        title={t('topBar.import')}
      >
        <Import size={18} />
      </button>
      <button
        className={styles.topBarBtn}
        onClick={onNewSession}
        title={t('topBar.newChat')}
        disabled={!activeCharacterId}
      >
        <MessageSquarePlus size={18} />
      </button>
      <button
        className={styles.topBarBtn}
        onClick={() => dispatch({ type: 'SHOW_SETTINGS', payload: true })}
        title={t('topBar.settings')}
      >
        <Settings size={18} />
      </button>
    </div>
  );
};

export default TopBar;
