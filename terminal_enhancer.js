class TerminalEnhancer {
    constructor(terminalId) {
        this.terminalId = terminalId;
        this.instanceElement = document.querySelector(`.terminal-instance[data-terminal-id="${this.terminalId}"]`);
        if (!this.instanceElement) {
            console.error(`TerminalEnhancer: Instance element for terminal ${this.terminalId} not found.`);
            return;
        }

        this.terminalInput = this.instanceElement.querySelector(`.terminal-input`);
        this.outputArea = this.instanceElement.querySelector(`.terminal-content`);
        this.promptElement = this.instanceElement.querySelector(`.terminal-prompt`);
        this.suggestionsContainer = this.instanceElement.querySelector(`.terminal-command-history`);
        this.toolbarPathElement = this.instanceElement.querySelector(`.terminal-toolbar .terminal-path`);
        this.inputLineElement = this.instanceElement.querySelector('.terminal-input-line');

        if (!this.terminalInput || !this.outputArea || !this.promptElement || !this.suggestionsContainer || !this.toolbarPathElement || !this.inputLineElement) {
            console.error(`TerminalEnhancer: Critical sub-elements for terminal ${this.terminalId} not found. Check selectors.`, { /* ... */ });
            return;
        }

        this.commandHistory = [];
        this.historyIndex = -1;
        this.currentDirectory = `~/project_files`;
        this.maxHistorySize = 100;
        this.currentCommandDraft = '';
        this.isActive = false;
        this.suggestionTimeout = null;

        this.boundHandleKeyPress = this.handleKeyPress.bind(this);
        this.boundHandleInput = this.handleInput.bind(this);

        this.ansiColorMap = { // Basic SGR codes
            0: 'reset', // Reset / Normal
            1: 'bold',
            4: 'underline',
            7: 'inverse', // Swap foreground and background
            30: 'fg-black', 31: 'fg-red', 32: 'fg-green', 33: 'fg-yellow',
            34: 'fg-blue', 35: 'fg-magenta', 36: 'fg-cyan', 37: 'fg-white',
            90: 'fg-bright-black', 91: 'fg-bright-red', 92: 'fg-bright-green', 93: 'fg-bright-yellow',
            94: 'fg-bright-blue', 95: 'fg-bright-magenta', 96: 'fg-bright-cyan', 97: 'fg-bright-white',
            40: 'bg-black', 41: 'bg-red', 42: 'bg-green', 43: 'bg-yellow',
            44: 'bg-blue', 45: 'bg-magenta', 46: 'bg-cyan', 47: 'bg-white',
            100: 'bg-bright-black', 101: 'bg-bright-red', 102: 'bg-bright-green', 103: 'bg-bright-yellow',
            104: 'bg-bright-blue', 105: 'bg-bright-magenta', 106: 'bg-bright-cyan', 107: 'bg-bright-white',
        };


        this.setupEventListeners();
        this.init();
    }

    // ... (init, showWelcomeMessage, setupEventListeners, handleInput, adjustSuggestionBoxPosition, handleKeyPress, updateSuggestions, showSuggestions, hideSuggestions, navigateHistory, clearScreen are the same as previous full response) ...
    init() {
        const savedHistory = localStorage.getItem(`terminalHistory_${this.terminalId}`);
        if (savedHistory) {
            try {
                this.commandHistory = JSON.parse(savedHistory);
                if (!Array.isArray(this.commandHistory)) this.commandHistory = [];
            } catch (e) {
                this.commandHistory = [];
                localStorage.removeItem(`terminalHistory_${this.terminalId}`);
            }
        }
        this.showWelcomeMessage();
        this.updatePromptDisplay();
        this.updateToolbarPath();
    }

    showWelcomeMessage() {
        const welcomeMsg = `PowerShell Enhanced UI (Terminal ${this.terminalId})\nWorking directory: ~/project_files\nType 'help' or 'cls' to clear.\n`;
        this.appendOutput(welcomeMsg, 'ps-info');
    }

    setupEventListeners() {
        this.terminalInput.addEventListener('keydown', this.boundHandleKeyPress);
        this.terminalInput.addEventListener('input', this.boundHandleInput);
        this.adjustSuggestionBoxPosition(); 
    }

    handleInput() {
        if (this.historyIndex !== -1) {
            this.currentCommandDraft = this.terminalInput.value;
            this.historyIndex = -1;
        }
        if (this.suggestionTimeout) clearTimeout(this.suggestionTimeout);
        this.suggestionTimeout = setTimeout(() => this.updateSuggestions(), 250); 
    }


    adjustSuggestionBoxPosition() {
        if (this.suggestionsContainer && this.inputLineElement) {
            const inputLineHeight = this.inputLineElement.offsetHeight;
            this.suggestionsContainer.style.bottom = `${inputLineHeight}px`;
        }
    }


    handleKeyPress(event) {
        const isSuggestionsVisible = this.suggestionsContainer.classList.contains('visible');

        if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
            if (this.historyIndex === -1 && this.terminalInput.value !== this.currentCommandDraft) { 
                this.currentCommandDraft = this.terminalInput.value;
            }
        }

        switch(event.key) {
            case 'Enter':
                event.preventDefault();
                this.executeCommand();
                break;
            case 'ArrowUp':
                event.preventDefault();
                this.navigateHistory('up');
                break;
            case 'ArrowDown':
                event.preventDefault();
                this.navigateHistory('down');
                break;
            case 'Tab':
                event.preventDefault();
                if (isSuggestionsVisible && this.suggestionsContainer.firstChild) {
                    const firstSuggestion = this.suggestionsContainer.firstChild.textContent;
                    this.terminalInput.value = firstSuggestion;
                    this.hideSuggestions();
                    setTimeout(() => this.terminalInput.selectionStart = this.terminalInput.selectionEnd = this.terminalInput.value.length, 0);
                }
                break;
            case 'Escape':
                if (isSuggestionsVisible) {
                    this.hideSuggestions();
                    event.preventDefault();
                }
                break;
            case 'c':
                if (event.ctrlKey) {
                    event.preventDefault();
                    this.handleCtrlC();
                }
                break;
            case 'l':
                if (event.ctrlKey) {
                    event.preventDefault();
                    this.clearScreen();
                }
                break;
        }
    }

    async updateSuggestions() {
        const input = this.terminalInput.value;
        if (!input.trim()) {
            this.hideSuggestions();
            return;
        }
        try {
            const response = await fetch(`/api/terminal/suggestions?partial=${encodeURIComponent(input)}&cwd=${encodeURIComponent(this.currentDirectory)}`);
            if (!response.ok) { this.hideSuggestions(); return; }
            const suggestions = await response.json();
            if (suggestions && suggestions.length > 0) {
                this.showSuggestions(suggestions);
            } else {
                this.hideSuggestions();
            }
        } catch (error) {
            console.error('Error fetching suggestions:', error);
            this.hideSuggestions();
        }
    }

    showSuggestions(suggestions) {
        this.suggestionsContainer.innerHTML = '';
        suggestions.slice(0, 7).forEach(suggestion => { 
            const item = document.createElement('div');
            item.className = 'terminal-history-item';
            item.textContent = suggestion;
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                this.terminalInput.value = suggestion;
                this.hideSuggestions();
                this.focus();
            });
            this.suggestionsContainer.appendChild(item);
        });
        this.suggestionsContainer.classList.add('visible');
        this.adjustSuggestionBoxPosition();
    }

    hideSuggestions() {
        this.suggestionsContainer.classList.remove('visible');
        this.suggestionsContainer.innerHTML = '';
    }

    navigateHistory(direction) {
        if (this.commandHistory.length === 0) return;
        if (direction === 'up') {
            if (this.historyIndex < this.commandHistory.length - 1) {
                this.historyIndex++;
                this.terminalInput.value = this.commandHistory[this.historyIndex];
            }
        } else {
            if (this.historyIndex > 0) {
                this.historyIndex--;
                this.terminalInput.value = this.commandHistory[this.historyIndex];
            } else if (this.historyIndex === 0 || this.historyIndex === -1) { 
                this.historyIndex = -1;
                this.terminalInput.value = this.currentCommandDraft;
            }
        }
        setTimeout(() => this.terminalInput.selectionStart = this.terminalInput.selectionEnd = this.terminalInput.value.length, 0);
    }

    clearScreen() {
        this.outputArea.innerHTML = '';
        this.updatePromptDisplay();
    }


    ansiToHtml(text) {
        const ansiRegex = /\x1b\[([0-9;]*?)m/g;
        let lastIndex = 0;
        const fragment = document.createDocumentFragment();
        let currentSpan = null;
        let activeClasses = new Set();

        const createSpan = () => {
            const span = document.createElement('span');
            activeClasses.forEach(cls => span.classList.add(cls));
            return span;
        };

        currentSpan = createSpan(); // Start with a default span

        let match;
        while ((match = ansiRegex.exec(text)) !== null) {
            const textBefore = text.substring(lastIndex, match.index);
            if (textBefore) {
                currentSpan.appendChild(document.createTextNode(textBefore));
            }

            const codes = match[1].split(';').map(Number);
            if (codes.length === 0 || (codes.length === 1 && codes[0] === 0)) { // Reset
                if (currentSpan.hasChildNodes() || currentSpan.classList.length > 0) {
                    fragment.appendChild(currentSpan);
                }
                activeClasses.clear();
                currentSpan = createSpan();
            } else {
                if (currentSpan.hasChildNodes()) { // Finalize current span before changing styles
                     fragment.appendChild(currentSpan);
                     currentSpan = createSpan(); // New span for new styles
                }
                codes.forEach(code => {
                    const styleClass = this.ansiColorMap[code];
                    if (styleClass) {
                        if (styleClass === 'reset') { // Should be handled by the main reset case
                            activeClasses.clear();
                        } else {
                            activeClasses.add(`ansi-${styleClass}`);
                        }
                    } else if (code === 38 && codes.length > 2 && codes[1] === 5) { // 256 color
                        // Simplified: just add a generic class, or ignore
                        activeClasses.add(`ansi-fg-256-${codes[2]}`); // Needs specific CSS
                    } else if (code === 48 && codes.length > 2 && codes[1] === 5) { // 256 background
                        activeClasses.add(`ansi-bg-256-${codes[2]}`); // Needs specific CSS
                    }
                    // RGB colors (38;2;r;g;b and 48;2;r;g;b) are more complex and omitted for brevity here
                });
                // Update currentSpan's classes if it's empty and we just changed styles
                if (!currentSpan.hasChildNodes()) {
                    currentSpan.className = ''; // Clear existing
                    activeClasses.forEach(cls => currentSpan.classList.add(cls));
                }
            }
            lastIndex = ansiRegex.lastIndex;
        }

        const textAfter = text.substring(lastIndex);
        if (textAfter) {
            currentSpan.appendChild(document.createTextNode(textAfter));
        }
        if (currentSpan.hasChildNodes() || currentSpan.classList.length > 0) {
            fragment.appendChild(currentSpan);
        }
        return fragment;
    }


    async executeCommand() {
        const command = this.terminalInput.value.trim();
        this.hideSuggestions();
        // Echo command using ansiToHtml for consistency if prompt itself had ANSI
        const promptAndCommandFragment = this.ansiToHtml(`${this.getPromptTextContent()}${command}\n`);
        this.appendOutput(promptAndCommandFragment, 'ps-command');


        if (command.toLowerCase() === 'cls' || command.toLowerCase() === 'clear') {
            this.clearScreen();
            this.terminalInput.value = '';
            this.historyIndex = -1;
            this.currentCommandDraft = '';
            return;
        }

        if (!command) {
            this.updatePromptDisplay();
            this.terminalInput.value = '';
            return;
        }

        if (this.commandHistory.length === 0 || command !== this.commandHistory[0]) {
            this.commandHistory.unshift(command);
            if (this.commandHistory.length > this.maxHistorySize) {
                this.commandHistory.pop();
            }
            localStorage.setItem(`terminalHistory_${this.terminalId}`, JSON.stringify(this.commandHistory));
        }
        this.historyIndex = -1;
        this.currentCommandDraft = '';
        this.terminalInput.value = '';

        if (command.toLowerCase().startsWith("cd ")) {
            const targetDir = command.substring(3).trim();
            let newPath = this.currentDirectory;
            if (targetDir === "" || targetDir === "~" || targetDir === "/") {
                newPath = `~/project_files`;
            } else if (targetDir === "..") {
                if (newPath === `~/project_files`) newPath = `~`;
                else if (newPath.startsWith(`~/project_files/`)) {
                    let parts = newPath.substring(`~/project_files/`.length).split('/');
                    parts.pop();
                    newPath = parts.length > 0 ? `~/project_files/${parts.join('/')}` : `~/project_files`;
                } else if (newPath !== `~`) {
                    let parts = newPath.substring(`~/`.length).split('/');
                    parts.pop();
                    newPath = parts.length > 0 ? `~/${parts.join('/')}` : `~`;
                }
            } else if (targetDir.startsWith("~/")) newPath = targetDir;
            else if (targetDir.startsWith("/")) newPath = `~/project_files/${targetDir.replace(/^\/+/, '')}`;
            else {
                if (newPath === "~") newPath = `~/${targetDir}`;
                else newPath = `${newPath}/${targetDir}`;
            }
            newPath = newPath.replace(/\/\//g, '/').replace(/\/$/, '');
            if (newPath === "" || newPath === "~/" ) newPath = "~";
            if (newPath === "/project_files") newPath = "~/project_files";

            this.currentDirectory = newPath;
            this.updateToolbarPath();
            this.updatePromptDisplay();
            this.appendOutput(this.ansiToHtml(`\n`), 'ps-success'); // Simulate success with just a newline
            return;
        }

        try {
            const response = await fetch('/api/run-command', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ command: command })
            });
            const result = await response.json();
            let outputText = result.output || "";
            let errorText = result.error || "";

            if (outputText) this.appendOutput(this.ansiToHtml(outputText + (outputText.endsWith('\n') ? '' : '\n')), result.return_code === 0 ? 'ps-success' : 'ps-output');
            if (errorText && errorText !== outputText) this.appendOutput(this.ansiToHtml(errorText + (errorText.endsWith('\n') ? '' : '\n')), 'ps-error');
            if (!outputText && !errorText && result.return_code !== 0) this.appendOutput(this.ansiToHtml(`Command exited with code ${result.return_code}\n`), 'ps-error');
        } catch (error) {
            this.appendOutput(this.ansiToHtml(`Client Error: ${error.message}\n`), 'ps-error');
        }
        this.updatePromptDisplay();
    }

    appendOutput(content, className = '') { // content can be text or a DocumentFragment
        const outputDiv = document.createElement('div');
        outputDiv.className = `terminal-output ${className}`.trim();

        if (typeof content === 'string') {
            // If it's a string without ANSI codes (e.g., from welcome message or client-side errors)
            content.split('\n').forEach((line, index, arr) => {
                outputDiv.appendChild(document.createTextNode(line));
                if (index < arr.length - 1) {
                    outputDiv.appendChild(document.createElement('br'));
                }
            });
        } else if (content instanceof DocumentFragment) {
            // If it's a pre-parsed fragment from ansiToHtml
            // The fragment already contains spans and text nodes.
            // We need to wrap lines in <br> if the original text had newlines.
            // This is tricky because the fragment is flat. A simpler approach for now:
            // just append the fragment. For multi-line ANSI, each line might need its own outputDiv.
            // OR, the ansiToHtml could return an array of line fragments.
            // For now, let's assume ansiToHtml handles newlines within its spans or by splitting.
            // The current ansiToHtml doesn't explicitly handle newlines by creating separate top-level elements per line.
            // Let's refine appendOutput to handle fragments that might represent multiple lines.
            
            const tempContainer = document.createElement('div');
            tempContainer.appendChild(content.cloneNode(true)); // Clone to avoid modifying original
            const lines = tempContainer.innerHTML.split('\n'); // This is a bit hacky but works for <br> or text newlines

            lines.forEach((lineHTML, index) => {
                const lineDiv = document.createElement('div'); // Create a div for each conceptual line
                lineDiv.innerHTML = lineHTML; // Set the HTML for the line
                if (index < lines.length -1 && lines.length > 1) { // If it's not the last line and there are multiple lines
                    // This implies a newline was present. The 'pre-wrap' on .terminal-output should handle it.
                    // If ansiToHtml produced <br>, they will be rendered.
                    // If original text had \n, they are now text nodes.
                }
                 outputDiv.appendChild(lineDiv);
            });


        } else { // Fallback for other types, though should be string or fragment
            outputDiv.textContent = String(content);
        }

        this.outputArea.appendChild(outputDiv);
        this.outputArea.scrollTop = this.outputArea.scrollHeight;
    }


    updatePromptDisplay() {
        if (this.promptElement) {
            // Prompt itself should not contain ANSI that needs parsing by ansiToHtml here.
            // It's constructed with specific spans.
            this.promptElement.innerHTML = this.getPromptHTML();
        }
        if(this.isActive) this.focus();
    }
    updateToolbarPath() {
        if (this.toolbarPathElement) {
            this.toolbarPathElement.textContent = this.currentDirectory;
            this.toolbarPathElement.title = this.currentDirectory;
        }
    }

    getPromptHTML() {
        // This HTML is directly inserted, so use classes for styling.
        return `<span class="ansi-fg-blue">${this.currentDirectory}</span><span class="ansi-fg-yellow">></span> `;
    }
    getPromptTextContent() {
        // This is for echoing the command. It's plain text.
        return `${this.currentDirectory}> `;
    }

    handleCtrlC() {
        this.appendOutput(this.ansiToHtml('^C\n'), 'ps-error');
        this.terminalInput.value = '';
        this.hideSuggestions();
        this.historyIndex = -1;
        this.currentCommandDraft = '';
        this.updatePromptDisplay();
    }

    focus() {
        if (this.terminalInput && typeof this.terminalInput.focus === 'function') {
            setTimeout(() => {
                this.terminalInput.focus();
                if (this.terminalInput.value === "") {
                    this.terminalInput.selectionStart = this.terminalInput.selectionEnd = this.terminalInput.value.length;
                }
            }, 0);
        }
    }

    activate() {
        this.isActive = true;
        if (this.instanceElement) this.instanceElement.classList.add('active');
        this.focus();
        this.adjustSuggestionBoxPosition();
        console.log(`Terminal ${this.terminalId} activated`);
    }

    deactivate() {
        this.isActive = false;
        if (this.instanceElement) this.instanceElement.classList.remove('active');
        this.hideSuggestions();
        console.log(`Terminal ${this.terminalId} deactivated`);
    }

    destroy() {
        this.terminalInput.removeEventListener('keydown', this.boundHandleKeyPress);
        this.terminalInput.removeEventListener('input', this.boundHandleInput);
        if (this.suggestionTimeout) clearTimeout(this.suggestionTimeout);
        console.log(`Terminal ${this.terminalId} destroyed`);
    }
}