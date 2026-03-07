import React, { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Upload, Image, FileJson, BookOpen, Code } from 'lucide-react';
import type { CharacterCard, QuickReply } from '../types';
import { parseCharacterCardPng, fileToDataUrl } from './cardParser';
import { generateId } from '@/lib';
import styles from '../index.module.scss';

interface ImportModalProps {
  visible: boolean;
  onClose: () => void;
  onImport: (
    card: CharacterCard,
    spriteMap?: Record<string, string>,
    quickReplies?: QuickReply[],
  ) => void;
}

const ImportModal: React.FC<ImportModalProps> = ({ visible, onClose, onImport }) => {
  const { t } = useTranslation('tavern');
  const [parsedCard, setParsedCard] = useState<CharacterCard | null>(null);
  const [error, setError] = useState('');
  const [parsing, setParsing] = useState(false);
  const [spriteMap, setSpriteMap] = useState<Record<string, string>>({});
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const spriteInputRef = useRef<HTMLInputElement>(null);
  const qrInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File) => {
      if (!file.name.toLowerCase().endsWith('.png')) {
        setError('Please select a PNG file');
        return;
      }
      setParsing(true);
      setError('');
      try {
        const card = await parseCharacterCardPng(file);
        setParsedCard(card);
      } catch (err) {
        setError(err instanceof Error ? err.message : t('import.error'));
      } finally {
        setParsing(false);
      }
    },
    [t],
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleSpriteFiles = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const map: Record<string, string> = {};
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type.startsWith('image/')) {
        const name = file.name.replace(/\.[^.]+$/, '');
        map[name] = await fileToDataUrl(file);
      }
    }
    setSpriteMap(map);
  }, []);

  const handleQuickRepliesFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      const qrs: QuickReply[] = [];
      const items = Array.isArray(data) ? data : data.quickReplies || data.quick_replies || [];
      for (const item of items) {
        qrs.push({
          id: generateId(),
          label: item.label || item.name || '',
          message: item.message || item.mes || '',
          requiresInput: item.requiresInput ?? item.requires_input ?? false,
          inputPlaceholder: item.inputPlaceholder || item.input_placeholder || '',
        });
      }
      setQuickReplies(qrs);
    } catch {
      // Ignore parse errors
    }
  }, []);

  const handleConfirm = useCallback(() => {
    if (!parsedCard) return;
    const card = { ...parsedCard };
    if (Object.keys(spriteMap).length > 0) {
      card.sprite_map = spriteMap;
    }
    if (quickReplies.length > 0) {
      card.quick_replies = quickReplies;
    }
    onImport(card, spriteMap, quickReplies);
    setParsedCard(null);
    setSpriteMap({});
    setQuickReplies([]);
    setError('');
  }, [parsedCard, spriteMap, quickReplies, onImport]);

  const handleClose = useCallback(() => {
    setParsedCard(null);
    setSpriteMap({});
    setQuickReplies([]);
    setError('');
    onClose();
  }, [onClose]);

  if (!visible) return null;

  return (
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalTitle}>{t('import.title')}</div>

        {/* Drop Zone */}
        <div
          className={`${styles.dropZone} ${dragOver ? styles.active : ''}`}
          onClick={() => fileInputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
        >
          <Upload size={32} className={styles.dropZoneIcon} />
          <div>{parsing ? t('import.parsing') : t('import.dragDrop')}</div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".png"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />

        {error && (
          <div
            style={{
              color: 'var(--color-red)',
              marginBottom: 'var(--spacing-md)',
              fontSize: '13px',
            }}
          >
            {error}
          </div>
        )}

        {/* Optional: Sprites */}
        <div className={styles.optionalSection}>
          <button className={styles.optionalLabel} onClick={() => spriteInputRef.current?.click()}>
            <Image size={16} />
            {t('import.selectSprites')}
            {Object.keys(spriteMap).length > 0 && (
              <span className={styles.optionalBadge}>
                {t('import.spritesLoaded', { count: Object.keys(spriteMap).length })}
              </span>
            )}
          </button>
          <input
            ref={spriteInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleSpriteFiles}
            style={{ display: 'none' }}
          />
        </div>

        {/* Optional: Quick Replies */}
        <div className={styles.optionalSection}>
          <button className={styles.optionalLabel} onClick={() => qrInputRef.current?.click()}>
            <FileJson size={16} />
            {t('import.selectQuickReplies')}
            {quickReplies.length > 0 && (
              <span className={styles.optionalBadge}>
                {t('import.quickRepliesLoaded', { count: quickReplies.length })}
              </span>
            )}
          </button>
          <input
            ref={qrInputRef}
            type="file"
            accept=".json"
            onChange={handleQuickRepliesFile}
            style={{ display: 'none' }}
          />
        </div>

        {/* Preview */}
        {parsedCard && (
          <div className={styles.previewSection}>
            <div className={styles.previewTitle}>{t('import.preview')}</div>
            <div className={styles.previewName}>{parsedCard.name}</div>
            <div className={styles.previewStats}>
              <span className={styles.previewStat}>
                <BookOpen size={14} />
                {t('import.worldBookEntries')}: {parsedCard.world_book.length}
              </span>
              <span className={styles.previewStat}>
                <Code size={14} />
                {t('import.regexScripts')}: {parsedCard.regex_scripts.length}
              </span>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className={styles.modalActions}>
          <button
            className={`${styles.modalBtn} ${styles.modalBtnSecondary}`}
            onClick={handleClose}
          >
            {t('import.cancel')}
          </button>
          <button
            className={`${styles.modalBtn} ${styles.modalBtnPrimary}`}
            onClick={handleConfirm}
            disabled={!parsedCard}
          >
            {t('import.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportModal;
