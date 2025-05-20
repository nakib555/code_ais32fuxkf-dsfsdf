// --- START OF FILE script.js ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("script.js: DOMContentLoaded event fired.");

    // AI Sidebar Elements
    const chatArea = document.getElementById('chatArea');
    const chatInput = document.getElementById('chatInput');
    const sendChatButton = document.getElementById('sendChatButton');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const setApiKeyButton = document.getElementById('setApiKeyButton');
    const modelNameSelect = document.getElementById('modelNameSelect');
    const modelNameInputFallback = document.getElementById('modelNameInputFallback');
    const themeSelect = document.getElementById('themeSelect');

    // Terminal Elements
    const terminalContainer = document.getElementById('terminal');
    const terminalPane = document.getElementById('terminalPane');
    const toggleMainTerminalBtn = document.getElementById('toggleMainTerminalBtn');
    let term; // Xterm instance
    let fitAddon; // Xterm FitAddon instance

    // Main Layout Elements
    const aiSidebar = document.getElementById('aiSidebar');
    const mainContentWrapper = document.getElementById('mainContentWrapper');
    const resizerAiMain = document.getElementById('resizerAiMain');

    // Content Pane Elements
    const editorPaneContent = document.getElementById('editorPaneContent');
    const codePane = document.getElementById('codePane');
    const diffPane = document.getElementById('diffPane');
    const previewPane = document.getElementById('previewPane');
    const contentPanes = [codePane, diffPane, previewPane].filter(p => p);


    // Global State Variables
    let lastTerminalCommand = null;
    let lastTerminalOutput = null;
    let terminalOutputSentToAI = true;

    const ANSI_RESET = '\x1b[0m';
    const ANSI_BOLD = '\x1b[1m';
    let ansiColorLink, ansiColorError, ansiColorWarning, ansiColorSuccess, ansiColorSecondary;

    window.BoltDevUI = window.BoltDevUI || {};

    let currentlyOpenFilePath = null;
    let currentlyOpenFileContent = null;
    let currentlyOpenFileLangClass = 'plaintext';

    window.BoltDevUI.getCurrentFilePath = () => currentlyOpenFilePath;
    window.BoltDevUI.getCurrentFileContent = () => currentlyOpenFileContent;
    window.BoltDevUI.getCurrentFileLangClass = () => currentlyOpenFileLangClass;
    window.BoltDevUI.setCurrentlyOpenFile = (path, content, langClass) => {
        currentlyOpenFilePath = path;
        currentlyOpenFileContent = content;
        currentlyOpenFileLangClass = langClass;
        if (window.BoltDevUI.updateDiffPaneView && diffPane && diffPane.classList.contains('active-pane')) {
             window.BoltDevUI.updateDiffPaneView(currentlyOpenFilePath, currentlyOpenFileContent, currentlyOpenFileLangClass, "Reviewing File", false);
        }
    };

    window.showToast = function(message, type = 'info') {
        let backgroundColor;
        let textColor = getCssVariableValue("--text-on-accent") || '#ffffff';
        switch (type) {
            case 'error': backgroundColor = getCssVariableValue("--accent-error") || '#dc3545'; break;
            case 'success': backgroundColor = getCssVariableValue("--accent-success") || '#28a745'; break;
            case 'warning': backgroundColor = getCssVariableValue("--accent-warning") || '#ffc107'; break;
            default: backgroundColor = getCssVariableValue("--accent-primary") || '#007bff';
        }
        const currentTheme = document.documentElement.className;
        if (currentTheme.includes('theme-spooky') && type === 'warning') textColor = '#282828';
        if (currentTheme.includes('theme-rainbow') && (type === 'warning' || type === 'success')) textColor = '#111';
        if (currentTheme.includes('theme-light')) {
             if (type === 'warning') textColor = '#212529';
             else if (['success', 'error', 'info'].includes(type)) textColor = '#ffffff';
        }

        if (typeof Toastify === 'undefined') {
            alert(`${type.toUpperCase()}: ${message}`); return;
        }
        Toastify({
            text: message, duration: 4000, close: true, gravity: "bottom", position: "right",
            stopOnFocus: true, style: { background: backgroundColor, borderRadius: "var(--radius-md)", boxShadow: "var(--shadow-md)", fontFamily: "var(--font-ui)", fontSize: "13px", color: textColor }
        }).showToast();
    }

    function getCssVariableValue(variableName) {
        return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
    }

    function colorStringToAnsiFg(colorString, bold = false) {
        let match = colorString.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
        if (!match) {
            match = colorString.match(/^#?([a-f\d])([a-f\d])([a-f\d])$/i);
            if (match) colorString = `#${match[1]}${match[1]}${match[2]}${match[2]}${match[3]}${match[3]}`;
            match = colorString.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
        }
        if (match) colorString = `rgb(${parseInt(match[1], 16)}, ${parseInt(match[2], 16)}, ${parseInt(match[3], 16)})`;
        match = colorString.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
        if (match) {
            let escapeCode = `\x1b[38;2;${match[1]};${match[2]};${match[3]}m`;
            if (bold) escapeCode = ANSI_BOLD + escapeCode;
            return escapeCode;
        }
        return bold ? ANSI_BOLD : '';
    }

    function updateAnsiColors() {
        ansiColorLink = colorStringToAnsiFg(getCssVariableValue('--text-link'));
        ansiColorError = colorStringToAnsiFg(getCssVariableValue('--accent-error'), true);
        ansiColorWarning = colorStringToAnsiFg(getCssVariableValue('--accent-warning'), true);
        ansiColorSuccess = colorStringToAnsiFg(getCssVariableValue('--accent-success'));
        ansiColorSecondary = colorStringToAnsiFg(getCssVariableValue('--text-secondary'));
    }

    function getXtermThemeObjectFromCss() {
        return {
            background: getCssVariableValue('--bg-inset'), foreground: getCssVariableValue('--text-primary'),
            cursor: getCssVariableValue('--accent-primary'), selectionBackground: getCssVariableValue('--bg-active'),
            black: getCssVariableValue('--bg-surface'), red: getCssVariableValue('--accent-error'),
            green: getCssVariableValue('--accent-success'), yellow: getCssVariableValue('--accent-warning'),
            blue: getCssVariableValue('--accent-primary'), magenta: getCssVariableValue('--accent-secondary'),
            cyan: '#56b6c2', white: getCssVariableValue('--text-primary'),
            brightBlack: getCssVariableValue('--text-secondary'), brightRed: getCssVariableValue('--accent-error'),
            brightGreen: getCssVariableValue('--accent-success'), brightYellow: getCssVariableValue('--accent-warning'),
            brightBlue: getCssVariableValue('--accent-primary'), brightMagenta: getCssVariableValue('--accent-secondary'),
            brightCyan: '#80d0ff', brightWhite: getCssVariableValue('--text-headings')
        };
    }

    if (typeof Terminal === 'undefined' || typeof FitAddon === 'undefined') {
        console.error("script.js: Xterm.js or FitAddon is not loaded. Terminal will not function.");
        if (terminalContainer) terminalContainer.innerHTML = "<p>Error: Terminal library not loaded.</p>";
    } else {
        term = new Terminal({
            cursorBlink: true, fontSize: 13, fontFamily: 'var(--font-code)',
            theme: getXtermThemeObjectFromCss(), rows: 10, convertEol: true, scrollback: 1000,
        });
        fitAddon = new FitAddon.FitAddon();
        term.loadAddon(fitAddon);

        if (terminalContainer) term.open(terminalContainer);
        else console.error("script.js: Terminal container not found. Cannot open Xterm.js terminal.");

        function fitTerminal() {
            try {
                if (terminalPane && terminalPane.style.display !== 'none' && terminalContainer && terminalContainer.offsetWidth > 0 && terminalContainer.offsetHeight > 0 && term && term.element && term.element.offsetParent !== null) {
                    fitAddon.fit();
                }
            } catch (e) { console.warn("script.js: Fit addon error during fitTerminal:", e); }
        }
        window.BoltDevUI.fitTerminal = fitTerminal; // Expose for other modules if needed

        function writeInitialTerminalMessages() {
            if (!term) return;
            term.writeln('Welcome to the Bolt Terminal!');
            term.writeln('Type commands for the project directory.');
            const projectPrompt = `\r\n${ansiColorLink}~/project${ANSI_RESET}\r\n${ansiColorError}❯ ${ANSI_RESET}`;
            term.write(projectPrompt);
        }

        let currentCommand = '';
        term.onKey(e => {
            if (!term) return;
            const ev = e.domEvent;
            const printable = !ev.altKey && !ev.ctrlKey && !ev.metaKey;
            if (ev.key === 'Enter') {
                term.writeln('');
                if (currentCommand.trim() !== '') runTerminalCommand(currentCommand);
                else {
                    const projectPrompt = `\r\n${ansiColorLink}~/project${ANSI_RESET}\r\n${ansiColorError}❯ ${ANSI_RESET}`;
                    term.write(projectPrompt);
                }
                currentCommand = '';
            } else if (ev.key === 'Backspace') {
                if (currentCommand.length > 0) {
                    term.write('\b \b');
                    currentCommand = currentCommand.slice(0, -1);
                }
            } else if (printable && ev.key.length === 1) {
                term.write(e.key);
                currentCommand += e.key;
            }
        });

        setTimeout(() => { fitTerminal(); writeInitialTerminalMessages(); }, 250);
    }

    async function runTerminalCommand(command) {
        if (!term) return;
        function sanitizeForTerminal(text) { return String(text); }
        term.writeln(`${ansiColorSecondary}${sanitizeForTerminal(command)}${ANSI_RESET}`);
        try {
            const response = await fetch('/api/run-command', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: command })
            });
            const data = await response.json();
            const outputToStore = data.output || (data.error ? `Error: ${data.error}` : "No output.");
            if (data.output) term.writeln(sanitizeForTerminal(data.output));
            if (data.error && !response.ok) term.writeln(`\r\n${ansiColorError}Server Error:${ANSI_RESET} ${sanitizeForTerminal(data.error)} (Code: ${data.return_code !== undefined ? data.return_code : 'N/A'})`);
            else if (data.error) term.writeln(`\r\n${ansiColorWarning}App Error:${ANSI_RESET} ${sanitizeForTerminal(data.error)} (Code: ${data.return_code !== undefined ? data.return_code : 'N/A'})`);
            else if (data.return_code !== 0 && data.return_code !== undefined) term.writeln(`\r\n${ansiColorWarning}Command exited with code: ${data.return_code}`);
            lastTerminalCommand = command; lastTerminalOutput = outputToStore; terminalOutputSentToAI = false;
        } catch (errorCaughtByRunCmd) {
            term.writeln(`\r\n${ansiColorError}Client/Network error:${ANSI_RESET} ${sanitizeForTerminal(errorCaughtByRunCmd.message)}`);
            lastTerminalCommand = command; lastTerminalOutput = `Client/Network error: ${errorCaughtByRunCmd.message}`; terminalOutputSentToAI = false;
        }
        const projectPrompt = `\r\n${ansiColorLink}~/project${ANSI_RESET}\r\n${ansiColorError}❯ ${ANSI_RESET}`;
        term.write(projectPrompt);
    }
    // Make runTerminalCommand globally accessible for buttons in AI messages
    window.BoltDevUI.runTerminalCommand = runTerminalCommand;


    // MODIFIED: appendMessageToChat now accepts HTML for AI messages
    function appendMessageToChat(textOrNode, className) {
        if (!chatArea) { console.error("script.js: appendMessageToChat - chatArea not found."); return null; }
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', ...className.split(' '));
        const needsTimestamp = !className.includes('thinking');

        if (className.includes('ai-message') && !className.includes('thinking') && !className.includes('error') && !className.includes('info') && typeof textOrNode === 'string') {
            // For AI messages receiving pre-rendered HTML
            messageDiv.innerHTML = textOrNode; // Insert the pre-rendered HTML directly
            if (needsTimestamp) {
                const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const timestampSpan = document.createElement('span');
                timestampSpan.classList.add('message-timestamp');
                timestampSpan.textContent = timestamp;
                messageDiv.appendChild(timestampSpan); // Append timestamp after HTML content
            }
            chatArea.appendChild(messageDiv);
            chatArea.scrollTop = chatArea.scrollHeight;

            // Highlight code blocks *after* they have been added to the DOM
            if (typeof Prism !== 'undefined') {
                 // Use a slight delay to ensure elements are fully rendered before highlighting
                 setTimeout(() => {
                     Prism.highlightAllUnder(messageDiv);
                     chatArea.scrollTop = chatArea.scrollHeight; // Scroll again after highlighting might change height
                 }, 50); // Small delay
            } else {
                 chatArea.scrollTop = chatArea.scrollHeight;
            }

        } else {
            // For user messages, info/error/thinking AI messages, or pre-rendered nodes
            if (typeof textOrNode === 'string') {
                // Simple text or basic markdown for non-AI-response types
                // Note: This path is mostly for system messages, user input, etc.
                // Full AI responses should come as HTML via the first branch.
                const linkedText = textOrNode.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color: var(--text-link); text-decoration: underline;">$1</a>');
                messageDiv.innerHTML = linkedText;
            } else if (textOrNode instanceof Node) {
                messageDiv.appendChild(textOrNode);
            }
            if (needsTimestamp) {
                const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const timestampSpan = document.createElement('span');
                timestampSpan.classList.add('message-timestamp');
                timestampSpan.textContent = timestamp;
                messageDiv.appendChild(timestampSpan);
            }
            chatArea.appendChild(messageDiv);
            chatArea.scrollTop = chatArea.scrollHeight;
        }
        return messageDiv;
    }

    // REMOVED: finalizeAiMessageContent function is no longer needed

    // Helper functions for code block footer buttons (These remain as they attach JS listeners)
    function copyCodeToClipboard(button) {
        const container = button.closest('.ai-code-block-container');
        if (!container) return;
        const codeElement = container.querySelector('pre code');
        if (!codeElement) return;
        const codeText = codeElement.textContent;

        navigator.clipboard.writeText(codeText).then(() => {
            console.log("Code copied to clipboard!");
            if (window.showToast) window.showToast("Code copied to clipboard!", "success");
        }).catch(err => {
            console.error("Failed to copy code: ", err);
            if (window.showToast) window.showToast("Failed to copy code.", "error");
        });
    }

    function downloadCode(button) {
        const container = button.closest('.ai-code-block-container');
        if (!container) return;
        const codeElement = container.querySelector('pre code');
        if (!codeElement) return;
        const codeText = codeElement.textContent;

        // Language is now in the footer-right span, not code class directly
        const footer = container.querySelector('.ai-code-block-footer');
        const langSpan = footer ? footer.querySelector('.footer-right') : null;
        const language = langSpan ? langSpan.textContent.toLowerCase() : 'txt';

        const filename = `code_snippet.${language}`;

        const blob = new Blob([codeText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(`Code downloaded as ${filename}`);
        if (window.showToast) window.showToast(`Code downloaded as ${filename}`, "success");
    }

    // Function to attach listeners to code block buttons *after* HTML is inserted
    function attachCodeBlockButtonListeners(messageElement) {
        if (!messageElement) return;
        messageElement.querySelectorAll('.ai-code-block-footer .footer-left button').forEach(button => {
            if (button.textContent === '📋') { // Copy button
                button.addEventListener('click', () => copyCodeToClipboard(button));
            } else if (button.textContent === '⬇️') { // Download button
                button.addEventListener('click', () => downloadCode(button));
            }
        });
    }

    // Function to attach listeners to terminal command buttons *after* HTML is inserted
    function attachTerminalCommandButtonListeners(messageElement) {
         if (!messageElement) return;
         messageElement.querySelectorAll('.ai-terminal-command-block button').forEach(button => {
             const commandPre = button.closest('.ai-terminal-command-block').querySelector('pre code');
             if (commandPre) {
                 const command = commandPre.textContent.trim();
                 button.addEventListener('click', () => {
                     window.BoltDevUI.runTerminalCommand(command);
                 });
             }
         });
    }

    // NEW: Function to attach listeners to file task buttons *after* HTML is inserted
    function attachFileTaskButtonListeners(messageElement) {
        if (!messageElement) return;
        messageElement.querySelectorAll('.ai-task-item .ai-file-task-button').forEach(button => {
            const filePath = button.dataset.filepath;
            if (filePath && window.BoltDevUI && typeof window.BoltDevUI.loadFileContent === 'function') {
                button.addEventListener('click', () => {
                    console.log(`File task button clicked for: ${filePath}`);
                    window.BoltDevUI.loadFileContent(filePath);
                    // Optionally switch to the code pane
                    const codeTabButton = document.querySelector('.main-top-bar .panel-tabs button[data-pane="codePane"]');
                    if (codeTabButton) codeTabButton.click();
                });
            } else {
                 console.warn(`File task button found without data-filepath or loadFileContent function missing for button:`, button);
            }
        });
    }


    window.BoltDevUI.getLanguageClass = function(filenameOrLang) {
        if (!filenameOrLang) return 'plaintext';
        const lang = filenameOrLang.includes('.') ? filenameOrLang.split('.').pop().toLowerCase() : filenameOrLang.toLowerCase();
        const langMap = {
            'js': 'javascript', 'jsx': 'javascript', 'ts': 'typescript', 'tsx': 'typescript',
            'py': 'python', 'html': 'markup', 'css': 'css', 'json': 'json', 'md': 'markdown',
            'sh': 'bash', 'yaml': 'yaml', 'yml': 'yaml', 'java': 'java', 'c': 'c', 'cpp': 'cpp',
            'cs': 'csharp', 'go': 'go', 'php': 'php', 'rb': 'ruby', 'swift': 'swift', 'kt': 'kotlin',
            'ps1': 'powershell', 'dockerfile': 'docker', 'sql': 'sql', 'xml': 'xml',
            'txt': 'plaintext', 'log': 'plaintext'
        };
        return langMap[lang] || `language-${lang}` || 'plaintext';
    };

    async function fetchAndPopulateModels(uiApiKey) {
        if (!modelNameSelect) return;
        modelNameSelect.disabled = true;
        modelNameSelect.innerHTML = '<option value="">Fetching models...</option>';
        try {
            const response = await fetch('/api/list-models', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ apiKey: uiApiKey })
            });
            if (!response.ok) {
                const errData = await response.json().catch(() => null);
                let errorText;
                if (errData && errData.error) {
                    const lowerError = errData.error.toLowerCase();
                    if (lowerError === "api key is not valid.") {
                        errorText = errData.error;
                    } else if (lowerError.includes("api key is required")) {
                        modelNameSelect.innerHTML = '<option value="">API Key needed</option>';
                        window.showToast("API Key required.", 'warning');
                        return;
                    } else {
                        errorText = `Server error: ${errData.error}`;
                    }
                } else {
                    errorText = `HTTP error ${response.status} fetching models.`;
                }
                throw new Error(errorText);
            }
            const data = await response.json();
            if (data.models && data.models.length > 0) {
                modelNameSelect.innerHTML = '';
                const preferredModels = ["gemini-1.5-flash-latest", "gemini-1.0-pro", "gemini-pro"];
                let hasSetDefault = false; let suitableModelsFound = 0;
                data.models.forEach(model => {
                    const isLikelyChatModel = model.supported_generation_methods.includes("generateContent") &&
                                              !model.name.includes("vision") && !model.name.includes("embedding");
                    if (isLikelyChatModel) {
                        suitableModelsFound++;
                        const option = document.createElement('option');
                        option.value = model.name;
                        option.textContent = `${model.display_name} (${model.name.replace("models/","")})`;
                        if (preferredModels.includes(model.name.replace("models/", "")) && !hasSetDefault) {
                            option.selected = true; hasSetDefault = true;
                        }
                        modelNameSelect.appendChild(option);
                    }
                });
                if (suitableModelsFound === 0) {
                    modelNameSelect.innerHTML = '<option value="">No suitable chat models found.</option>';
                    window.showToast("No suitable chat models found.", 'warning');
                } else {
                    window.showToast("Models loaded successfully.", "success");
                }
                modelNameSelect.disabled = false;
            } else if (data.error) {
                modelNameSelect.innerHTML = `<option value="">Error: ${data.error}</option>`;
                window.showToast(`Error fetching models: ${data.error}`, 'error');
            } else {
                modelNameSelect.innerHTML = '<option value="">No models found.</option>';
                window.showToast("No models found for API key.", 'info');
            }
        } catch (errorCaughtByFetch) {
            if (!modelNameSelect.innerHTML.includes("API Key needed")) {
                 modelNameSelect.innerHTML = '<option value="">Failed to load models</option>';
            }
            window.showToast(errorCaughtByFetch.message || 'Client error fetching models', 'error');
        }
    }

    if (setApiKeyButton) {
        setApiKeyButton.addEventListener('click', () => {
            const apiKey = apiKeyInput ? apiKeyInput.value.trim() : "";
            window.showToast(apiKey ? "Using API Key from input." : "Using system-configured API key.", "info");
            fetchAndPopulateModels(apiKey);
        });
    }

    async function sendChatMessage() {
        if (!chatInput || !modelNameSelect || !modelNameInputFallback || !apiKeyInput) return;
        const uiApiKey = apiKeyInput.value.trim();
        let modelName = modelNameSelect.value || modelNameInputFallback.value.trim() || 'gemini-1.5-flash-latest';
        if (!modelNameSelect.value && modelNameSelect.options.length > 0 && modelNameSelect.options[0].value === "") {
            if (modelNameInputFallback.value.trim()) modelName = modelNameInputFallback.value.trim();
            else if (modelNameSelect.options[0].textContent.match(/Error:|needed|Failed|No models/i) ) {
                window.showToast("Model not available. Check API Key and model status.", 'warning'); return;
            } else modelName = modelNameSelect.options.length > 0 && modelNameSelect.options[0].value ? modelNameSelect.options[0].value : 'gemini-1.5-flash-latest';
        } else if (!modelNameSelect.value && modelNameInputFallback.value.trim()) modelName = modelNameInputFallback.value.trim();
        else if (!modelNameSelect.value && !modelNameInputFallback.value.trim()) {
            window.showToast("No model selected or specified.", 'error'); return;
        }

        const userMessage = chatInput.value.trim();
        if (!userMessage) return;
        let messageToSend = userMessage;
        if (!terminalOutputSentToAI && lastTerminalCommand !== null && lastTerminalOutput !== null) {
            const terminalContext = `[System Note: The following is output from the last terminal command: '${lastTerminalCommand}'. Use this information if relevant to the user's current query.]\n<TerminalOutput>\n${lastTerminalOutput}\n</TerminalOutput>\n\nUser's current query is below:\n`;
            messageToSend = terminalContext + userMessage;
            terminalOutputSentToAI = true;
        }
        appendMessageToChat(userMessage, 'user-message');
        chatInput.value = ''; chatInput.focus();
        const thinkingMsg = appendMessageToChat("AI is thinking...", 'ai-message thinking');

        try {
            const response = await fetch('/api/chat', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: messageToSend, apiKey: uiApiKey, model: modelName })
            });
            // Remove thinking message regardless of success/failure before appending new message
            if (thinkingMsg && thinkingMsg.parentNode === chatArea) chatArea.removeChild(thinkingMsg);

            if (!response.ok) {
                let errorText = `HTTP error ${response.status}`;
                const errData = await response.json().catch(() => null);
                if (errData && errData.error) {
                     if (errData.error.toLowerCase() === "api key is not valid.") {
                        errorText = errData.error;
                    } else {
                        errorText = `Server error: ${errData.error}`;
                    }
                }
                throw new Error(errorText);
            }
            const data = await response.json();
            // data.reply now contains the pre-rendered HTML
            const renderedHtml = data.reply || '';
            const frontendToolCalls = data.frontend_tool_calls || { terminal_user: [], code_editor: [] };

            // Append the pre-rendered HTML
            const aiMessageDiv = appendMessageToChat(renderedHtml, 'ai-message');

            // Attach listeners to buttons within the newly added message div
            if (aiMessageDiv) {
                 attachCodeBlockButtonListeners(aiMessageDiv);
                 // Terminal commands are now separate blocks added by frontend based on frontendToolCalls
                 // attachTerminalCommandButtonListeners(aiMessageDiv); // No longer needed here
                 attachFileTaskButtonListeners(aiMessageDiv); // Attach listeners for file task buttons
            }

            // --- Add UI elements for user-initiated tools (Terminal) ---
            if (frontendToolCalls.terminal_user.length > 0 && aiMessageDiv) {
                frontendToolCalls.terminal_user.forEach(command => {
                    const commandBlock = document.createElement('div');
                    commandBlock.classList.add('ai-terminal-command-block');
                    // Use innerHTML for pre/code to allow Prism to work later if needed, though terminal commands aren't typically highlighted
                    commandBlock.innerHTML = `<pre><code>${command}</code></pre><button class="button primary">Run Command</button>`;
                    // Append this block *after* the main message content but still within the messageDiv
                    aiMessageDiv.appendChild(commandBlock);
                });
                 // Attach listeners to these newly added terminal buttons
                 attachTerminalCommandButtonListeners(aiMessageDiv);
            }
            // --- End Add UI elements ---


            if (data.files_modified && Array.isArray(data.files_modified)) {
                data.files_modified.forEach(filePath => window.showToast(`File system updated: ${filePath}`, 'success'));
                if (window.BoltDevUI && typeof window.BoltDevUI.refreshFileExplorer === 'function') {
                    window.BoltDevUI.refreshFileExplorer(data.files_modified);
                }
            }

            // --- Trigger display for the last \code_editor block found ---
            if (frontendToolCalls.code_editor.length > 0 && window.BoltDevUI && window.BoltDevUI.typeOutInCodePane) {
                 // Only type out the last one if multiple are provided
                 const lastBlock = frontendToolCalls.code_editor[frontendToolCalls.code_editor.length - 1];
                 console.log(`Triggering type out for: ${lastBlock.path}`);
                 // Use a slight delay to ensure the message bubble is fully rendered
                 setTimeout(() => {
                     window.BoltDevUI.typeOutInCodePane(lastBlock.path, lastBlock.content);
                 }, 100); // Adjust delay as needed
            }
            // --- End Trigger ---


        } catch (errorCaughtBySendChat) {
            if (thinkingMsg && thinkingMsg.parentNode === chatArea) chatArea.removeChild(thinkingMsg);
            appendMessageToChat(`Error: ${errorCaughtBySendChat.message}`, 'ai-message error');
            window.showToast(errorCaughtBySendChat.message, 'error');
        }
    }

    if (sendChatButton) sendChatButton.addEventListener('click', sendChatMessage);
    if (chatInput) chatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } });

    window.BoltDevUI.makeResizable = function(resizerEl, leftPanelEl, rightPanelEl, onResizeCallback) {
        let isResizing = false; let startX, startLeftWidth;
        if (!resizerEl || !leftPanelEl || !rightPanelEl) return;
        resizerEl.addEventListener('mousedown', (e) => {
            if (getComputedStyle(resizerEl).display === 'none') return;
            e.preventDefault(); isResizing = true; startX = e.clientX; startLeftWidth = leftPanelEl.offsetWidth;
            resizerEl.classList.add('resizing'); document.body.style.cursor = 'col-resize'; document.body.style.userSelect = 'none';
            document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', handleMouseUp);
        });
        function handleMouseMove(e) {
            if (!isResizing) return; let newLeftWidth = startLeftWidth + (e.clientX - startX);
            const minLeftWidth = parseInt(getComputedStyle(leftPanelEl).minWidth) || 50;
            const containerWidth = leftPanelEl.parentElement.offsetWidth; const resizerWidth = resizerEl.offsetWidth;
            let minRightWidthEstimate = (rightPanelEl.id === "mainContentWrapper" || rightPanelEl.id === "codeEditorAreaWrapper") ? 200 : 100;
            if (newLeftWidth < minLeftWidth) newLeftWidth = minLeftWidth;
            else if (containerWidth - newLeftWidth - resizerWidth < minRightWidthEstimate) newLeftWidth = containerWidth - minRightWidthEstimate - resizerWidth;
            const maxLeftCss = getComputedStyle(leftPanelEl).maxWidth;
            if (maxLeftCss && maxLeftCss !== 'none') {
                let maxAllowedLeftWidth = Infinity;
                if (maxLeftCss.endsWith('%')) maxAllowedLeftWidth = containerWidth * (parseFloat(maxLeftCss) / 100);
                else if (maxLeftCss.endsWith('px')) maxAllowedLeftWidth = parseFloat(maxLeftCss);
                if (newLeftWidth > maxAllowedLeftWidth) newLeftWidth = maxAllowedLeftWidth;
            }
            leftPanelEl.style.width = `${newLeftWidth}px`; leftPanelEl.style.flexBasis = `${newLeftWidth}px`;
            if (onResizeCallback) onResizeCallback();
        }
        function handleMouseUp() {
            if (!isResizing) return; isResizing = false;
            resizerEl.classList.remove('resizing'); document.body.style.cursor = 'default'; document.body.style.userSelect = 'auto';
            document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp);
        }
    };

    if (resizerAiMain && aiSidebar && mainContentWrapper) {
        window.BoltDevUI.makeResizable(resizerAiMain, aiSidebar, mainContentWrapper, () => {
            if (typeof window.BoltDevUI.fitTerminal === 'function') window.BoltDevUI.fitTerminal();
            if (codePane && codePane.classList.contains('active-pane') && window.BoltDevUI.handleCodePaneResize) {
                 window.BoltDevUI.handleCodePaneResize();
            }
        });
    }

    window.addEventListener('resize', () => {
        if (typeof window.BoltDevUI.fitTerminal === 'function') window.BoltDevUI.fitTerminal();
        if (codePane && codePane.classList.contains('active-pane') && window.BoltDevUI.handleCodePaneResize) {
             window.BoltDevUI.handleCodePaneResize();
        }
    });

    function applyTheme(themeName) {
        document.documentElement.className = ''; document.documentElement.classList.add(themeName);
        localStorage.setItem('selectedTheme', themeName);
        updateAnsiColors();
        if (term && term.element) {
            const newThemeOptions = getXtermThemeObjectFromCss();
            if (term.options && term.options.theme) Object.assign(term.options.theme, newThemeOptions);
            else term.options.theme = newThemeOptions;
            term.refresh(0, term.rows - 1);
            let isTerminalEffectivelyEmpty = true;
            if (term.buffer && term.buffer.active) {
                const buffer = term.buffer.active; let significantLines = 0;
                for (let i = 0; i < buffer.length; i++) if (buffer.getLine(i) && buffer.getLine(i).translateToString(true).trim() !== '') significantLines++;
                isTerminalEffectivelyEmpty = significantLines < 3;
            }
            if (isTerminalEffectivelyEmpty && typeof writeInitialTerminalMessages === 'function') { term.clear(); writeInitialTerminalMessages(); }
        }
    }

    const mainTopBarTabsContainer = document.querySelector('.main-top-bar .main-tabs.panel-tabs');
    let mainTopBarButtons = [];
    let currentPaneId = 'codePane';

    if (mainTopBarTabsContainer && contentPanes.length > 0) {
        mainTopBarButtons = Array.from(mainTopBarTabsContainer.querySelectorAll('button'));
        mainTopBarButtons.forEach((button) => {
            button.addEventListener('click', () => {
                const targetPaneId = button.dataset.pane;
                if (targetPaneId === currentPaneId) return;
                const previousPane = document.getElementById(currentPaneId);
                const targetPane = document.getElementById(targetPaneId);
                if (!targetPane) return;

                const previousPaneIndex = contentPanes.findIndex(p => p && p.id === currentPaneId);
                const targetPaneIndex = contentPanes.findIndex(p => p && p.id === targetPaneId);

                mainTopBarButtons.forEach(btn => btn.classList.remove('active-tab'));
                button.classList.add('active-tab');

                if (previousPane) {
                    if (window.BoltDevUI) {
                        if (previousPane.id === 'codePane' && window.BoltDevUI.deactivateCodePane) window.BoltDevUI.deactivateCodePane();
                        else if (previousPane.id === 'diffPane' && window.BoltDevUI.deactivateDiffPane) window.BoltDevUI.deactivateDiffPane();
                        else if (previousPane.id === 'previewPane' && window.BoltDevUI.deactivatePreviewPane) window.BoltDevUI.deactivatePreviewPane();
                    }
                    previousPane.classList.remove('active-pane');
                    previousPane.classList.add(targetPaneIndex > previousPaneIndex ? 'slide-to-left' : 'slide-to-right');
                }

                targetPane.classList.remove('active-pane', 'slide-to-left', 'slide-to-right', 'slide-from-left-init', 'slide-from-right-init');
                targetPane.classList.add(targetPaneIndex > previousPaneIndex ? 'slide-from-right-init' : 'slide-from-left-init');
                void targetPane.offsetWidth; // Force reflow
                targetPane.classList.add('active-pane');
                currentPaneId = targetPaneId;

                setTimeout(() => {
                    if (previousPane) previousPane.classList.remove('slide-to-left', 'slide-to-right');
                    if (window.BoltDevUI) {
                         if (targetPane.id === 'codePane' && window.BoltDevUI.activateCodePane) window.BoltDevUI.activateCodePane();
                         else if (targetPane.id === 'diffPane' && window.BoltDevUI.activateDiffPane) window.BoltDevUI.activateDiffPane(currentlyOpenFilePath, currentlyOpenFileContent, currentlyOpenFileLangClass);
                         else if (targetPane.id === 'previewPane' && window.BoltDevUI.activatePreviewPane) window.BoltDevUI.activatePreviewPane();
                    }
                    if (typeof window.BoltDevUI.fitTerminal === 'function') window.BoltDevUI.fitTerminal();
                    if (codePane && codePane.classList.contains('active-pane') && window.BoltDevUI.handleCodePaneResize) window.BoltDevUI.handleCodePaneResize();
                }, 350); // Match CSS transition duration
            });
        });
    }

    const terminalTabsContainer = document.querySelector('.terminal-tabs-bar .panel-tabs');
    if (terminalTabsContainer) {
        const terminalHeaderButtons = Array.from(terminalTabsContainer.querySelectorAll('button'));
        terminalHeaderButtons.forEach(button => {
            button.addEventListener('click', (e) => {
                if (e.target.classList.contains('icon-button')) return;
                terminalHeaderButtons.forEach(btn => btn.classList.remove('active-tab'));
                button.classList.add('active-tab');
            });
        });
    }

    updateAnsiColors();
    if (themeSelect) {
        themeSelect.addEventListener('change', (e) => applyTheme(e.target.value));
        const savedTheme = localStorage.getItem('selectedTheme') || 'theme-dark';
        themeSelect.value = savedTheme; applyTheme(savedTheme);
    } else { applyTheme('theme-dark'); }

    fetchAndPopulateModels("");

    if (mainTopBarButtons.length > 0 && contentPanes.length > 0) {
        const initialActiveButton = mainTopBarButtons.find(btn => btn.dataset.pane === currentPaneId);
        const initialActivePane = document.getElementById(currentPaneId);
        if (initialActiveButton) initialActiveButton.classList.add('active-tab');
        if (initialActivePane) {
            initialActivePane.classList.remove('slide-from-left-init', 'slide-from-right-init', 'slide-to-left', 'slide-to-right');
            initialActivePane.classList.add('active-pane');
            if (window.BoltDevUI) {
                 if (initialActivePane.id === 'codePane' && window.BoltDevUI.activateCodePane) window.BoltDevUI.activateCodePane();
                 else if (initialActivePane.id === 'diffPane' && window.BoltDevUI.activateDiffPane) window.BoltDevUI.activateDiffPane(null, null, 'plaintext');
                 else if (initialActivePane.id === 'previewPane' && window.BoltDevUI.activatePreviewPane) window.BoltDevUI.activatePreviewPane();
            }
        }
        contentPanes.forEach(pane => {
            if (pane && pane.id !== currentPaneId) {
                pane.classList.remove('active-pane', 'slide-from-left-init', 'slide-from-right-init', 'slide-to-left', 'slide-to-right');
                if (window.BoltDevUI) {
                    if (pane.id === 'codePane' && window.BoltDevUI.deactivateCodePane) window.BoltDevUI.deactivateCodePane();
                    else if (pane.id === 'diffPane' && window.BoltDevUI.deactivateDiffPane) window.BoltDevUI.deactivateDiffPane();
                    else if (pane.id === 'previewPane' && window.BoltDevUI.deactivatePreviewPane) window.BoltDevUI.deactivatePreviewPane();
                }
            }
        });
    }

    if (terminalTabsContainer) {
        const firstTerminalTab = terminalTabsContainer.querySelector('button:not(.icon-button)');
        if (firstTerminalTab) firstTerminalTab.classList.add('active-tab');
    }

    const fileChangesButton = document.getElementById('fileChangesButton');
    if(fileChangesButton) {
        fileChangesButton.addEventListener('click', () => {
            const diffTabButton = document.querySelector('.main-top-bar .panel-tabs button[data-pane="diffPane"]');
            if (diffTabButton) diffTabButton.click();
        });
    }

    if (toggleMainTerminalBtn && terminalPane) {
        toggleMainTerminalBtn.addEventListener('click', () => {
            const isHidden = terminalPane.style.display === 'none' || terminalPane.offsetHeight === 0;
            terminalPane.style.display = isHidden ? 'flex' : 'none';
            setTimeout(() => {
                if (typeof window.BoltDevUI.fitTerminal === 'function') window.BoltDevUI.fitTerminal();
                if (codePane && codePane.classList.contains('active-pane') && window.BoltDevUI.handleCodePaneResize) {
                    window.BoltDevUI.handleCodePaneResize();
                }
            }, 30);
        });
    }
});
// --- END OF FILE script.js ---