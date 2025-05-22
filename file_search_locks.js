// --- file_search_locks.js ---
document.addEventListener('DOMContentLoaded', () => {
    const fileExplorerTabsContainer = document.querySelector('.file-explorer-tabs .panel-tabs');
    const fileExplorer = document.querySelector('.file-explorer');
    let searchSection = null;
    let locksSection = null;

    function createSearchSection() {
        const section = document.createElement('div');
        section.className = 'panel-section search-section';
        section.innerHTML = `
            <div class="search-input-wrapper">
                <span class="search-icon">🔍</span>
                <input type="text" class="search-input" placeholder="Search in files...">
                <div class="search-scope">
                    <select class="scope-select">
                        <option value="filename">Filename</option>
                        <option value="content">File content</option>
                    </select>
                </div>
            </div>
            <div class="search-results" style="display: none;">
                <div class="results-header">
                    <span class="results-count"></span>
                    <div class="result-actions">
                        <button class="icon-button prev-result" title="Previous result (Shift+Enter)">↑</button>
                        <button class="icon-button next-result" title="Next result (Enter)">↓</button>
                    </div>
                </div>
                <div class="results-list"></div>
            </div>
        `;
        return section;
    }

    function createLocksSection() {
        const section = document.createElement('div');
        section.className = 'panel-section locks-section';
        section.innerHTML = `
            <div class="locks-header">
                <span class="locks-title">Active Locks</span>
                <div class="lock-actions">
                    <button class="icon-button" title="Refresh locks">🔄</button>
                </div>
            </div>
            <div class="lock-items"></div>
        `;
        return section;
    }

    async function searchFiles(query, searchScope = 'filename') {
        const searchResults = searchSection.querySelector('.search-results');
        const resultsList = searchResults.querySelector('.results-list');
        const resultsCount = searchResults.querySelector('.results-count');
        
        if (!query.trim()) {
            searchResults.style.display = 'none';
            return;
        }

        searchResults.style.display = 'block';
        resultsList.innerHTML = '<div class="loading">Searching...</div>';

        try {
            const response = await fetch(`/api/search-files?query=${encodeURIComponent(query)}&scope=${searchScope}`);
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            const results = await response.json();

            if (results.length === 0) {
                resultsList.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🔍</div>
                        <p>No results found</p>
                    </div>
                `;
                resultsCount.textContent = '0 results';
                return;
            }

            resultsCount.textContent = `${results.length} result${results.length === 1 ? '' : 's'}`;

            resultsList.innerHTML = results
                .map((result, index) => `
                    <div class="search-result-item" data-path="${result.path}" data-index="${index}" tabindex="0">
                        <div class="result-header">
                            <span class="file-explorer-icon">${result.isDir ? '📁' : '📄'}</span>
                            <span class="file-name">${result.name}</span>
                        </div>
                        ${result.preview ? `
                            <div class="result-preview">
                                <pre class="preview-content">${escapeHtml(result.preview)}</pre>
                            </div>
                        ` : ''}
                    </div>
                `).join('');

            // Add keyboard navigation and click handlers
            const resultItems = resultsList.querySelectorAll('.search-result-item');
            resultItems.forEach((item, index) => {
                item.addEventListener('click', () => selectSearchResult(item));
                item.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        selectSearchResult(item);
                    } else if (e.key === 'ArrowDown' && index < resultItems.length - 1) {
                        resultItems[index + 1].focus();
                    } else if (e.key === 'ArrowUp' && index > 0) {
                        resultItems[index - 1].focus();
                    }
                });
            });

            // Set up navigation buttons
            const prevButton = searchResults.querySelector('.prev-result');
            const nextButton = searchResults.querySelector('.next-result');
            
            prevButton.onclick = () => navigateResults('prev');
            nextButton.onclick = () => navigateResults('next');

            // Add keyboard shortcuts for result navigation
            document.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    if (e.shiftKey) {
                        navigateResults('prev');
                    } else {
                        navigateResults('next');
                    }
                }
            });

            // After displaying results, highlight matches in the current file
            const currentPath = window.BoltDevUI && window.BoltDevUI.getCurrentFilePath && window.BoltDevUI.getCurrentFilePath();
            if (currentPath && window.BoltDevUI.highlightSearchResults) {
                window.BoltDevUI.highlightSearchResults(query);
            }

        } catch (error) {
            resultsList.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <p>Error searching files: ${error.message}</p>
                </div>
            `;
        }
    }

    async function refreshLocks() {
        const lockItems = locksSection.querySelector('.lock-items');
        lockItems.innerHTML = '<div class="loading">Loading locks...</div>';

        try {
            const response = await fetch('/api/file-locks');
            if (!response.ok) throw new Error(`HTTP error ${response.status}`);
            const locks = await response.json();

            if (locks.length === 0) {
                lockItems.innerHTML = `
                    <div class="empty-state">
                        <div class="empty-state-icon">🔓</div>
                        <p>No active locks</p>
                    </div>
                `;
                return;
            }

            lockItems.innerHTML = locks
                .map(lock => `
                    <div class="lock-item">
                        <span class="lock-icon">🔒</span>
                        <div class="lock-info">
                            <div class="lock-path">${lock.path}</div>
                            <div class="lock-meta">Locked by ${lock.user} • ${lock.duration}</div>
                        </div>
                        <div class="lock-actions">
                            <button class="icon-button" title="Release lock" data-path="${lock.path}">✖️</button>
                        </div>
                    </div>
                `).join('');

            // Add click handlers to lock release buttons
            lockItems.querySelectorAll('.lock-item .icon-button').forEach(button => {
                button.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const path = button.dataset.path;
                    try {
                        const response = await fetch('/api/release-lock', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ path })
                        });
                        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
                        refreshLocks(); // Refresh the list after releasing
                        if (window.showToast) {
                            window.showToast(`Lock released for ${path}`, 'success');
                        }
                    } catch (error) {
                        if (window.showToast) {
                            window.showToast(`Error releasing lock: ${error.message}`, 'error');
                        }
                    }
                });
            });
        } catch (error) {
            lockItems.innerHTML = `
                <div class="empty-state">
                    <div class="empty-state-icon">⚠️</div>
                    <p>Error loading locks: ${error.message}</p>
                </div>
            `;
        }
    }

    function setupTabHandlers() {
        if (!fileExplorerTabsContainer) return;

        const buttons = fileExplorerTabsContainer.querySelectorAll('button');
        const contentSections = {
            'Files': fileExplorer,
            'Search': searchSection,
            'Locks': locksSection
        };

        buttons.forEach(button => {
            button.addEventListener('click', () => {
                // Update button states
                buttons.forEach(btn => btn.classList.remove('active-tab'));
                button.classList.add('active-tab');

                // Show/hide appropriate section
                Object.entries(contentSections).forEach(([name, section]) => {
                    if (section) {
                        section.style.display = button.textContent === name ? 'block' : 'none';
                    }
                });

                // Special handling for tabs
                if (button.textContent === 'Search') {
                    searchSection.querySelector('.search-input').focus();
                } else if (button.textContent === 'Locks') {
                    refreshLocks();
                }
            });
        });

        // Set up search input handler
        const searchInput = searchSection.querySelector('.search-input');
        const scopeSelect = searchSection.querySelector('.scope-select');
        
        let searchTimeout;
        searchInput.addEventListener('input', () => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                searchFiles(searchInput.value, scopeSelect.value);
            }, 300); // Debounce search for better performance
        });

        scopeSelect.addEventListener('change', () => {
            if (searchInput.value) {
                searchFiles(searchInput.value, scopeSelect.value);
            }
        });

        // Set up locks refresh button
        locksSection.querySelector('.locks-header .icon-button').addEventListener('click', () => {
            refreshLocks();
        });
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func.apply(this, args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Update the selectSearchResult function to include search highlighting
    function selectSearchResult(resultItem) {
        const path = resultItem.dataset.path;
        if (!path) return;

        // Remove selection from other results
        document.querySelectorAll('.search-result-item').forEach(item => {
            item.classList.remove('selected');
        });
        resultItem.classList.add('selected');

        // Get the current search query
        const searchInput = searchSection.querySelector('.search-input');
        const searchQuery = searchInput.value;

        // Load the file in the code panel with search highlighting
        if (window.BoltDevUI && window.BoltDevUI.loadFileContent) {
            window.BoltDevUI.loadFileContent(path, searchQuery);
        }
    }

    function navigateResults(direction) {
        if (window.BoltDevUI && window.BoltDevUI.navigateSearchResults) {
            const { current, total } = window.BoltDevUI.navigateSearchResults(direction);
            
            // Update the results count to show current match
            const resultsCount = searchSection.querySelector('.results-count');
            if (resultsCount && total > 0) {
                resultsCount.textContent = `Match ${current} of ${total}`;
            }
        }
    }

    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // Initialize sections
    if (fileExplorer && fileExplorerTabsContainer) {
        searchSection = createSearchSection();
        locksSection = createLocksSection();
        fileExplorer.parentNode.appendChild(searchSection);
        fileExplorer.parentNode.appendChild(locksSection);

        // Initially hide search and locks sections
        searchSection.style.display = 'none';
        locksSection.style.display = 'none';

        setupTabHandlers();
    }
});
