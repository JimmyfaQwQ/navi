# Navi Settings Panel — Design

**Date:** 2026-06-02
**Status:** Approved (pending spec review)
**Scope:** Replace Navi's QuickPick-based settings flow with an editor-tab webview
panel that edits **every** `navi.*` setting, featuring a live **model selector**
(the original request) backed by a new `ModelCatalog` service.

---

## 1. Background & motivation

Today all Navi settings are edited through chained native dialogs:

- `src/settings/settingsCommands.ts` (`SettingsManager`) — LLM settings via
  `showQuickPick` → `showInputBox`. The **model** is a free-text input
  (`openModelSettings` → "Enter model name"), so users must know and type exact
  model ids.
- `src/mcp/settingsCommands.ts` (`McpSettingsManager`) — ~420 lines of guided
  QuickPick/InputBox steps to add/edit/delete/toggle MCP servers.
- The remaining keys (`copilotCliPath`, `streaming`, the three debug flags) are
  only reachable through VS Code's native Settings editor.

The original ask was "turn the model name input into a model selector." During
brainstorming this expanded (deliberately, with explicit user direction) into a
single **custom settings panel** that hosts every configurable parameter, with
the model field becoming a proper dropdown inside it.

Key platform facts that shape the design:

- The Copilot SDK exposes `client.listModels(): Promise<ModelInfo[]>`
  (`node_modules/@github/copilot-sdk/dist/client.d.ts`). Each `ModelInfo` has
  `id`, `name`, `capabilities` (context window, vision, reasoning-effort),
  `policy` (`enabled|disabled|unconfigured`), and `billing.multiplier`.
- `listModels()` queries the Copilot CLI server, so it only knows **Copilot**
  models. **BYOK** models must come from the OpenAI-compatible endpoint via
  `GET {baseUrl}/models`.
- VS Code cannot render a floating/centered custom modal for extensions. Custom
  HTML form controls can only live in a **webview panel** (editor tab) or a
  **webview view** (docked). We use an **editor-tab webview panel**.
- The repo already has a webview convention: `src/webview/<name>/{html,view,
  render,state}.ts`, CSS in `media/`, CSP via `webview.cspSource`, a per-view
  webpack entry (`webviewConfig` in `webpack.config.js`) producing
  `dist/<name>App.js`, and a messenger/router message protocol.
- `@github/copilot-sdk` is a node-side webpack external. Therefore **all model
  fetching runs in the extension host** (`ModelCatalog`); the webview never
  imports the SDK or calls `fetch` — it only sends/receives messages.

## 2. Goals & non-goals

**Goals**

1. A `navi.openSettings` command opens an editor-tab webview panel that is the
   single home for every `navi.*` setting.
2. The model field is a live dropdown: Copilot models via `listModels()` (rich
   rows), BYOK models via `GET {baseUrl}/models` (ids), with an in-place
   custom-entry fallback and a free-text fallback when fetching fails.
3. MCP servers are editable in-panel as expanded, auto-saving cards.
4. The panel reads/writes the same `navi.*` config keys; the native Settings
   editor continues to work over the same keys (the panel is an alternate editor,
   not a replacement store).
5. Retire the now-superseded QuickPick settings flows.

**Non-goals (explicitly deferred)**

- Migrating `navi.apiKey` from plaintext settings into VS Code `SecretStorage`
  (separate concern; the agent reads it via `resolveApiKey`). Keep current
  storage; present a password field + source indicator.
- Adding **new** settings (e.g. a reasoning-effort control). The panel exposes
  exactly the existing keys.
- Per-workspace vs global targets — keep writing to `ConfigurationTarget.Global`
  as the current flows do.

## 3. Decisions captured during brainstorming

| Topic | Decision |
|---|---|
| Model list source | **Live fetch, both modes** — Copilot via `listModels()`, BYOK via `GET {baseUrl}/models` |
| Custom model entry | **Keep**, as an in-list "Enter a custom model ID…" action |
| Copilot client access | **Approach A** — `ModelCatalog` spins up a throwaway client via `createCopilotClient`; no DI through the provider stack |
| Settings surface | **Editor-tab webview panel** (no floating modal is possible) |
| Panel coverage | **All** `navi.*` parameters, including debug flags / CLI path |
| Panel layout | **Sidebar categories** (left nav: Auth & Model / MCP / Advanced + right content pane) |
| Custom-entry placement | **In place** — the Model row swaps to a text field, then collapses back with a `custom` tag |
| MCP editor | **Expanded cards** (Option C) — every server card shows all fields, editable inline, transport-aware |
| MCP save behavior | **Auto-save on change** (debounced, inline ✓/⚠ validity), no Save button |

