import { useId, type CSSProperties, type ReactNode } from 'react';
import type { TokenMap } from '@infinity/config-core';
import type { Diagnostic } from '@infinity/config-core';
import styles from './ChromeFrame.module.css';

const value = (props: Record<string, unknown>, key: string, fallback: unknown): any => props[key] ?? fallback;
export interface ChromeFrameProps {
  props: Record<string, unknown>;
  componentName?: string;
  children?: ReactNode;
  empty?: boolean;
  error?: { message: string; path: string; component: string };
  errors?: Diagnostic[];
  tokens?: TokenMap;
  headingLevel?: 2 | 3 | 4 | 5 | 6;
}

export function ChromeFrame({ props, componentName, children, empty = false, error, errors = [], tokens = {}, headingLevel = 2 }: ChromeFrameProps) {
  const titleId = useId();
  const Heading = `h${headingLevel}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
  const title = String(value(props, 'chrome.title.text', ''));
  const header = value(props, 'chrome.header', 'card') !== 'none';
  const namedByTitle = header && !!value(props, 'chrome.title.show', true) && title.trim().length > 0;
  const card = !!value(props, 'chrome.card.show', true);
  const padding = ['top', 'right', 'bottom', 'left'].map(side => value(props, `chrome.padding.${side}`, 'var(--s-4)')).join(' ');
  const radius = String(value(props, 'chrome.card.radius', 'standard'));
  const style: CSSProperties = {
    background: card ? String(value(props, 'chrome.card.background', 'var(--card)')) : undefined,
    borderColor: String(value(props, 'chrome.card.border.colour', 'var(--rule)')),
    borderWidth: card && value(props, 'chrome.card.border.show', true) ? Number(value(props, 'chrome.card.border.width', 1)) : 0,
    borderRadius: radius === 'square' ? 'var(--r-plate)' : radius === 'round' ? 'var(--r-key)' : 'var(--r-card)',
    boxShadow: value(props, 'chrome.card.shadow', 'none') === 'raised' ? 'var(--shadow-pop)' : value(props, 'chrome.card.shadow', 'none') === 'low' ? 'var(--shadow-card)' : undefined,
    padding,
    color: tokens['--ink'],
  };
  const content = error ? <div className={styles.state} style={{ color: tokens['--bad'] }} role="alert"><strong className={styles.broke}>{error.component} broke</strong>{(errors.length ? errors : [{ path: error.path, message: error.message }]).slice(0, 3).map((item, index) => <span key={`${item.path}-${index}`}>{item.path}: {item.message}</span>)}</div>
    : empty ? <div className={styles.state} style={{ color: tokens['--soft'] }}>{String(value(props, 'chrome.empty.text', 'No data for this range'))}</div> : children;
  if (!header) return <>{content}</>;
  return <section className={`${styles.frame} ${card ? styles.card : ''}`} style={style} aria-labelledby={namedByTitle ? titleId : undefined} aria-label={namedByTitle ? undefined : componentName ?? error?.component ?? 'Component'}>
    {(value(props, 'chrome.title.show', true) || value(props, 'chrome.description.show', false)) && <header className={styles.header}>
      {value(props, 'chrome.title.show', true) && <Heading id={namedByTitle ? titleId : undefined} className={styles.title} style={{ textAlign: value(props, 'chrome.title.align', 'start') as CSSProperties['textAlign'], fontFamily: String(value(props, 'chrome.title.font.family', 'var(--display)')), fontSize: String(value(props, 'chrome.title.font.size', 'var(--t-16)')), fontWeight: Number(value(props, 'chrome.title.font.weight', 600)), color: String(value(props, 'chrome.title.font.colour', tokens['--ink'])) }}>{title}</Heading>}
      {value(props, 'chrome.description.show', false) && <p className={styles.description} style={{ color: tokens['--soft'] }}>{String(value(props, 'chrome.description.text', ''))}</p>}
    </header>}
    <div className={styles.body}>
      {content}
    </div>
  </section>;
}
