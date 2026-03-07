import React from 'react';
import { useTranslation } from 'react-i18next';
import { Sparkles } from 'lucide-react';
import { useTavernState } from '../store/TavernContext';
import styles from '../index.module.scss';

const SpritePanel: React.FC = () => {
  const { t } = useTranslation('tavern');
  const { characters, activeCharacterId, currentEmotion } = useTavernState();
  const character = characters.find((c) => c.id === activeCharacterId);

  const spriteUrl = React.useMemo(() => {
    if (!character) return null;
    if (currentEmotion && character.sprite_map[currentEmotion]) {
      return character.sprite_map[currentEmotion];
    }
    if (character.avatar) return character.avatar;
    return null;
  }, [character, currentEmotion]);

  const initial = character?.name?.charAt(0)?.toUpperCase() || '';

  return (
    <div className={styles.spritePanel}>
      {spriteUrl ? (
        <img className={styles.spriteImage} src={spriteUrl} alt={character?.name || ''} />
      ) : (
        <div className={styles.spriteFallback}>{initial || <Sparkles size={36} />}</div>
      )}
      <div className={styles.spriteOverlay}>
        <div className={styles.spriteCharName}>{character?.name || t('sprite.noCharacter')}</div>
        {currentEmotion ? (
          <div className={styles.spriteEmotion}>
            <span className={styles.spriteEmotionDot} />
            {currentEmotion}
          </div>
        ) : character ? (
          <div className={styles.spriteEmotion}>{t('sprite.emotion')}</div>
        ) : null}
      </div>
    </div>
  );
};

export default SpritePanel;
