// --- START OF FILE code_pane.js ---
document.addEventListener('DOMContentLoaded', () => {
    console.log("code_pane.js: DOMContentLoaded event fired.");
    const codePaneContainer = document.getElementById('codePane');
    if (!codePaneContainer) {
        console.error("CRITICAL: code_pane.js - Code pane container (#codePane) not found in DOM. Script will not initialize.");
        return;
    }

    const codePaneHTMLContent = `
        <aside class="file-explorer-wrapper" id="fileExplorerWrapper">
            <header class="file-explorer-tabs panel-header">
                <div class="panel-tabs">
                    <button class="active-tab">Files</button>
                    <button>Search</button>
                    <button>Locks</button>
                </div>
            </header>
            <div class="file-explorer">
                <ul id="fileList"></ul>
            </div>
        </aside>
        <div class="resizer resizer-horizontal" id="resizerExplorerEditor"></div>
        <section class="code-editor-area-wrapper" id="codeEditorAreaWrapper">
            <header class="editor-file-tabs-bar panel-header">
                <div id="openFileTabContainer" class="panel-tabs">
                    <div id="openFileTab" class="file-tab active-tab" style="display: none;">
                        <span></span>
                        <button class="close-file-tab icon-button" title="Close file" style="display: none;">×</button>
                    </div>
                </div>
            </header>
            <div class="code-editor-content">
                <pre id="codeDisplay" class="line-numbers"><code id="codeDisplayCode" class="language-plaintext">// Click on a file to view its contents</code></pre>
            </div>
        </section>
    `;

    let fileListEl, codeDisplayPre, codeDisplayCode, openFileTab, openFileTabContentSpan, openFileTabCloseButton;
    let fileExplorerWrapper, codeEditorAreaWrapper, resizerExplorerEditor;
    let fileExplorerButtons = [];
    let codePaneListenersAttached = false;
    let expandedFolders = [];

    // --- Function Definitions First ---

    function allCodePaneElementsFound() {
        return fileExplorerWrapper && codeEditorAreaWrapper && resizerExplorerEditor &&
               fileListEl && codeDisplayPre && codeDisplayCode && openFileTab &&
               openFileTabContentSpan && openFileTabCloseButton && fileExplorerButtons.length > 0;
    }

    function setupInternalCodeElements() {
        if (!codePaneContainer) return;
        fileExplorerWrapper = codePaneContainer.querySelector('#fileExplorerWrapper');
        codeEditorAreaWrapper = codePaneContainer.querySelector('#codeEditorAreaWrapper');
        resizerExplorerEditor = codePaneContainer.querySelector('#resizerExplorerEditor');
        fileListEl = codePaneContainer.querySelector('#fileList');
        codeDisplayPre = codePaneContainer.querySelector('#codeDisplay');
        codeDisplayCode = codePaneContainer.querySelector('#codeDisplayCode');
        openFileTab = codePaneContainer.querySelector('#openFileTab');
        if (openFileTab) {
            openFileTabContentSpan = openFileTab.querySelector('span');
            openFileTabCloseButton = openFileTab.querySelector('.close-file-tab');
        }
        const fileExplorerTabsContainer = fileExplorerWrapper ? fileExplorerWrapper.querySelector('.file-explorer-tabs .panel-tabs') : null;
        if (fileExplorerTabsContainer) fileExplorerButtons = Array.from(fileExplorerTabsContainer.querySelectorAll('button'));
        else fileExplorerButtons = [];
    }

    function handleCloseFileTab(e) {
        e.stopPropagation();
        if (codeDisplayCode && codeDisplayPre) {
            codeDisplayCode.textContent = '// Click on a file to view its contents';
            codeDisplayPre.className = 'line-numbers language-plaintext';
            if (typeof Prism !== 'undefined' && codeDisplayCode.offsetParent !== null) Prism.highlightElement(codeDisplayCode);
        }
        if (openFileTab) openFileTab.style.display = 'none';
        if (window.BoltDevUI && window.BoltDevUI.setCurrentlyOpenFile) window.BoltDevUI.setCurrentlyOpenFile(null, null, 'plaintext');
        const selectedFileLi = fileListEl ? fileListEl.querySelector('li.selected') : null;
        if (selectedFileLi) selectedFileLi.classList.remove('selected');
    }

    function handleFileExplorerTabClick() {
         fileExplorerButtons.forEach(btn => btn.classList.remove('active-tab'));
         this.classList.add('active-tab');
         if (fileListEl) fileListEl.style.display = (this.textContent === 'Files') ? 'block' : 'none';
    }

    function compareFileItems(itemA, itemB) {
        if (itemA.is_dir !== itemB.is_dir) {
            return itemA.is_dir ? -1 : 1;
        }
        return itemA.name.localeCompare(itemB.name);
    }

    function createFileListItemElement(item) {
        const li = document.createElement('li');
        li.dataset.path = item.path;
        li.dataset.isdir = item.is_dir.toString();
        li.itemData = item;

        const itemContent = document.createElement('div');
        itemContent.classList.add('file-explorer-item-content');

        const chevron = document.createElement('span');
        chevron.classList.add('file-explorer-chevron');
        if (item.is_dir) {
             chevron.textContent = '▸';
        }

        const icon = document.createElement('span');
        icon.classList.add('file-explorer-icon');
        icon.textContent = item.is_dir ? '📁' : '📄';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = item.name;

        itemContent.append(chevron, icon, nameSpan);
        li.appendChild(itemContent);

        itemContent.addEventListener('click', (e) => {
            e.stopPropagation();
            if (item.is_dir) {
                toggleFolder(li, item.path, chevron);
            } else {
                if (window.BoltDevUI && typeof window.BoltDevUI.loadFileContent === 'function') {
                    window.BoltDevUI.loadFileContent(item.path);
                } else {
                    console.error("loadFileContent not found on BoltDevUI object in createFileListItemElement");
                }
                const parentUl = li.parentElement;
                if (parentUl) {
                    parentUl.querySelectorAll('li.selected').forEach(el => el.classList.remove('selected'));
                }
                li.classList.add('selected');
                const codeTabButton = document.querySelector('.main-top-bar .panel-tabs button[data-pane="codePane"]');
                if (codeTabButton && codePaneContainer && !codePaneContainer.classList.contains('active-pane')) {
                    codeTabButton.click();
                }
            }
        });
        return li;
    }

    async function updateFileExplorerListSmart(ulElement, pathForNewItems = '') {
        if (!ulElement) return;
        console.log(`Smart updating list for path: '${pathForNewItems || "root"}'`);

        let newItemsFromServer;
        try {
            const response = await fetch(`/api/files?path=${encodeURIComponent(pathForNewItems)}`);
            if (!response.ok) {
                let errorText = `HTTP error ${response.status}`;
                try { const ed = await response.json(); if(ed.error) errorText = `Server error: ${ed.error}`; } catch(e){}
                throw new Error(errorText);
            }
            newItemsFromServer = await response.json();
            if (newItemsFromServer.error) throw new Error(newItemsFromServer.error);
        } catch (error) {
            console.error(`Failed to fetch items for smart update (path: ${pathForNewItems}):`, error);
            if (window.showToast) window.showToast(`Error fetching file list: ${error.message}`, 'error');
            return;
        }

        newItemsFromServer.sort(compareFileItems);

        const currentLiElements = Array.from(ulElement.children);
        let newIdx = 0;
        let domIdx = 0;

        while (newIdx < newItemsFromServer.length || domIdx < currentLiElements.length) {
            const newItemData = newIdx < newItemsFromServer.length ? newItemsFromServer[newIdx] : null;
            const currentDomLi = domIdx < currentLiElements.length ? currentLiElements[domIdx] : null;
            const currentDomItemData = currentDomLi ? currentDomLi.itemData : null;
            const comparison = currentDomItemData && newItemData ? compareFileItems(newItemData, currentDomItemData) : (newItemData ? -1 : 1);

            if (comparison === 0) {
                currentDomLi.itemData = newItemData;
                if (newItemData.is_dir) {
                     const chevron = currentDomLi.querySelector('.file-explorer-chevron');
                     if (chevron) {
                         const shouldBeOpen = expandedFolders.includes(newItemData.path) || currentDomLi.classList.contains('open');
                         chevron.textContent = shouldBeOpen ? '▾' : '▸';
                         currentDomLi.classList.toggle('open', shouldBeOpen);
                     }
                }
                newIdx++;
                domIdx++;
            } else if (comparison < 0) {
                const newLi = createFileListItemElement(newItemData);
                ulElement.insertBefore(newLi, currentDomLi); // currentDomLi can be null if appending
                newIdx++;
            } else {
                ulElement.removeChild(currentDomLi);
                domIdx++;
            }
        }
    }

    async function loadFilesForFirstTime(path = '', targetUlElement = fileListEl) {
        if (!targetUlElement) return;
        targetUlElement.innerHTML = '';
        try {
            const response = await fetch(`/api/files?path=${encodeURIComponent(path)}`);
            if (!response.ok) {
                let errorText = `HTTP error ${response.status}`;
                try { const ed = await response.json(); if(ed.error) errorText = `Server error: ${ed.error}`; } catch(e){}
                throw new Error(errorText);
            }
            const items = await response.json();
            if (items.error) throw new Error(items.error);

            items.sort(compareFileItems);
            items.forEach(item => {
                const li = createFileListItemElement(item);
                targetUlElement.appendChild(li);
            });
            return items.length > 0;
        } catch (errorCaughtByLoadFiles) {
            console.error(`Failed to load files for path '${path || "root"}':`, errorCaughtByLoadFiles);
            if (targetUlElement === fileListEl) {
                 targetUlElement.innerHTML = `<li>Error loading files: ${errorCaughtByLoadFiles.message}</li>`;
            }
            if (window.showToast) window.showToast(`Failed to load files: ${errorCaughtByLoadFiles.message}`, 'error');
            return false;
        }
    }

    async function toggleFolder(liElement, folderPath, chevronElement) {
        const subList = liElement.querySelector('ul');
        const isCurrentlyOpen = liElement.classList.contains('open');

        if (subList) {
            subList.style.display = isCurrentlyOpen ? 'none' : 'block';
            chevronElement.textContent = isCurrentlyOpen ? '▸' : '▾';
            liElement.classList.toggle('open', !isCurrentlyOpen);
            if (liElement.classList.contains('open')) {
                 if (!expandedFolders.includes(folderPath)) expandedFolders.push(folderPath);
            } else {
                 expandedFolders = expandedFolders.filter(p => p !== folderPath && !p.startsWith(folderPath + '/'));
            }
        } else if (!isCurrentlyOpen) {
            const newSubList = document.createElement('ul');
            const itemsLoaded = await loadFilesForFirstTime(folderPath, newSubList);
            if (itemsLoaded) {
                liElement.appendChild(newSubList);
                chevronElement.textContent = '▾';
                liElement.classList.add('open');
                 if (!expandedFolders.includes(folderPath)) expandedFolders.push(folderPath);
                 const childrenToExpand = expandedFolders.filter(p => p.startsWith(folderPath + '/') && p !== folderPath);
                 if (childrenToExpand.length > 0) {
                     childrenToExpand.sort((a, b) => a.split('/').length - b.split('/').length);
                     for (const childPath of childrenToExpand) {
                         const childLi = newSubList.querySelector(`li[data-path="${childPath}"]`);
                         if (childLi && childLi.dataset.isdir === 'true' && !childLi.classList.contains('open')) {
                              const childChevron = childLi.querySelector('.file-explorer-chevron');
                              if (childChevron) {
                                  await toggleFolder(childLi, childPath, childChevron);
                              }
                         }
                     }
                 }
            } else {
                chevronElement.textContent = '▸';
                liElement.classList.remove('open');
                 expandedFolders = expandedFolders.filter(p => p !== folderPath && !p.startsWith(folderPath + '/'));
            }
        }
    }

    async function _loadFileContent(filePath) {
        if (!allCodePaneElementsFound()) { // Check if elements are ready
             if (window.showToast) window.showToast("Error: Code editor UI not fully ready for file load.", 'error');
             console.error("_loadFileContent: Code editor UI elements not found.");
             return;
        }
        try {
            const response = await fetch(`/api/file-content?path=${encodeURIComponent(filePath)}`);
            if (!response.ok) {
                let errorText = `HTTP error ${response.status}`;
                try { const ed = await response.json(); if(ed.error) errorText = `Server error: ${ed.error}`; } catch(e){}
                throw new Error(errorText);
            }
            const data = await response.json();
            if (data.content !== undefined) {
                const filename = filePath.split('/').pop();
                openFileTabContentSpan.textContent = filename;
                openFileTab.style.display = 'flex'; openFileTabCloseButton.style.display = 'inline-block';
                const fileContent = data.content;
                const fileLangClass = (window.BoltDevUI && window.BoltDevUI.getLanguageClass) ? window.BoltDevUI.getLanguageClass(filename) : 'plaintext';
                if (window.BoltDevUI && window.BoltDevUI.setCurrentlyOpenFile) window.BoltDevUI.setCurrentlyOpenFile(filePath, fileContent, fileLangClass);
                codeDisplayCode.textContent = fileContent;
                codeDisplayPre.className = `line-numbers language-${fileLangClass}`;
                if (typeof Prism !== 'undefined' && codeDisplayCode.offsetParent !== null) Prism.highlightElement(codeDisplayCode);
                codeDisplayPre.scrollTop = 0;
            } else if (data.error) {
                if (window.showToast) window.showToast(`Error loading file ${filePath.split('/').pop()}: ${data.error}`, 'error');
                openFileTabContentSpan.textContent = "Error"; codeDisplayCode.textContent = `Error: ${data.error}`;
                codeDisplayPre.className = 'language-plaintext';
                if (typeof Prism !== 'undefined' && codeDisplayCode.offsetParent !== null) Prism.highlightElement(codeDisplayCode);
                if (window.BoltDevUI && window.BoltDevUI.setCurrentlyOpenFile) window.BoltDevUI.setCurrentlyOpenFile(filePath, `Error: ${data.error}`, 'plaintext');
            }
        } catch (errorCaughtByLoadContent) {
            if (window.showToast) window.showToast(`Client Error loading ${filePath.split('/').pop()}: ${errorCaughtByLoadContent.message}`, 'error');
            openFileTabContentSpan.textContent = "Error"; codeDisplayCode.textContent = `Client Error: ${errorCaughtByLoadContent.message}`;
            codeDisplayPre.className = 'language-plaintext';
            if (typeof Prism !== 'undefined' && codeDisplayCode.offsetParent !== null) Prism.highlightElement(codeDisplayCode);
            if (window.BoltDevUI && window.BoltDevUI.setCurrentlyOpenFile) window.BoltDevUI.setCurrentlyOpenFile(filePath, `Exception: ${errorCaughtByLoadContent.message}`, 'plaintext');
        }
    }

    function _selectFileInExplorer(filePath) {
         let attempts = 0;
         const maxAttempts = 10;
         const findAndSelect = () => {
             const selectedFileLi = fileListEl ? fileListEl.querySelector(`li[data-path="${filePath}"]`) : null;
             if (selectedFileLi) {
                 const parentUl = selectedFileLi.parentElement;
                 if(parentUl) parentUl.querySelectorAll('li.selected').forEach(el => el.classList.remove('selected'));
                 selectedFileLi.classList.add('selected');
                 selectedFileLi.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                 console.log(`code_pane.js: File ${filePath} selected in explorer.`);
             } else if (attempts < maxAttempts) {
                 attempts++;
                 console.log(`code_pane.js: File element for ${filePath} not found yet, retrying... (Attempt ${attempts})`);
                 setTimeout(findAndSelect, 100);
             } else {
                  console.warn(`code_pane.js: Could not find li element for path ${filePath} after operation.`);
             }
         };
         setTimeout(findAndSelect, 100);
    }

    function attachAllEventListeners() {
        if (openFileTabCloseButton) openFileTabCloseButton.addEventListener('click', handleCloseFileTab);
        if (fileExplorerButtons.length > 0) fileExplorerButtons.forEach(button => button.addEventListener('click', handleFileExplorerTabClick));
        if (resizerExplorerEditor && fileExplorerWrapper && codeEditorAreaWrapper && window.BoltDevUI && window.BoltDevUI.makeResizable) {
             window.BoltDevUI.makeResizable(resizerExplorerEditor, fileExplorerWrapper, codeEditorAreaWrapper, window.BoltDevUI.handleCodePaneResize);
        }
        codePaneListenersAttached = true;
    }


    // --- Assign to window.BoltDevUI AFTER all function definitions ---
    window.BoltDevUI = window.BoltDevUI || {};
    window.BoltDevUI.loadFileContent = _loadFileContent;
    window.BoltDevUI.handleCodePaneResize = function() {
        if (codeDisplayPre && codeDisplayCode && typeof Prism !== 'undefined' && Prism.plugins && Prism.plugins.LineNumbers) {
            setTimeout(() => {
                 if (codeDisplayCode && codeDisplayCode.offsetParent !== null) Prism.highlightElement(codeDisplayCode);
            }, 50);
        }
    };

    window.BoltDevUI.refreshFileExplorer = function(modifiedFiles = []) {
        console.log("code_pane.js: refreshFileExplorer (smart update) called. Modified files:", modifiedFiles);
        if (fileListEl) {
            updateFileExplorerListSmart(fileListEl, '');
        }
    };

    window.BoltDevUI.typeOutInCodePane = function(filePath, content, typingSpeed = 10) {
        if (!codePaneContainer || !codePaneContainer.classList.contains('active-pane')) {
            console.warn("typeOutInCodePane: Code pane not active. Attempting to activate.");
            const codeTabButton = document.querySelector('.main-top-bar .panel-tabs button[data-pane="codePane"]');
            if (codeTabButton) {
                 codeTabButton.click();
                 setTimeout(() => window.BoltDevUI.typeOutInCodePane(filePath, content, typingSpeed), 400);
                 return;
            } else {
                 console.error("typeOutInCodePane: Code pane container or tab button not found. Cannot activate.");
                 return;
            }
        }

        if (!allCodePaneElementsFound()) {
            console.error("typeOutInCodePane: Code pane elements not ready even after potential activation.");
            return;
        }

        console.log(`typeOutInCodePane: Preparing to display content for ${filePath}`);

        const filename = filePath.split('/').pop();
        const langClass = (window.BoltDevUI && window.BoltDevUI.getLanguageClass) ? window.BoltDevUI.getLanguageClass(filename) : 'plaintext';

        if (openFileTab && openFileTabContentSpan && openFileTabCloseButton) {
            openFileTabContentSpan.textContent = filename;
            openFileTab.style.display = 'flex';
            openFileTabCloseButton.style.display = 'inline-block';
        }

        if (window.BoltDevUI && window.BoltDevUI.setCurrentlyOpenFile) {
            window.BoltDevUI.setCurrentlyOpenFile(filePath, "", langClass);
        }

        if (codeDisplayCode && codeDisplayPre) {
            codeDisplayPre.className = `line-numbers language-${langClass}`;
            const isNewFile = !(window.BoltDevUI && window.BoltDevUI.getCurrentFilePath && window.BoltDevUI.getCurrentFilePath() === filePath);

            if (isNewFile) {
                 console.log(`typeOutInCodePane: File ${filePath} is new or different, performing typing animation.`);
                 codeDisplayCode.textContent = '';
                 codeDisplayPre.scrollTop = 0;
                 let i = 0;
                 function typeChar() {
                     if (i < content.length) {
                         codeDisplayCode.textContent += content.charAt(i);
                         i++;
                         setTimeout(typeChar, typingSpeed);
                     } else {
                         if (window.BoltDevUI && window.BoltDevUI.setCurrentlyOpenFile) {
                            window.BoltDevUI.setCurrentlyOpenFile(filePath, content, langClass);
                         }
                         if (typeof Prism !== 'undefined' && codeDisplayCode.offsetParent !== null) {
                             Prism.highlightElement(codeDisplayCode);
                         }
                         console.log(`typeOutInCodePane: Finished typing ${filePath}`);
                         _selectFileInExplorer(filePath);
                     }
                 }
                 typeChar();
            } else {
                 console.log(`typeOutInCodePane: File ${filePath} is already open, replacing content.`);
                 codeDisplayCode.textContent = content;
                 if (typeof Prism !== 'undefined' && codeDisplayCode.offsetParent !== null) {
                     Prism.highlightElement(codeDisplayCode);
                 }
                 codeDisplayPre.scrollTop = 0;
                 _selectFileInExplorer(filePath);
            }
        } else {
            console.error("typeOutInCodePane: codeDisplayCode or codeDisplayPre not found.");
        }
    };

    window.BoltDevUI.activateCodePane = function() {
        console.log("code_pane.js: activateCodePane called.");
        if (!codePaneContainer) return;

        codePaneContainer.innerHTML = codePaneHTMLContent;
        codePaneListenersAttached = false;

        setTimeout(async () => {
            console.log("code_pane.js: activateCodePane setTimeout callback executing.");
            setupInternalCodeElements();

            if (!allCodePaneElementsFound()) {
                console.error("code_pane.js: activateCodePane - CRITICAL - Elements not found after re-injection.");
                return;
            }

            if (!codePaneListenersAttached) {
                attachAllEventListeners(); // Use the new combined function
                console.log("code_pane.js: Event listeners re-attached.");
            }

            console.log("code_pane.js: Loading root files for the first time (or after re-injection).");
            await loadFilesForFirstTime('', fileListEl);

            if (expandedFolders.length > 0 && fileListEl) {
                console.log("code_pane.js: Attempting to restore expanded folders:", expandedFolders);
                expandedFolders.sort((a, b) => a.split('/').length - b.split('/').length);
                for (const folderPath of expandedFolders) {
                    const li = fileListEl.querySelector(`li[data-path="${folderPath}"]`);
                    if (li && li.dataset.isdir === 'true' && !li.classList.contains('open')) {
                         const chevron = li.querySelector('.file-explorer-chevron');
                         if (chevron) {
                             console.log(`code_pane.js: Restoring expansion for: ${folderPath}`);
                             await toggleFolder(li, folderPath, chevron);
                         }
                    }
                }
                 console.log("code_pane.js: Finished attempting to restore expanded folders.");
            }

            const currentFilePath = window.BoltDevUI && window.BoltDevUI.getCurrentFilePath ? window.BoltDevUI.getCurrentFilePath() : null;
            const currentFileContent = window.BoltDevUI && window.BoltDevUI.getCurrentFileContent ? window.BoltDevUI.getCurrentFileContent() : null;
            const currentFileLangClass = window.BoltDevUI && window.BoltDevUI.getCurrentFileLangClass ? window.BoltDevUI.getCurrentFileLangClass() : 'plaintext';

            if (currentFilePath && currentFileContent !== null) {
                console.log(`code_pane.js: Restoring editor content for: ${currentFilePath}`);
                const filename = currentFilePath.split('/').pop();
                if (openFileTabContentSpan) openFileTabContentSpan.textContent = filename;
                if (openFileTab) openFileTab.style.display = 'flex';
                if (openFileTabCloseButton) openFileTabCloseButton.style.display = 'inline-block';
                if (codeDisplayCode && codeDisplayPre) {
                    codeDisplayCode.textContent = currentFileContent;
                    codeDisplayPre.className = `line-numbers language-${currentFileLangClass}`;
                    if (typeof Prism !== 'undefined' && codeDisplayCode.offsetParent !== null) Prism.highlightElement(codeDisplayCode);
                    codeDisplayPre.scrollTop = 0;
                }
                 setTimeout(() => {
                    _selectFileInExplorer(currentFilePath);
                 }, 150 + (expandedFolders.length * 50));
            } else {
                console.log("code_pane.js: No file was previously open or content is null. Loading welcome.txt.");
                if (window.BoltDevUI && typeof window.BoltDevUI.loadFileContent === 'function') {
                    window.BoltDevUI.loadFileContent("welcome.txt").then(() => {
                        setTimeout(() => {
                            _selectFileInExplorer("welcome.txt");
                        }, 150 + (expandedFolders.length * 50));
                    }).catch(err => {
                        console.error("code_pane.js: Failed to load welcome.txt on activate:", err);
                        if (codeDisplayCode && codeDisplayPre) {
                           codeDisplayCode.textContent = '// Error loading welcome.txt. Click another file.'; codeDisplayPre.className = 'line-numbers language-plaintext';
                           if (typeof Prism !== 'undefined' && codeDisplayCode.offsetParent !== null) Prism.highlightElement(codeDisplayCode);
                           if (openFileTab) openFileTab.style.display = 'none';
                        }
                    });
                } else {
                    console.error("loadFileContent not found on BoltDevUI object in activateCodePane for welcome.txt");
                }
            }
            if (fileExplorerButtons && fileExplorerButtons.length > 0) {
                const filesExplorerTab = fileExplorerButtons.find(btn => btn.textContent === 'Files');
                if (filesExplorerTab) {
                    if (!filesExplorerTab.classList.contains('active-tab')) { fileExplorerButtons.forEach(btn => btn.classList.remove('active-tab')); filesExplorerTab.classList.add('active-tab'); }
                    if(fileListEl && filesExplorerTab.classList.contains('active-tab')) fileListEl.style.display = 'block';
                    else if (fileListEl) fileListEl.style.display = 'none';
                }
            }
            if (window.BoltDevUI && typeof window.BoltDevUI.handleCodePaneResize === 'function') {
                window.BoltDevUI.handleCodePaneResize();
            }
            console.log("code_pane.js: activateCodePane setTimeout callback finished.");
        }, 0);
        console.log("code_pane.js: activateCodePane function finished (setTimeout scheduled).");
    };

    window.BoltDevUI.deactivateCodePane = function() {
        console.log("code_pane.js: deactivateCodePane called. Saving expanded folders.");
        expandedFolders = [];
        if (fileListEl) {
            const openFolderLis = fileListEl.querySelectorAll('li[data-isdir="true"].open');
            openFolderLis.forEach(li => {
                if (li.dataset.path) {
                    expandedFolders.push(li.dataset.path);
                }
            });
        }
        console.log("code_pane.js: Saved expanded folders:", expandedFolders);
    };

    // --- Initial Activation ---
    if (codePaneContainer && codePaneContainer.classList.contains('active-pane')) {
        console.log("code_pane.js: Code pane is active on DOMContentLoaded, calling activateCodePane.");
        if (window.BoltDevUI && typeof window.BoltDevUI.activateCodePane === 'function') { // Check if activateCodePane is defined
            window.BoltDevUI.activateCodePane();
        } else {
            // If activateCodePane is not yet defined, wait a bit. This can happen if script.js calls activate before this script fully assigns it.
            // This is a fallback, ideally script.js waits for all modules to signal readiness.
            console.warn("code_pane.js: activateCodePane not yet on BoltDevUI, delaying call.");
            setTimeout(() => {
                if (window.BoltDevUI && typeof window.BoltDevUI.activateCodePane === 'function') {
                    window.BoltDevUI.activateCodePane();
                } else {
                    console.error("BoltDevUI.activateCodePane still not ready after delay.");
                }
            }, 100);
        }
    } else {
         console.log("code_pane.js: Code pane is NOT active on DOMContentLoaded.");
    }
});
// --- END OF FILE code_pane.js ---