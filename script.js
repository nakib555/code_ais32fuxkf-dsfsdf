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
    const terminalPane = document.getElementById('terminalPane');
    const toggleMainTerminalBtn = document.getElementById('toggleMainTerminalBtn');
    const terminalTabsContainer = document.getElementById('terminalTabsContainer');
    const terminalInstancesContainer = document.getElementById('terminalInstancesContainer');
    const newTerminalBtn = document.querySelector('.new-terminal-btn');

    let terminalInstances = {}; // Store TerminalEnhancer instances { id: instance }
    let activeTerminalId = null;
    let nextTerminalId = 1;


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

    window.BoltDevUI.runTerminalCommand = async function(command) {
        if (activeTerminalId && terminalInstances[activeTerminalId]) {
            const activeTerminal = terminalInstances[activeTerminalId];
            activeTerminal.appendOutput(`${activeTerminal.getPromptTextContent()}${command}\n`, 'ps-command');

            try {
                const response = await fetch('/api/run-command', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: command })
                });
                const result = await response.json();
                let outputText = result.output || "";
                let errorText = result.error || "";

                if (outputText) activeTerminal.appendOutput(outputText + (outputText.endsWith('\n') ? '' : '\n'), result.return_code === 0 ? 'ps-success' : 'ps-output');
                if (errorText && errorText !== outputText) activeTerminal.appendOutput(errorText + (errorText.endsWith('\n') ? '' : '\n'), 'ps-error');
                if (!outputText && !errorText && result.return_code !== 0) activeTerminal.appendOutput(`Command exited with code ${result.return_code}\n`, 'ps-error');
                
                lastTerminalCommand = command;
                lastTerminalOutput = outputText + (errorText ? `\nSTDERR: ${errorText}` : "");
                terminalOutputSentToAI = false;

            } catch (error) {
                activeTerminal.appendOutput(`Client Error running command from AI: ${error.message}\n`, 'ps-error');
            }
            activeTerminal.updatePromptDisplay();
        } else {
            console.error("No active terminal to run command from AI.");
            window.showToast("No active terminal.", "error");
        }
    };


    function appendMessageToChat(textOrNode, className) {
        if (!chatArea) { console.error("script.js: appendMessageToChat - chatArea not found."); return null; }
        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', ...className.split(' '));
        const needsTimestamp = !className.includes('thinking');

        if (className.includes('ai-message') && !className.includes('thinking') && !className.includes('error') && !className.includes('info') && typeof textOrNode === 'string') {
            messageDiv.innerHTML = textOrNode;
            if (needsTimestamp) {
                const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const timestampSpan = document.createElement('span');
                timestampSpan.classList.add('message-timestamp');
                timestampSpan.textContent = timestamp;
                messageDiv.appendChild(timestampSpan);
            }
            chatArea.appendChild(messageDiv);
            chatArea.scrollTop = chatArea.scrollHeight;

            if (typeof Prism !== 'undefined') {
                 setTimeout(() => {
                     Prism.highlightAllUnder(messageDiv);
                     chatArea.scrollTop = chatArea.scrollHeight;
                 }, 50);
            } else {
                 chatArea.scrollTop = chatArea.scrollHeight;
            }

        } else {
            if (typeof textOrNode === 'string') {
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

    function copyCodeToClipboard(button) {
        const container = button.closest('.ai-code-block-container');
        if (!container) return;
        const codeElement = container.querySelector('pre code');
        if (!codeElement) return;
        const codeText = codeElement.textContent;

        navigator.clipboard.writeText(codeText).then(() => {
            if (window.showToast) window.showToast("Code copied to clipboard!", "success");
        }).catch(err => {
            if (window.showToast) window.showToast("Failed to copy code.", "error");
        });
    }

    function downloadCode(button) {
        const container = button.closest('.ai-code-block-container');
        if (!container) return;
        const codeElement = container.querySelector('pre code');
        if (!codeElement) return;
        const codeText = codeElement.textContent;
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
        if (window.showToast) window.showToast(`Code downloaded as ${filename}`, "success");
    }

    function attachCodeBlockButtonListeners(messageElement) {
        if (!messageElement) return;
        messageElement.querySelectorAll('.ai-code-block-footer .footer-left button').forEach(button => {
            if (button.textContent === '📋') {
                button.addEventListener('click', () => copyCodeToClipboard(button));
            } else if (button.textContent === '⬇️') {
                button.addEventListener('click', () => downloadCode(button));
            }
        });
    }

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

    function attachFileTaskButtonListeners(messageElement) {
        if (!messageElement) return;
        messageElement.querySelectorAll('.ai-task-item .ai-file-task-button').forEach(button => {
            const filePath = button.dataset.filepath;
            if (filePath && window.BoltDevUI && typeof window.BoltDevUI.loadFileContent === 'function') {
                button.addEventListener('click', () => {
                    window.BoltDevUI.loadFileContent(filePath);
                    const codeTabButton = document.querySelector('.main-top-bar .panel-tabs button[data-pane="codePane"]');
                    if (codeTabButton) codeTabButton.click();
                });
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
            if (modelNameSelect && !modelNameSelect.innerHTML.includes("API Key needed")) {
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
            const renderedHtml = data.reply || '';
            const frontendToolCalls = data.frontend_tool_calls || { terminal_user: [], code_editor: [] };
            const aiMessageDiv = appendMessageToChat(renderedHtml, 'ai-message');

            if (aiMessageDiv) {
                 attachCodeBlockButtonListeners(aiMessageDiv);
                 attachFileTaskButtonListeners(aiMessageDiv);
            }

            if (frontendToolCalls.terminal_user.length > 0 && aiMessageDiv) {
                frontendToolCalls.terminal_user.forEach(command => {
                    const commandBlock = document.createElement('div');
                    commandBlock.classList.add('ai-terminal-command-block');
                    commandBlock.innerHTML = `<pre><code>${command}</code></pre><button class="button primary">Run Command</button>`;
                    aiMessageDiv.appendChild(commandBlock);
                });
                 attachTerminalCommandButtonListeners(aiMessageDiv);
            }

            if (data.files_modified && Array.isArray(data.files_modified)) {
                data.files_modified.forEach(filePath => window.showToast(`File system updated: ${filePath}`, 'success'));
                if (window.BoltDevUI && typeof window.BoltDevUI.refreshFileExplorer === 'function') {
                    window.BoltDevUI.refreshFileExplorer(data.files_modified);
                }
            }

            if (frontendToolCalls.code_editor.length > 0 && window.BoltDevUI && window.BoltDevUI.typeOutInCodePane) {
                 const lastBlock = frontendToolCalls.code_editor[frontendToolCalls.code_editor.length - 1];
                 setTimeout(() => {
                     window.BoltDevUI.typeOutInCodePane(lastBlock.path, lastBlock.content);
                 }, 100);
            }

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

    // Main Layout Elements
    const aiSidebar = document.getElementById('aiSidebar');
    const mainContentWrapper = document.getElementById('mainContentWrapper');
    const resizerAiMain = document.getElementById('resizerAiMain');
    const codePane = document.getElementById('codePane');
    const diffPane = document.getElementById('diffPane');
    const previewPane = document.getElementById('previewPane');
    const contentPanes = [codePane, diffPane, previewPane].filter(p => p);
    
    if (resizerAiMain && aiSidebar && mainContentWrapper) {
        window.BoltDevUI.makeResizable(resizerAiMain, aiSidebar, mainContentWrapper, () => {
            if (codePane && codePane.classList.contains('active-pane') && window.BoltDevUI.handleCodePaneResize) {
                 window.BoltDevUI.handleCodePaneResize();
            }
            if (terminalPane && terminalPane.style.display !== 'none' && activeTerminalId && terminalInstances[activeTerminalId]) {
                terminalInstances[activeTerminalId].adjustSuggestionBoxPosition();
            }
        });
    }

    window.addEventListener('resize', () => {
        if (codePane && codePane.classList.contains('active-pane') && window.BoltDevUI.handleCodePaneResize) {
             window.BoltDevUI.handleCodePaneResize();
        }
        if (terminalPane && terminalPane.style.display !== 'none') {
            Object.values(terminalInstances).forEach(termInstance => {
                if (termInstance.isActive) {
                    termInstance.adjustSuggestionBoxPosition();
                }
            });
        }
    });

    function applyTheme(themeName) {
        document.documentElement.className = ''; document.documentElement.classList.add(themeName);
        localStorage.setItem('selectedTheme', themeName);
        updateAnsiColors();
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
                void targetPane.offsetWidth;
                targetPane.classList.add('active-pane');
                currentPaneId = targetPaneId;

                setTimeout(() => {
                    if (previousPane) previousPane.classList.remove('slide-to-left', 'slide-to-right');
                    if (window.BoltDevUI) {
                         if (targetPane.id === 'codePane' && window.BoltDevUI.activateCodePane) window.BoltDevUI.activateCodePane();
                         else if (targetPane.id === 'diffPane' && window.BoltDevUI.activateDiffPane) window.BoltDevUI.activateDiffPane(currentlyOpenFilePath, currentlyOpenFileContent, currentlyOpenFileLangClass);
                         else if (targetPane.id === 'previewPane' && window.BoltDevUI.activatePreviewPane) window.BoltDevUI.activatePreviewPane();
                    }
                    if (codePane && codePane.classList.contains('active-pane') && window.BoltDevUI.handleCodePaneResize) window.BoltDevUI.handleCodePaneResize();
                }, 350);
            });
        });
    }

    // --- Terminal Management ---
    function createNewTerminalInstanceHTML(id) {
        const initialPath = `~/project_files`;
        const instanceHTML = `
            <div class="terminal-instance" data-terminal-id="${id}">
                <div class="terminal-toolbar">
                    <div class="terminal-path" data-terminal-id="${id}" title="${initialPath}">${initialPath}</div>
                    <div class="terminal-controls">
                        <button class="icon-button control-btn" title="Split Terminal (Not Implemented)">⫲</button>
                        <button class="icon-button control-btn" title="Kill Terminal">✕</button>
                    </div>
                </div>
                <div class="terminal-container" data-terminal-id="${id}">
                    <div class="terminal-command-history" data-terminal-id="${id}"></div>
                    <div class="terminal-content" data-terminal-id="${id}" aria-live="polite"></div>
                    <div class="terminal-input-line" data-terminal-id="${id}">
                        <span class="terminal-prompt" data-terminal-id="${id}"></span>
                        <input type="text" class="terminal-input"
                               placeholder="Type your command..."
                               aria-label="Terminal command input for terminal ${id}"
                               spellcheck="false"
                               autocomplete="off"
                               data-terminal-id="${id}">
                    </div>
                </div>
            </div>
        `;
        const tabHTML = `
            <div class="terminal-tab" data-terminal-id="${id}">
                <span class="tab-icon">⚡</span>
                <span class="tab-text">PowerShell ${id}</span>
                <button class="tab-close" aria-label="Close terminal ${id}" data-terminal-id="${id}">×</button>
            </div>
        `;
        return { instanceHTML, tabHTML };
    }

    function addTerminalEventListeners(tabElement, instanceElement) {
        tabElement.addEventListener('click', (e) => {
            if (e.target.classList.contains('tab-close')) return;
            const termId = tabElement.dataset.terminalId;
            setActiveTerminal(termId);
        });

        const closeButton = tabElement.querySelector('.tab-close');
        if (closeButton) {
            closeButton.addEventListener('click', (e) => {
                e.stopPropagation();
                const termId = closeButton.dataset.terminalId;
                closeTerminal(termId);
            });
        }
        const killButton = instanceElement.querySelector('.terminal-controls .icon-button[title="Kill Terminal"]');
        if (killButton) {
            killButton.addEventListener('click', () => {
                 const termId = instanceElement.dataset.terminalId;
                 closeTerminal(termId);
            });
        }
    }

    function setActiveTerminal(id) {
        if (activeTerminalId === id && terminalInstances[id] && terminalInstances[id].isActive) {
            if (terminalPane.style.display !== 'none' && terminalInstances[id]) {
                terminalInstances[id].focus();
            }
            return;
        }

        if (activeTerminalId && terminalInstances[activeTerminalId]) {
            terminalInstances[activeTerminalId].deactivate();
            const oldTab = terminalTabsContainer.querySelector(`.terminal-tab[data-terminal-id="${activeTerminalId}"]`);
            if (oldTab) oldTab.classList.remove('active');
        }

        activeTerminalId = id;
        if (terminalInstances[id]) {
            terminalInstances[id].activate();
            const newTab = terminalTabsContainer.querySelector(`.terminal-tab[data-terminal-id="${id}"]`);
            if (newTab) newTab.classList.add('active');
        } else {
            console.warn(`No terminal instance found for ID: ${id} during setActiveTerminal`);
        }
    }

    function createAndActivateNewTerminal() {
        const currentId = nextTerminalId.toString();
        nextTerminalId++;

        const { instanceHTML, tabHTML } = createNewTerminalInstanceHTML(currentId);

        terminalInstancesContainer.insertAdjacentHTML('beforeend', instanceHTML);
        terminalTabsContainer.insertAdjacentHTML('beforeend', tabHTML);

        const newTabElement = terminalTabsContainer.querySelector(`.terminal-tab[data-terminal-id="${currentId}"]`);
        const newInstanceElement = terminalInstancesContainer.querySelector(`.terminal-instance[data-terminal-id="${currentId}"]`);

        if (!newTabElement || !newInstanceElement) {
            console.error("Failed to create new terminal elements in DOM.");
            return;
        }
        
        terminalInstances[currentId] = new TerminalEnhancer(currentId);
        if (!terminalInstances[currentId].terminalInput) {
            console.error(`TerminalEnhancer for ID ${currentId} failed to initialize properly. Removing.`);
            newTabElement.remove();
            newInstanceElement.remove();
            delete terminalInstances[currentId];
            return;
        }

        addTerminalEventListeners(newTabElement, newInstanceElement);
        setActiveTerminal(currentId);
        if (terminalPane.style.display === 'none' || getComputedStyle(terminalPane).display === 'none') {
            terminalPane.style.display = 'flex';
        }
    }

    function closeTerminal(id) {
        if (!terminalInstances[id]) return;

        terminalInstances[id].destroy();
        delete terminalInstances[id];

        const tabToRemove = terminalTabsContainer.querySelector(`.terminal-tab[data-terminal-id="${id}"]`);
        const instanceToRemove = terminalInstancesContainer.querySelector(`.terminal-instance[data-terminal-id="${id}"]`);
        if (tabToRemove) tabToRemove.remove();
        if (instanceToRemove) instanceToRemove.remove();

        localStorage.removeItem(`terminalHistory_${id}`);

        if (activeTerminalId === id) {
            activeTerminalId = null;
            const remainingTabs = terminalTabsContainer.querySelectorAll('.terminal-tab');
            if (remainingTabs.length > 0) {
                setActiveTerminal(remainingTabs[remainingTabs.length - 1].dataset.terminalId);
            } else if (terminalPane.style.display !== 'none') {
                terminalPane.style.display = 'none';
            }
        }
    }

    if (newTerminalBtn) {
        newTerminalBtn.addEventListener('click', createAndActivateNewTerminal);
    }

    if (terminalPane) {
        if (getComputedStyle(terminalPane).display !== 'none' && Object.keys(terminalInstances).length === 0) {
            createAndActivateNewTerminal();
        }
    }


    if (toggleMainTerminalBtn && terminalPane) {
        toggleMainTerminalBtn.addEventListener('click', () => {
            const isHidden = terminalPane.style.display === 'none' || getComputedStyle(terminalPane).display === 'none';
            terminalPane.style.display = isHidden ? 'flex' : 'none';
            if (isHidden) {
                if (Object.keys(terminalInstances).length === 0) {
                    createAndActivateNewTerminal();
                } else if (activeTerminalId && terminalInstances[activeTerminalId]) {
                    setTimeout(() => {
                         terminalInstances[activeTerminalId].activate();
                    }, 50);
                } else if (Object.keys(terminalInstances).length > 0) {
                    const firstAvailableId = Object.keys(terminalInstances)[0];
                    setActiveTerminal(firstAvailableId);
                }
            }
            if (!isHidden && activeTerminalId && terminalInstances[activeTerminalId]) {
                 setTimeout(() => terminalInstances[activeTerminalId].adjustSuggestionBoxPosition(), 50);
            }

            if (codePane && codePane.classList.contains('active-pane') && window.BoltDevUI.handleCodePaneResize) {
                window.BoltDevUI.handleCodePaneResize();
            }
        });
    }
    // --- End Terminal Management ---


    updateAnsiColors();
    if (themeSelect) {
        themeSelect.addEventListener('change', (e) => applyTheme(e.target.value));
        const savedTheme = localStorage.getItem('selectedTheme') || 'theme-dark';
        themeSelect.value = savedTheme; applyTheme(savedTheme);
    } else { applyTheme('theme-dark'); }

    fetchAndPopulateModels("");

    if (mainTopBarTabsContainer && contentPanes.length > 0) {
        const mainTopBarButtons = Array.from(mainTopBarTabsContainer.querySelectorAll('button'));
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


    const fileChangesButton = document.getElementById('fileChangesButton');
    if(fileChangesButton) {
        fileChangesButton.addEventListener('click', () => {
            const diffTabButton = document.querySelector('.main-top-bar .panel-tabs button[data-pane="diffPane"]');
            if (diffTabButton) diffTabButton.click();
        });
    }

});
// --- END OF FILE script.js ---