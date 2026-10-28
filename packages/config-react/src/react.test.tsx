import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, renderHook, screen, cleanup } from '@testing-library/react';
import { chrome, colour, defineComponent, paletteFor, type SavedDocument } from '@infinity/config-core';
import { clearVisualRegistry, registerVisual } from './registry.js';
import { Visual } from './Visual.js';
import { ChromeFrame } from './ChromeFrame.js';
import { SettingsPanel } from './SettingsPanel.js';
import { useResolvedConfig } from './useResolvedConfig.js';

const component = defineComponent({
  name: 'react-test', version: '1.0.0', kind: 'visual', groups: [chrome()],
  props: {
    'test.visible': { type: 'text', default: 'hello', cost: 'layout', label: 'Visible field', description: 'Visible', agentNote: 'Change when needed' },
    'test.hidden': { type: 'text', default: 'secret', cost: 'layout', label: 'Hidden field', description: 'Hidden', agentNote: 'Change when needed', visibleWhen: { path: 'chrome.title.show', equals: false } },
  },
});
const doc: SavedDocument = { component: 'react-test', version: '1.0.0', overrides: { 'chrome.title.text': 'Heading' } };
const tokens = { '--card': '#FFFFFF', '--rule': '#333333', '--series-1': '#111111' };

afterEach(() => { cleanup(); clearVisualRegistry(); });

describe('JSON editor', () => {
  const jsonComponent = defineComponent({ name: 'json-editor', version: '1.0.0', kind: 'interface', props: {
    'form.values': { type: 'json', default: {}, cost: 'data', label: 'Values', description: 'Initial values', agentNote: 'Edit values',
      shape: { type: 'object', properties: { email: { type: 'string', maxLength: 5 } } } },
  } });
  const jsonDoc: SavedDocument = { component: 'json-editor', version: '1.0.0', overrides: {} };
  it('parses on blur, reports the value path and patches only valid JSON', () => {
    const onPatch = vi.fn();
    render(<SettingsPanel component={jsonComponent} doc={jsonDoc} onPatch={onPatch} />);
    const editor = screen.getByLabelText('Values') as HTMLTextAreaElement;
    fireEvent.change(editor, { target: { value: '{bad' } });
    expect(onPatch).not.toHaveBeenCalled();
    fireEvent.blur(editor);
    expect(screen.getByRole('alert').textContent).toContain('form.values');
    fireEvent.change(editor, { target: { value: '{"email":"too long"}' } });
    fireEvent.blur(editor);
    expect(screen.getByRole('alert').textContent).toContain('form.values.email');
    expect(onPatch).not.toHaveBeenCalled();
    fireEvent.change(editor, { target: { value: '{"email":"ok"}' } });
    fireEvent.blur(editor);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(onPatch).toHaveBeenCalledWith([{ op: 'set', path: 'form.values', value: { email: 'ok' } }]);
  });
});