## 4. Architecture overview

```
                          extension.ts (activate)
                                  │ constructs
              ┌───────────────────┼──────────────────────┐
              ▼                                           ▼
       ModelCatalog                              SettingsPanel (manager)
   (extension host; SDK +                  owns the webview panel singleton,
    fetch live here)                       message routing, config read/write
              ▲                                           │ html + postMessage
              └────────────── called by ──────────────────┤
                                                           ▼
                                           src/webview/settings/* (browser)
                                           html · view · render · state
                                                  (dist/settingsApp.js)

  Triggers:  navi.openSettings command  ◄── chat webview "settings" button
                                        ◄── ApiKeyGate (missing key)
```

Layered like the existing chat/focus webviews:

- **Extension host:** `SettingsPanel` (panel lifecycle + message handler),
  `ModelCatalog` (model fetching), `naviConfig`/`mcp/config` (read/write/validate).
- **Browser (webview):** pure rendering from posted state; emits intent messages.
- **Shared:** typed message contract in `src/types/settings.ts`.

## 5. ModelCatalog (`src/settings/modelCatalog.ts`, new)

The swappable "where do models come from" unit. Pure mapping logic is separated
from I/O for testability.

```ts
export interface ModelChoice {
  id: string;            // value written to navi.model
  label: string;         // Copilot: ModelInfo.name; BYOK: id
  detail?: string;       // Copilot: "200k ctx · 1× · vision"; BYOK: undefined
  disabled?: boolean;    // Copilot policy.state === 'disabled'
}

export interface ModelCatalogResult {
  ok: boolean;
  source: 'copilot' | 'byok';
  models: ModelChoice[];
  error?: string;        // user-facing reason when ok === false
}

export class ModelCatalog {
  // factory/fetch injected for tests; default to the real implementations
  constructor(
    private clientFactory = createCopilotClient,
    private fetchFn: typeof fetch = fetch
  ) {}

  async list(config: vscode.WorkspaceConfiguration,
             opts?: { force?: boolean }): Promise<ModelCatalogResult>;
  invalidate(): void;    // clear cache (config changed or manual refresh)
}
```

**Copilot path:** `createCopilotClient(config)` → `start()` → `listModels()` →
map each `ModelInfo` → `stop()` (best-effort in `finally`). Wrapped by the
caller in a progress indicator. Cached under key `copilot`.

**BYOK path:** `url = resolveBaseUrl(config).replace(/\/+$/, '') + '/models'`;
`fetchFn(url, { headers: { Authorization: 'Bearer ' + resolveApiKey(config) } })`;
parse `{ data: [{ id }] }`; map id → `{ id, label: id }`; sort by id. Cached under
key `byok:${baseUrl}`. If no API key → `{ ok:false, error:'No API key configured.' }`.

**Mapping (pure, unit-tested):** `mapCopilotModels(ModelInfo[]) → ModelChoice[]`
and `parseOpenAiModels(json) → ModelChoice[]`:

- ctx → `${Math.round(limits.max_context_window_tokens/1000)}k ctx`
- multiplier → `${billing.multiplier}×` (omit if undefined)
- `supports.vision` → append `vision`; `supports.reasoningEffort` → `reasoning`
- `policy.state === 'disabled'` → `disabled: true`

**Cache:** in-memory `Map<string, ModelCatalogResult>`. `list({force})` bypasses
and refreshes. `invalidate()` clears all. The panel calls `invalidate()` on any
auth/endpoint/key config change and on the user's Refresh action.

**Failure policy:** never throw to the UI — return `{ ok:false, error }` so the
panel can fall back to free-text entry.

## 6. The settings panel

### 6.1 Webview files (mirror chat/focus)

