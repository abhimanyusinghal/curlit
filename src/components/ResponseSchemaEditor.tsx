import CodeMirror from '@uiw/react-codemirror';
import { json } from '@codemirror/lang-json';
import { EditorView } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import type { RequestConfig, ResponseSchemaConfig } from '../types';
import { useAppStore } from '../store';
import { parseResponseSchemaConfig, RESPONSE_SCHEMA_DRAFT } from '../utils/responseSchemaConfig';

const example = JSON.stringify({
  $schema: RESPONSE_SCHEMA_DRAFT,
  type: 'object',
  properties: { id: { type: 'integer' } },
  required: ['id'],
}, null, 2);
const extensions = [json(), EditorView.contentAttributes.of({ 'aria-label': 'Response schema JSON' })];

export function ResponseSchemaEditor({ request }: { request: RequestConfig }) {
  const updateRequest = useAppStore(state => state.updateRequest);
  const theme = useAppStore(state => state.theme);
  let config: ResponseSchemaConfig = { enabled: false, schema: '' };
  let configError = false;
  try { config = parseResponseSchemaConfig(request.responseSchema) ?? config; }
  catch { configError = true; }
  const update = (changes: Partial<typeof config>) => updateRequest(request.id, { responseSchema: { ...config, ...changes } });
  let jsonError = false;
  if (config.schema.trim()) {
    try { JSON.parse(config.schema); } catch { jsonError = true; }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <label className="flex items-center gap-2 text-sm text-dark-200 cursor-pointer">
          <input type="checkbox" checked={config.enabled} onChange={event => update({ enabled: event.target.checked })} className="accent-accent-blue" />
          Validate response against schema
        </label>
        {!config.schema.trim() && (
          <button onClick={() => update({ schema: example })} className="text-xs text-accent-blue hover:underline cursor-pointer">Insert example</button>
        )}
      </div>
      <p className="text-xs text-dark-400">
        JSON Schema draft-07. Check required fields, types, arrays and formats. Results appear in Tests after sending.
      </p>
      {configError && <p role="alert" className="text-xs text-accent-red">Saved schema settings are invalid. Enter a schema and choose whether to enable validation to replace them.</p>}
      <CodeMirror
        value={config.schema}
        height="220px"
        extensions={extensions}
        theme={theme === 'dark' ? oneDark : 'light'}
        onChange={schema => update({ schema })}
        placeholder="Paste a JSON Schema or insert the example"
        basicSetup={{ lineNumbers: true, foldGutter: true }}
      />
      {jsonError && <p role="alert" className="text-xs text-accent-red">Schema is not valid JSON. Fix it before running validation.</p>}
      {config.enabled && !config.schema.trim() && <p className="text-xs text-accent-yellow">Add a schema or disable validation. An empty enabled schema will fail the run.</p>}
    </div>
  );
}
