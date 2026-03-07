import React, { useMemo, useRef, useEffect, useState, useCallback } from 'react';
import { marked } from 'marked';
import type { Message, RegexScript } from '../types';
import { applyRegexScripts, sanitizeHtml } from './regexEngine';
import styles from '../index.module.scss';

marked.setOptions({ breaks: true, gfm: true });

interface MessageBubbleProps {
  message: Message;
  characterName: string;
  characterAvatar: string;
  userName: string;
  regexScripts: RegexScript[];
}

interface HtmlBlock {
  id: number;
  html: string;
  isFullDoc: boolean;
}

const IframeBlock: React.FC<{ html: string }> = ({ html }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(200);

  const updateHeight = useCallback(() => {
    const doc = iframeRef.current?.contentDocument;
    if (doc?.body) {
      const h = doc.body.scrollHeight;
      if (h > 0) setHeight(h + 4);
    }
  }, []);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const onLoad = () => {
      updateHeight();
      const observer = new MutationObserver(updateHeight);
      if (iframe.contentDocument?.body) {
        observer.observe(iframe.contentDocument.body, {
          childList: true,
          subtree: true,
          attributes: true,
        });
      }
      setTimeout(updateHeight, 300);
      setTimeout(updateHeight, 1000);
    };

    iframe.addEventListener('load', onLoad);
    return () => iframe.removeEventListener('load', onLoad);
  }, [updateHeight]);

  return (
    <iframe
      ref={iframeRef}
      srcDoc={html}
      className={styles.htmlIframe}
      style={{ height: `${height}px` }}
      sandbox="allow-same-origin allow-scripts"
      title="rendered content"
    />
  );
};

const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  characterName,
  characterAvatar,
  userName,
  regexScripts,
}) => {
  const { role, content } = message;

  const { inlineHtml, htmlBlocks } = useMemo(() => {
    let text = content;

    text = text.replace(/\{\{user\}\}/gi, userName);
    text = text.replace(/\{\{char\}\}/gi, characterName);

    if (role === 'assistant' && regexScripts.length > 0) {
      text = applyRegexScripts(text, regexScripts, 'ai_output', userName, characterName);
    }

    const blocks: HtmlBlock[] = [];
    text = text.replace(/```html\s*\n([\s\S]*?)```/g, (_match, code: string) => {
      const id = blocks.length;
      const isFullDoc = /<!DOCTYPE|<html/i.test(code);
      blocks.push({ id, html: code, isFullDoc });
      return `\n%%HTMLBLOCK_${id}%%\n`;
    });

    let html = marked.parse(text, { async: false }) as string;

    blocks.forEach((block) => {
      const placeholder = `%%HTMLBLOCK_${block.id}%%`;
      if (block.isFullDoc) {
        html = html.replace(placeholder, `<div data-iframe-block="${block.id}"></div>`);
      } else {
        html = html.replace(placeholder, block.html);
      }
    });

    html = sanitizeHtml(html);

    return { inlineHtml: html, htmlBlocks: blocks.filter((b) => b.isFullDoc) };
  }, [content, role, regexScripts, userName, characterName]);

  const isUser = role === 'user';
  const isSystem = role === 'system';
  const avatarInitial = isUser
    ? userName.charAt(0).toUpperCase()
    : characterName.charAt(0).toUpperCase();

  const parts = useMemo(() => {
    if (htmlBlocks.length === 0) return [{ type: 'html' as const, content: inlineHtml }];

    const result: Array<{ type: 'html'; content: string } | { type: 'iframe'; block: HtmlBlock }> =
      [];
    let remaining = inlineHtml;

    for (const block of htmlBlocks) {
      const marker = `<div data-iframe-block="${block.id}"></div>`;
      const idx = remaining.indexOf(marker);
      if (idx !== -1) {
        const before = remaining.slice(0, idx);
        if (before.trim()) result.push({ type: 'html', content: before });
        result.push({ type: 'iframe', block });
        remaining = remaining.slice(idx + marker.length);
      }
    }
    if (remaining.trim()) result.push({ type: 'html', content: remaining });

    return result;
  }, [inlineHtml, htmlBlocks]);

  return (
    <div className={`${styles.messageBubble} ${styles[role]}`}>
      {!isSystem && (
        <div className={`${styles.bubbleAvatar} ${styles[role]}`}>
          {!isUser && characterAvatar ? (
            <img src={characterAvatar} alt={characterName} className={styles.bubbleAvatarImg} />
          ) : (
            avatarInitial
          )}
        </div>
      )}
      <div className={`${styles.bubbleContent} ${styles[role]}`}>
        {parts.map((part, i) =>
          part.type === 'iframe' ? (
            <IframeBlock key={`iframe-${part.block.id}`} html={part.block.html} />
          ) : (
            <div
              key={`html-${i}`}
              className={styles.bubbleHtml}
              dangerouslySetInnerHTML={{ __html: part.content }}
            />
          ),
        )}
      </div>
    </div>
  );
};

export default React.memo(MessageBubble);