- `src/webview/settings/html.ts` — `getSettingsHtml(webview, extensionUri)`:
  CSP (`default-src 'none'; style-src/script-src ${webview.cspSource}`), links
  `media/navi.css` + `media/settings.css`, loads `dist/settingsApp.js`. Emits the
  static shell: a `<nav>` with the three categories and an empty content
  container that the client fills from posted state.
- `src/webview/settings/view.ts` — webpack entry `settingsApp`. Acquires the
  vscode API, posts `{type:'settings:ready'}`, listens for state/model/error
  messages, wires DOM events to outbound messages.
- `src/webview/settings/render.ts` — pure DOM construction from state (sections,
  controls, model dropdown, MCP cards).
- `src/webview/settings/state.ts` — pure client helpers (active category, model
  dropdown open/loading/error, per-field MCP validity, debounce keys), unit-testable.
- `media/settings.css` — panel styles (reusing `navi.css` tokens/theme vars).

### 6.2 Categories & controls

Only the fields relevant to the current auth mode show (matches existing
behavior): API key + endpoint appear only in BYOK mode; model + streaming always.

**Auth & Model**
- `authMode` — segmented control `GitHub Copilot | BYOK`.
- `apiKey` *(BYOK only)* — password input; below it a source line
  (`VS Code Settings (in use)` / `Environment variable (in use)` /
  `Not configured`); a "Clear" action. The current source-string logic lives in
  the soon-deleted `SettingsManager.describeKeySource`; hoist it to `naviConfig.ts`
  as an exported `describeApiKeySource(config)` and reuse it from the panel.
- `apiBaseUrl` *(BYOK only)* — text input, URL-validated (http/https).
- `model` — **model selector** (§7).
- `streaming` — toggle.

**MCP** (§8)
- `mcpEnabled` — toggle.
- `mcpServersJson` — expanded server cards.

**Advanced**
- `copilotCliPath` — text input.
- `debugCopilotCliArgs` — toggle.
- `debugAgentReplyFlow` — toggle.
- `debugAgentReplyFlowReveal` — toggle.

## 7. Model selector behavior

State machine in the client, data supplied by `ModelCatalog` via the host:

- **Closed:** the Model row shows the current `navi.model` value (`▾`). If the
  current value isn't among fetched models, show it anyway with a `custom` tag.
- **Open:** on open, client sends `settings:fetchModels`; host posts a `loading`
  result first, then the real result. The popover shows a filter box, one row per
  model (label + `detail` for Copilot; id only for BYOK; ✓ on current; disabled
  rows greyed/non-selectable), then pinned actions: **✎ Enter a custom model
  ID…**, **⟳ Refresh** (`fetchModels {force:true}` after `invalidate`), **↺ Reset
  to default** (`gpt-5-mini`).
- **Custom entry (in place):** selecting the custom action closes the popover and
  swaps the Model **row** into a text input pre-filled with the current value,
  with Save / Cancel (Enter saves, Esc cancels, empty rejected). On save → write
  `navi.model`; the row collapses back showing the value + `custom` tag.
- **Fetch failed / empty / no key:** the popover shows `⚠ Couldn't load models —`
  and a free-text input so the user is never stuck.

Selecting any model → `settings:update {key:'model', value: choice.id}`.

## 8. MCP category — expanded cards

- Header: title + **Enable MCP** toggle (`mcpEnabled`).
- One **card per server**, expanded by default, all fields editable inline:
  - name (text), transport (`stdio | http` dropdown), per-card enable toggle,
    Delete.
  - stdio → command (text), args (JSON-array text), cwd (optional text).
  - http → url (text).
  - Disabled servers render dimmed.
- A dashed **＋ Add server** card appends a new default entry (e.g. unique name,
  `stdio`, empty command) and focuses it.

**Auto-save:** the client owns the parsed `McpServerSettings` as structured
state. On any field blur / toggle / delete (debounced ~400ms), it serializes the
full object and sends `settings:update {key:'mcpServersJson', value}`. The host
**validates authoritatively** by reusing `parseMcpServerSettings` (and
`toEnabledMcpConnections` for connection presence) from `src/mcp/config.ts`:

- valid → `config.update('mcpServersJson', JSON.stringify(servers, null, 2))`.
- invalid → post `settings:error {scope:'mcp', message}`; the offending
  card/field shows ⚠ and the bad value is **not** persisted.