describe('Visual', () => {
  it('passes resolved series from data roles and columns in data order', () => {
    const seriesComponent = defineComponent({ name: 'series-test', version: '1.0.0', kind: 'visual', groups: [chrome()], series: { colour: true, hidden: true } });
    registerVisual(seriesComponent, ({ series }) => <output data-testid="series">{JSON.stringify(series)}</output>);
    render(<Visual component="series-test" config={{ component: 'series-test', version: '1.0.0', overrides: {}, series: [
      { match: { id: 'revenue' }, set: { colour: { token: '--series-1' } } },
      { match: { label: '^Prior' }, set: { hidden: true } },
      { match: { role: 'comparison' }, set: { colour: { token: '--series-1' } } },
    ] }} data={{ rows: [{ revenue: 3, prior: 2 }], columns: [{ key: 'revenue', label: 'Revenue' }, { key: 'prior', label: 'Prior revenue' }],
      roles: { values: ['revenue'], comparison: { revenue: 'prior' } } }} tokens={tokens} />);
    expect(JSON.parse(screen.getByTestId('series').textContent ?? '')).toEqual({ revenue: { colour: '#111111' }, prior: { hidden: true, colour: '#111111' } });
  });
  it('infers the value, comparison and target series for single-value data', () => {
    const seriesComponent = defineComponent({ name: 'single-series-test', version: '1.0.0', kind: 'visual', groups: [chrome()], series: { colour: true, hidden: true } });
    registerVisual(seriesComponent, ({ series }) => <output data-testid="series">{JSON.stringify(series)}</output>);
    render(<Visual component="single-series-test" config={{ component: 'single-series-test', version: '1.0.0', overrides: {}, series: [
      { match: { id: 'value' }, set: { colour: { token: '--series-1' } } },
      { match: { role: 'comparison' }, set: { hidden: true } },
      { match: { role: 'target' }, set: { colour: { token: '--series-1' } } },
    ] }} data={{ rows: [{ value: 3, prior: 2, goal: 4 }], columns: [
      { key: 'value', label: 'Revenue' }, { key: 'prior', label: 'Prior revenue' }, { key: 'goal', label: 'Goal' },
    ], roles: { value: 'value', comparison: 'prior', target: 'goal' } }} tokens={tokens} />);
    expect(JSON.parse(screen.getByTestId('series').textContent ?? '')).toEqual({
      value: { colour: '#111111' }, prior: { hidden: true }, goal: { colour: '#111111' },
    });
  });
  it('treats table columns as series when rows and columns have no roles', () => {
    const tableComponent = defineComponent({ name: 'table-series-test', version: '1.0.0', kind: 'visual',
      data: { shape: 'table' }, groups: [chrome()], series: { hidden: true, label: true } });
    registerVisual(tableComponent, ({ series }) => <output data-testid="table-series">{JSON.stringify(series)}</output>);
    const config: SavedDocument = { component: 'table-series-test', version: '1.0.0', overrides: {}, series: [
      { match: { id: 'region' }, set: { hidden: true } },
      { match: { id: 'orders' }, set: { label: 'Transactions' } },
      { match: { label: '^Rev' }, set: { label: 'Sales' } },
    ] };
    const columns = [{ key: 'region', label: 'Region' }, { key: 'orders', label: 'Orders' }, { key: 'revenue', label: 'Revenue' }];
    const { rerender } = render(<Visual component="table-series-test" config={config}
      data={{ rows: [{ region: 'East', orders: 2, revenue: 3 }], columns }} tokens={tokens} />);
    expect(JSON.parse(screen.getByTestId('table-series').textContent ?? '')).toEqual({
      region: { hidden: true }, orders: { label: 'Transactions' }, revenue: { label: 'Sales' },
    });
    rerender(<Visual component="table-series-test" config={config}
      data={{ rows: [{ orders: 2 }], columns, roles: { values: ['orders'] } }} tokens={tokens} />);
    expect(JSON.parse(screen.getByTestId('table-series').textContent ?? '')).toEqual({ orders: { label: 'Transactions' } });
  });
  it('does not infer table columns for another shape without roles', () => {
    const other = defineComponent({ name: 'other-series-test', version: '1.0.0', kind: 'visual',
      data: { shape: 'categorical' }, groups: [chrome()], series: { hidden: true } });
    registerVisual(other, ({ series }) => <output data-testid="other-series">{JSON.stringify(series)}</output>);
    render(<Visual component="other-series-test" config={{ component: 'other-series-test', version: '1.0.0', overrides: {},
      series: [{ match: { id: 'revenue' }, set: { hidden: true } }] }}
    data={{ rows: [{ revenue: 3 }], columns: [{ key: 'revenue', label: 'Revenue' }] }} tokens={tokens} />);
    expect(JSON.parse(screen.getByTestId('other-series').textContent ?? '')).toEqual({});
  });
  it('resolves category members as ordered series only when declared', () => {
    const memberChart = defineComponent({ name: 'member-series-test', version: '1.0.0', kind: 'visual',
      data: { shape: 'categorical', seriesFrom: 'category' }, groups: [chrome(), colour()],
      series: { colour: true, hidden: true, dashed: true, dash: true } });
    registerVisual(memberChart, ({ series }) => <output data-testid="member-series">{JSON.stringify(series)}</output>);
    const paletteTokens = { ...tokens, '--series-2': '#222222', '--series-3': '#333333',
      '--series-4': '#444444', '--series-dash': '5 3' };
    const data = { rows: ['Search', 'Email', 'Direct', 'Social', 'Partners', 'Events', 'Email']
      .map(channel => ({ channel, revenue: 4 })),
      columns: [{ key: 'channel', label: 'Channel' }, { key: 'revenue', label: 'Revenue' }],
      roles: { category: 'channel', values: ['revenue'] } };
    const config: SavedDocument = { component: 'member-series-test', version: '1.0.0', overrides: {}, series: [
      { match: { id: 'Email' }, set: { colour: { token: '--series-4' } } },
      { match: { label: '^Part' }, set: { hidden: true } },
    ] };
    render(<Visual component="member-series-test" config={config} data={data} tokens={paletteTokens} />);
    const series = JSON.parse(screen.getByTestId('member-series').textContent ?? '');
    expect(Object.keys(series)).toEqual(['Search', 'Email', 'Direct', 'Social', 'Partners', 'Events']);
    expect(Object.values(series).map((entry: any) => entry.colour))
      .toEqual(['#111111', '#444444', '#333333', '#444444', '#111111', '#222222']);
    expect(series.Partners).toMatchObject({ hidden: true, dashed: true, dash: '5 3' });
    expect(series.Events).toMatchObject({ dashed: true, dash: '5 3' });
    expect(series.revenue).toBeUndefined();
    cleanup();
    const ordinary = defineComponent({ name: 'ordinary-categorical', version: '1.0.0', kind: 'visual',
      data: { shape: 'categorical' }, groups: [chrome()], series: { hidden: true } });
    registerVisual(ordinary, ({ series }) => <output data-testid="ordinary-series">{JSON.stringify(series)}</output>);
    render(<Visual component="ordinary-categorical" config={{ component: 'ordinary-categorical', version: '1.0.0', overrides: {} }}
      data={data} tokens={paletteTokens} />);
    expect(Object.keys(JSON.parse(screen.getByTestId('ordinary-series').textContent ?? ''))).toEqual(['revenue']);
  });
  it('passes resolved theme tokens for a renderer row identity palette', () => {
    const identity = defineComponent({ name: 'identity-test', version: '1.0.0', kind: 'visual',
      groups: [chrome(), colour()] });
    registerVisual(identity, rendererProps => <output data-testid="identity"
      data-has-tokens={'tokens' in rendererProps || 'tokens' in rendererProps.props ? 'yes' : 'no'}>
      {paletteFor(rendererProps.props, 'Ada', ['Ada']).colour}
    </output>);
    render(<Visual component="identity-test" config={{ component: 'identity-test', version: '1.0.0', overrides: {} }}
      data={{ rows: [{ owner: 'Ada' }] }} tokens={tokens} />);
    expect(screen.getByTestId('identity').textContent).toBe('#111111');
    expect(screen.getByTestId('identity').getAttribute('data-has-tokens')).toBe('no');
  });
  it('renders a registered component with chrome', () => {
    registerVisual(component, () => <div>Drawn visual</div>);
    render(<Visual component="react-test" config={doc} data={{ rows: [1] }} tokens={tokens} />);
    expect(screen.getByText('Drawn visual')).toBeTruthy();
    expect(screen.getByText('Heading')).toBeTruthy();
    const title = screen.getByText('Heading');
    expect(screen.getByRole('region', { name: 'Heading' }).getAttribute('aria-labelledby')).toBe(title.id);
    expect(title.id).not.toBe('');
    expect(document.querySelector('[data-component="react-test"][data-ready="true"]')).toBeTruthy();
  });
  it('passes children unchanged to the renderer inside the chrome', () => {
    registerVisual(component, ({ children }) => <div data-testid="renderer">{children}</div>);
    render(<Visual component="react-test" config={doc} data={{ rows: [1] }} tokens={tokens}>
      <span data-testid="nested">Nested content</span>
    </Visual>);
    expect(screen.getByTestId('renderer').contains(screen.getByTestId('nested'))).toBe(true);
    expect(screen.getByRole('region', { name: 'Heading' }).contains(screen.getByTestId('renderer'))).toBe(true);
    cleanup();
    render(<Visual component="react-test" config={doc} data={{ rows: [1] }} tokens={tokens} />);
    expect(screen.getByTestId('renderer').childNodes).toHaveLength(0);
  });
  it('uses the caller heading level and keeps h2 as the default', () => {
    registerVisual(component, () => <div>Drawn visual</div>);
    const { rerender } = render(<Visual component="react-test" config={doc} data={{ rows: [1] }} tokens={tokens} headingLevel={3} />);
    const heading = screen.getByRole('heading', { level: 3, name: 'Heading' });
    expect(screen.getByRole('region', { name: 'Heading' }).getAttribute('aria-labelledby')).toBe(heading.id);
    rerender(<Visual component="react-test" config={doc} data={{ rows: [1] }} tokens={tokens} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Heading' })).toBeTruthy();
  });
  it('passes the heading level to the renderer, including the default', () => {
    registerVisual(component, ({ headingLevel }) => <output data-testid="renderer-level">{headingLevel}</output>);
    const { rerender } = render(<Visual component="react-test" config={doc} data={{ rows: [1] }} tokens={tokens} headingLevel={3} />);
    expect(screen.getByTestId('renderer-level').textContent).toBe('3');
    rerender(<Visual component="react-test" config={doc} data={{ rows: [1] }} tokens={tokens} />);
    expect(screen.getByTestId('renderer-level').textContent).toBe('2');
  });
  it('removes the chrome frame when the header setting is none', () => {
    registerVisual(component, () => <div>Drawn visual</div>);
    const bare = { ...doc, overrides: { ...doc.overrides, 'chrome.header': 'none' } };
    const { container } = render(<Visual component="react-test" config={bare} data={{ rows: [1] }} tokens={tokens} headingLevel={3} />);
    expect(screen.getByText('Drawn visual')).toBeTruthy();
    expect(screen.queryByRole('heading')).toBeNull();
    expect(container.querySelector('header')).toBeNull();
    expect(container.querySelector('section')).toBeNull();
  });
  it('keeps error and empty states when the header is none', () => {
    const { rerender } = render(<ChromeFrame props={{ 'chrome.header': 'none' }}
      error={{ component: 'react-test', path: 'render', message: 'failed' }} />);
    expect(screen.getByRole('alert').textContent).toContain('failed');
    rerender(<ChromeFrame props={{ 'chrome.header': 'none', 'chrome.empty.text': 'Nothing here' }} empty />);
    expect(screen.getByText('Nothing here')).toBeTruthy();
    expect(document.querySelector('section')).toBeNull();
  });
  it('keeps a renderer error headerless when requested', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      registerVisual(component, () => { throw new Error('renderer failed'); });
      const bare = { ...doc, overrides: { ...doc.overrides, 'chrome.header': 'none' } };
      const { container } = render(<Visual component="react-test" config={bare} data={{ rows: [1] }} tokens={tokens} />);
      expect(screen.getByRole('alert').textContent).toContain('renderer failed');
      expect(container.querySelector('section')).toBeNull();
    } finally {
      log.mockRestore();
    }
  });
  it('names the frame with the component when the title is off or empty', () => {
    registerVisual(component, () => <div>Drawn visual</div>);
    const { rerender } = render(<Visual component="react-test" config={{ ...doc, overrides: { 'chrome.title.show': false } }} data={{ rows: [1] }} tokens={tokens} />);
    expect(screen.getByRole('region', { name: 'react-test' }).getAttribute('aria-labelledby')).toBeNull();
    rerender(<Visual component="react-test" config={{ ...doc, overrides: { 'chrome.title.text': '' } }} data={{ rows: [1] }} tokens={tokens} />);
    expect(screen.getByRole('region', { name: 'react-test' }).getAttribute('aria-labelledby')).toBeNull();
  });
  it('draws an error card for an invalid config', () => {
    registerVisual(component, () => <div>Never drawn</div>);
    render(<Visual component="react-test" config={{ ...doc, overrides: { 'chrome.card.background': '#FFFFFF' } }} data={{}} tokens={tokens} />);
    expect(screen.getByRole('alert').textContent).toContain('chrome.card.background');
    expect(screen.getByRole('alert').textContent).toContain('react-test');
  });
  it('draws the empty state', () => {
    registerVisual(component, () => <div>Never drawn</div>);
    render(<Visual component="react-test" config={doc} data={{ rows: [] }} tokens={tokens} />);
    expect(screen.getByText('No data for this range')).toBeTruthy();
  });
  it('shows a saved raw note on the visual flag', () => {
    registerVisual(component, () => <div>Drawn visual</div>);
    render(<Visual component="react-test" config={{ ...doc, raw: { chart: { barGap: 3 } }, rawNote: 'Spacing adjustment' }} data={{ rows: [1] }} tokens={tokens} />);
    expect(screen.getByRole('status').textContent).toContain('Spacing adjustment');
  });
  it('uses defaults below saved overrides', () => {
    registerVisual(component, ({ props }) => <output data-testid="resolved-title">{String(props['chrome.title.text'])}</output>);
    render(<Visual component="react-test" config={doc} data={{ rows: [1] }} tokens={tokens} defaults={{ 'chrome.title.text': 'Default title' }} />);
    expect(screen.getByTestId('resolved-title').textContent).toBe('Heading');
    cleanup();
    render(<Visual component="react-test" config={{ ...doc, overrides: {} }} data={{ rows: [1] }} tokens={tokens} defaults={{ 'chrome.title.text': 'Default title' }} />);
    expect(screen.getByTestId('resolved-title').textContent).toBe('Default title');
  });
  it('keeps rendering empty rows when preserveEmpty is true', () => {
    registerVisual(component, () => <div>Drawn with empty rows</div>);
    render(<Visual component="react-test" config={doc} data={{ rows: [] }} tokens={tokens} preserveEmpty />);
    expect(screen.getByText('Drawn with empty rows')).toBeTruthy();
  });
  it('limits the error card to three path messages', () => {
    registerVisual(component, () => <div>Never drawn</div>);
    render(<Visual component="react-test" config={{ ...doc, overrides: {
      'chrome.card.show': 'wrong', 'chrome.title.show': 'wrong',
      'chrome.description.show': 'wrong', 'chrome.animate': 'wrong',
    } }} data={{ rows: [1] }} tokens={tokens} />);
    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('react-test broke');
    expect(alert.querySelectorAll('span')).toHaveLength(3);
    expect(alert.textContent).toContain('chrome.card.show:');
  });
  it('passes act and emit to the renderer', () => {
    const act = vi.fn(async () => ({ ok: true }));
    const emit = vi.fn();
    registerVisual(component, ({ act: run, emit: send }) => <button onClick={() => {
      void run?.({ type: 'open' });
      send?.('selected', { id: 1 });
    }}>Trigger</button>);
    render(<Visual component="react-test" config={doc} data={{ rows: [1] }} tokens={tokens} act={act} emit={emit} />);
    fireEvent.click(screen.getByText('Trigger'));
    expect(act).toHaveBeenCalledWith({ type: 'open' });
    expect(emit).toHaveBeenCalledWith('selected', { id: 1 });
  });
});

