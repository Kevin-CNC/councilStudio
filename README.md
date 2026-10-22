<p align="center">
  <picture>
    <img src="public/councilStudio_logo.svg" alt="Council Studio logo" width="96" height="96">
  </picture>
</p>

# Council Studio

Council Studio is a desktop application for comparing responses from independently configured AI personas. A prompt is sent to the selected council members, then a judge model synthesizes their answers into agreement, disagreement, minority views, and recommendations.

Members can use different providers, models, and system prompts. The application supports Anthropic, OpenAI, OpenRouter, and Ollama.

## Run from source

### Requirements

- Node.js 22.12 or newer and npm. Vite also supports Node.js 20.19 or newer within the 20.x release line.
- Rust and Cargo, installed through [rustup](https://rustup.rs/).
- The [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for your operating system: C++ build tools and WebView2 on Windows, Xcode command-line tools on macOS, or WebKitGTK and related development packages on Linux.
- An API key for each hosted provider you plan to use, or an accessible Ollama instance with the required models installed.

From the repository root, enter the application directory and start the desktop app:

```bash
cd councilStudio
npm ci
npm run tauri dev
```

Keep this terminal open while using the development app. Tauri starts the frontend development server on port 1420 and launches the desktop window.

`npm run dev` starts only the browser frontend. It is useful for UI development, but it does not provide the desktop backend required for real provider calls and persistent app data.

### Build

Run these commands from the application directory:

```bash
npm run build        # Check TypeScript and build the frontend
npm run tauri build  # Build the desktop application and platform bundles
```

Desktop bundles are generated under `src-tauri/target/release/bundle/`. Build for the target operating system using its Tauri prerequisites.

## Using Council Studio

### 1. Configure providers

Open **API Keys**, enter the credentials for the hosted providers you intend to use, and select **Save All Keys**. You do not need credentials for providers that none of your members or judge use.

For Ollama, start your Ollama server, install the model you want to run, and enter its base URL in **Ollama (Self-hosted)**. The default is `http://localhost:11434`; no API key is required. The server must be reachable from the machine running the desktop backend.

A saved-key indicator confirms storage, not a successful API request or access to a particular model. Use model identifiers available to your provider account or Ollama installation.

### 2. Configure members and a council

Open **Members** to create or edit personas. Each member has its own provider, model identifier, system prompt, temperature, token limit, reasoning setting, and display color. Use the system prompt to define the member's role or perspective.

Member saves use a confirmation step: click save once, wait for the confirmation button to become available, then confirm. Creating a member does not by itself place them in every council.

Return to **Council** and choose the named council you want to run from the roster dropdown. Its menu also provides **New Council**, **Rename Council**, and **Delete Council**. Add the members you want, remove unwanted members, and drag to change their order. A member must be both enabled and included in the selected council to participate.

### 3. Choose a judge and run a prompt

Use **Configure judge…** beside the prompt, or choose it from the judge-model dropdown, and select the judge's provider and model. Make sure that provider is configured too; the judge can use a different provider from the council members.

Enter your question in the prompt editor and select **Run Council** or press `Shift+Enter`. The editor accepts up to 4,000 characters. Use the paperclip control to attach images; choose models that support image input. This is not a general-purpose PDF or document upload feature.

If a **Model Compatibility Warning** appears, correct the member/model configuration or select **Run Anyway** to proceed despite the warning.

Member requests run concurrently. Responses become available as individual members finish; after they settle, the judge synthesizes the available answers. One member's failure does not prevent other members from returning results.

For reusable prompt values, open **Utilities → Vars**, add a custom variable such as `topic`, and reference it as `@topic` in your prompt. Defined references are replaced before submission; unknown names remain literal.

### 4. Review results and saved sessions

Use the response dock to inspect individual answers, the judge's synthesis, **Consensus**, **Sources**, and **Timeline**. Responses support Markdown, syntax-highlighted code, Mermaid diagrams, citations, and structured tables when the model returns the expected format. Use a response card's copy control to copy text or its raw-response control to inspect provider JSON when available.

Open **Utilities → Metrics** for token counts, latency, throughput, and cost breakdowns. Costs use provider-reported values where available or model pricing estimates; missing pricing can produce zero or an unavailable display. These values are not a billing statement.

Completed runs are saved automatically. Open **Sessions** to search, filter, sort, pin, reopen, or delete saved runs. Reopening a session displays its stored results and prompt; it does not automatically make another provider call.

### 5. Reuse and transfer data

- **Prompts:** select **New Template** to save a named prompt with a description and category. Select a template to put it into the council prompt editor. The editor's **Templates** control also opens prompt history and templates.
- **Members**, **Prompts**, and **Sessions:** use **Export** to download JSON or **Import** to read an export. Member and template imports offer a preview before applying changes.
- Exports are not complete installation backups. Member exports omit council membership, MCP assignments, and credentials; a portable full-council configuration export is not implemented.

## MCP integrations

MCP (Model Context Protocol) servers provide tools that assigned members can call during a run.

1. Open **Integrations** and select **Add Server**.
2. Choose **stdio** for a local command or **HTTP** for a streamable-HTTP endpoint. For stdio, enter the executable, add each command argument as a separate row, and supply required environment variables. For HTTP, enter the MCP endpoint URL and any required headers or bearer token.
3. Select **Test Connection** to connect and list the advertised tools, then save the server. Testing a local server launches its configured command.
4. Edit a member and select the server under **MCP Servers**, or use the server card's **Assign to all** control. Ensure the server is enabled and the assigned member is in your active council.
5. Run a prompt that needs those tools. Tool use depends on the model supporting tool calls and choosing to invoke them. The judge does not receive MCP tools.

Only configure servers you trust. Assigned tools execute without a per-call approval dialog and may read files, contact services, or modify data according to the server's capabilities. Tool results are sent back to the member's model provider.

Each member's tool loop is limited to eight model rounds. Unavailable servers can leave a member running without some or all tools, with a note in the result. The implemented HTTP transport is streamable HTTP; the UI's “HTTP (streamable / SSE)” label is not a guarantee of legacy SSE support.

## Data and privacy

Members, councils, prompt templates, sessions, and MCP server configuration are stored locally in `council.db` in the Tauri application-data directory. UI preferences are stored separately in webview local storage.

A local interface does not make hosted model calls private or offline. Prompts and model inputs are sent to the providers you configure. Review their data policies before submitting sensitive material.

**Provider API keys are currently stored as plaintext in `api_keys.json` in the application's data directory, not in an operating-system keychain.** Protect this directory and do not include it in shared backups or source control.

MCP environment values and bearer tokens are encrypted separately, but the encryption key is stored alongside the encrypted file. This is not operating-system keychain protection; access to both files permits decryption.

## Settings and shortcuts

Open **Settings** to change the light/dark theme, font size, high contrast, reduced motion, or keyboard bindings. Default shortcuts include:

| Action | Shortcut |
| --- | --- |
| Submit the prompt | `Shift+Enter` |
| Open settings | `Shift+,` |
| Toggle the utility panel | `Shift+.` |
| Open prompt history | `Shift+P` |
| Toggle the sidebar | `Shift+B` |
| Close a panel or cancel an active run | `Esc` |

Most shortcuts are ignored while typing in an input. Submit and Escape remain active. Escape closes open settings or editing panels before cancelling a run.

## Current limitations

- **Knowledge Base**, **Files**, and the standalone **Analytics** page are marked as coming soon. Prompt attachments are separate from the unfinished Files page.
- The header's global search, workspace selector, and prompt voice-input control are placeholders, not full search, multi-workspace support, or voice transcription.
- Desktop notification, sound, and email-digest settings are UI placeholders. In-app toast notifications are separate.
- Results arrive as completed member responses, not token-by-token provider streaming. A member's streaming setting does not currently enable live token output.
- **Cancel** changes the run's UI state but does not abort in-flight backend requests or MCP tool calls. Calls can continue and incur charges; cancellation is not a billing or execution stop.
- The **Vars** panel's concurrency and session `max_tokens` values are saved as session metadata but are not passed to the backend run. Members run concurrently using their own token limits; custom prompt-variable substitution does work.
- Automatic provider retries, rate limiting, fallback models, and configurable per-member request timeouts are not implemented.
- Model availability and supported input types depend on the selected provider and model. Compatibility warnings do not guarantee that a request will succeed.

## Troubleshooting

- **The browser UI opens but real runs do not work:** launch with `npm run tauri dev`, not only `npm run dev`.
- **Port 1420 is occupied:** stop the process using that port before launching. The frontend and Tauri configuration both expect port 1420.
- **A provider request fails:** check the saved key, account access, model identifier, network connection, and provider quota. Saving a key does not validate it.
- **Ollama cannot connect:** check that its server is running, the configured URL is reachable from the desktop backend, and the selected model is installed.
- **The desktop build fails on system dependencies:** follow the Tauri prerequisite guide for the operating system where you are building.