The client does lightweight pre-checks (args parses to a string array; url
non-empty) to show ⚠ immediately, but the host is the source of truth.

## 9. Message contract (`src/types/settings.ts`, new)

```ts
export interface SettingsSnapshot {
  authMode: 'copilot' | 'byok';
  apiKeyConfigured: boolean;       // never send the key value itself
  apiKeySource: string;            // describeKeySource()
  apiBaseUrl: string;
  model: string;
  streaming: boolean;
  mcpEnabled: boolean;
  mcpServersJson: string;          // raw; client parses for cards
  copilotCliPath: string;
  debugCopilotCliArgs: boolean;
  debugAgentReplyFlow: boolean;
  debugAgentReplyFlowReveal: boolean;
  defaultModel: string;            // for "Reset to default"
  focus?: { category: string; field?: string };  // deep-link (ApiKeyGate)
}

// the writable setting keys (subset of NaviConfigSnapshot keys, minus derived ones)
type SettingKey =
  | 'authMode' | 'apiKey' | 'apiBaseUrl' | 'model' | 'streaming'
  | 'mcpEnabled' | 'mcpServersJson' | 'copilotCliPath'
  | 'debugCopilotCliArgs' | 'debugAgentReplyFlow' | 'debugAgentReplyFlowReveal';

// webview → host
type SettingsInbound =
  | { type: 'settings:ready' }
  | { type: 'settings:update'; key: SettingKey; value: string | boolean }
  | { type: 'settings:fetchModels'; force?: boolean }
  | { type: 'settings:resetModel' };

// host → webview
type SettingsOutbound =
  | { type: 'settings:state'; snapshot: SettingsSnapshot }
  | { type: 'settings:models'; loading: true }
  | { type: 'settings:models'; loading: false; result: ModelCatalogResult }
  | { type: 'settings:error'; scope: 'mcp' | 'model' | 'endpoint' | 'general'; message: string };
```

Security: the API key value is **never** sent to the webview — only
`apiKeyConfigured` + `apiKeySource`. Writing a new key is a normal
`settings:update {key:'apiKey'}`.

## 10. Panel manager (`src/settings/settingsPanel.ts`, new)

```ts
export class SettingsPanel {
  static current?: SettingsPanel;          // singleton
  static createOrShow(extensionUri, deps, focus?): void;  // reveal or create
  // createWebviewPanel('navi.settingsPanel', 'Navi Settings',
  //   ViewColumn.Active, { enableScripts:true,
  //   localResourceRoots:[extensionUri], retainContextWhenHidden:true })
}
```

Responsibilities:

- Sets `webview.html = getSettingsHtml(...)`; tracks the singleton; reveals if
  already open; disposes cleanly (`onDidDispose`).
- `onDidReceiveMessage`:
  - `settings:ready` → post snapshot.
  - `settings:update` → validate per key (endpoint URL; model non-empty; mcp via
    `parseMcpServerSettings`) → `config.update(key, value, Global)`; on failure
    post `settings:error`.
  - `settings:fetchModels` → post `{loading:true}`, then
    `modelCatalog.list(config, {force})` → post result. `force` calls
    `invalidate()` first.
  - `settings:resetModel` → `config.update('model', DEFAULT_MODEL)`.
- Subscribes to `workspace.onDidChangeConfiguration` for `navi.*`: re-post the
  snapshot (so external edits reflect live) and `modelCatalog.invalidate()` when
  `affectsModel` is true.

## 11. Wiring, lifecycle & retirements

- `extension.ts`:
  - `const modelCatalog = new ModelCatalog();`
  - Register command `navi.openSettings` → `SettingsPanel.createOrShow(
    context.extensionUri, { modelCatalog })`.
  - Add the command (and a `package.json` `contributes.commands` entry) so it's
    also reachable from the Command Palette.
- `chat/inboundRouter.ts`: `chat:openSettings` →
  `vscode.commands.executeCommand('navi.openSettings')`. Drop the `SettingsManager`
  dependency from the router.
- `chat/apiKeyGate.ts`: when the key is missing, run `navi.openSettings` with
  `focus:{category:'auth', field:'apiKey'}` instead of the old
  `openApiKeySettings()`. `ApiKeyGate` takes an `openSettings` callback rather
  than a `SettingsManager`.