describe('SettingsPanel', () => {
  it('shows the implicit card header default', () => {
    render(<SettingsPanel component={component} doc={doc} onPatch={() => {}} tokens={tokens} />);
    expect((screen.getByLabelText('Header frame') as HTMLSelectElement).value).toBe('card');
  });
  it('generates a field for every visible key', () => {
    render(<SettingsPanel component={component} doc={doc} onPatch={() => {}} tokens={tokens} />);
    expect(screen.getByLabelText('Visible field')).toBeTruthy();
    expect(screen.queryByLabelText('Hidden field')).toBeNull();
  });
  it('sends a reset patch that deletes one key', () => {
    const onPatch = vi.fn();
    render(<SettingsPanel component={component} doc={doc} onPatch={onPatch} tokens={tokens} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset Title text' }));
    expect(onPatch).toHaveBeenCalledWith([{ op: 'reset', path: 'chrome.title.text' }]);
  });
  it('sends a group reset patch', () => {
    const onPatch = vi.fn();
    render(<SettingsPanel component={component} doc={doc} onPatch={onPatch} tokens={tokens} />);
    fireEvent.click(screen.getByRole('button', { name: 'Reset chrome' }));
    expect(onPatch).toHaveBeenCalledWith([{ op: 'reset', path: 'chrome' }]);
  });
  it('links box side edits when asked', () => {
    const onPatch = vi.fn();
    render(<SettingsPanel component={component} doc={doc} onPatch={onPatch} tokens={tokens} />);
    fireEvent.click(screen.getByRole('button', { name: 'Link chrome.padding' }));
    fireEvent.change(screen.getByLabelText('Card padding top'), { target: { value: '12' } });
    expect(onPatch).toHaveBeenCalledWith(['top', 'right', 'bottom', 'left'].map(side => ({ op: 'set', path: `chrome.padding.${side}`, value: 12 })));
  });
  it('shows a saved raw note in the inspector', () => {
    render(<SettingsPanel component={component} doc={{ ...doc, raw: { chart: { barGap: 3 } }, rawNote: 'Spacing adjustment' }} onPatch={() => {}} tokens={tokens} />);
    expect(screen.getByRole('status').textContent).toContain('Spacing adjustment');
    fireEvent.click(screen.getByText('Why raw'));
    expect(screen.getByText(/"rawNote": "Spacing adjustment"/)).toBeTruthy();
  });
});

it('keeps layout memo stable for style-only edits', () => {
  const first = { overrides: { 'chrome.card.background': { token: '--card' } } };
  const { result, rerender } = renderHook(({ layer }) => useResolvedConfig(component, layer, tokens), { initialProps: { layer: first } });
  const layout = result.current.layout;
  rerender({ layer: { overrides: { 'chrome.card.background': { token: '--rule' } } } });
  expect(result.current.layout).toBe(layout);
});