- **Retire (delete):** `src/settings/settingsCommands.ts` (`SettingsManager`) and
  `src/mcp/settingsCommands.ts` (`McpSettingsManager`) — both are superseded by
  the panel and reachable only through the old QuickPick entry point. Their write
  semantics move into the panel; MCP validation reuses `src/mcp/config.ts`
  (unchanged, still used by the agent runtime). No current test files target
  these managers, so nothing test-side needs deleting.
- `settings/naviConfig.ts`: add exported `describeApiKeySource(config)` (hoisted
  from the deleted `SettingsManager`).
- `package.json`: keep all `contributes.configuration` entries (defaults/types
  and native-editor parity); add the `navi.openSettings` command.

## 12. Build changes

- `webpack.config.js`: add `settingsApp: './src/webview/settings/view.ts'` to the
  `webviewConfig.entry` map → emits `dist/settingsApp.js`.
- No new runtime dependencies. `global.fetch` is available in the VS Code
  extension host (Node ≥ 18); typed via the existing TS lib.

## 13. File inventory

**New**
- `src/settings/modelCatalog.ts`
- `src/settings/settingsPanel.ts`
- `src/types/settings.ts`
- `src/webview/settings/html.ts`
- `src/webview/settings/view.ts`
- `src/webview/settings/render.ts`
- `src/webview/settings/state.ts`
- `media/settings.css`
- `src/test/modelCatalog.test.ts`
- `src/test/settingsHtml.test.ts`
- `src/test/settingsState.test.ts`

**Modified**
- `extension.ts` (construct catalog, register command)
- `chat/inboundRouter.ts` (open via command; drop SettingsManager)
- `chat/apiKeyGate.ts` (open panel via callback)
- `chat/generationController.ts` (pass `openSettings` into `ApiKeyGate`)
- `settings/naviConfig.ts` (export `describeApiKeySource`)
- `webpack.config.js` (new entry)
- `package.json` (`contributes.commands`)

**Deleted**
- `src/settings/settingsCommands.ts`
- `src/mcp/settingsCommands.ts`
- (no existing test files target the deleted managers)

## 14. Testing strategy

- **ModelCatalog (unit):** `mapCopilotModels` (ctx/multiplier/vision/disabled
  formatting), `parseOpenAiModels` (`{data:[{id}]}` → sorted choices, malformed
  payloads), and `list()` branching with an injected `clientFactory`/`fetchFn`
  (Copilot success, BYOK success, no-key error, network error, caching +
  `invalidate`).
- **Settings HTML (unit):** `getSettingsHtml` includes the CSP, the three
  `asWebviewUri` resources, and the category shell — mirrors
  `chatHtml.test.ts`/`focusHtml.test.ts`.
- **Client state (unit):** `state.ts` pure helpers — model dropdown state
  transitions, MCP card ↔ `McpServerSettings` (de)serialization, per-field
  validity.
- **MCP validation reuse:** assert the panel's write path rejects the same
  malformed JSON that `parseMcpServerSettings` rejects.
- Message-routing / `config.update` paths that require the VS Code host are kept
  thin; logic is extracted into the pure units above.

## 15. Error handling & edge cases

- Copilot CLI fails to start / `listModels` throws → `{ok:false}` → free-text
  fallback (no crash); progress indicator always resolves.
- BYOK endpoint returns non-200 / non-JSON / missing `data` → `{ok:false, error}`.
- Current `navi.model` not in the fetched list → shown as selected with `custom`.
- Empty `mcpServersJson` ("") is valid → zero cards + Add card.
- Invalid `mcpServersJson` already in settings → cards area shows the parse error
  with a "fix as raw JSON" affordance rather than rendering broken cards.
- Panel open when settings change externally (native editor) → snapshot re-posts;
  in-progress unsaved MCP text is debounced, last-write-wins.

## 16. Future / out of scope

- `SecretStorage` migration for `apiKey`.
- A raw-JSON escape hatch for MCP (the deleted JSON-editor Option A) if structured
  cards prove limiting.
- Reasoning-effort selection (the SDK exposes `supportedReasoningEfforts`).
- Per-workspace configuration targets.
