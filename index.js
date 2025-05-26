// This code was created by YOAV M to help you export your project files into a single text file
// if you want to use this code run `node index.js` in your terminal

const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');

class ProjectExporter {
    constructor() {
        this.projectPath = '';
        this.projectTree = null;
        this.selectedPaths = new Set();
        // Define default common exclusion names.
        // These are the actual folder/file names that will be checked.
        this.defaultExclusionNames = [
            'node_modules', '.git', '.vscode', 'package-lock.json',
            'yarn.lock', 'build', 'dist', 'temp'
        ];
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // Modified buildTree method to store paths relative to the projectPath
    // Now accepts an array of active exclusion names from the client
    buildTree(currentDirPath, activeExclusionNames = []) {
        const stats = fs.statSync(currentDirPath);
        const name = path.basename(currentDirPath);

        // Normalize the active exclusion names to a Set for efficient lookup
        const exclusionSet = new Set(activeExclusionNames);

        // Crucial: Do not exclude the project's root directory, even if its name matches an exclusion.
        // This ensures the tree always starts from the specified project path.
        if (currentDirPath !== this.projectPath && exclusionSet.has(name)) {
            return null; // Skip this item and its children if it matches an exclusion
        }

        let nodePath = path.relative(this.projectPath, currentDirPath);
        nodePath = nodePath.replace(/\\/g, '/'); // Normalize path separators

        if (stats.isDirectory()) {
            const children = [];
            let totalSize = 0;

            try {
                const items = fs.readdirSync(currentDirPath);
                for (const item of items) {
                    // Skip items that match an exclusion name
                    if (exclusionSet.has(item)) {
                        continue;
                    }

                    const itemPath = path.join(currentDirPath, item);
                    // Pass the activeExclusionNames down to recursive calls
                    const child = this.buildTree(itemPath, activeExclusionNames);
                    if (child) {
                        children.push(child);
                        totalSize += child.size;
                    }
                }
            } catch (err) {
                console.error(`Error reading directory ${currentDirPath}: ${err.message}`);
            }

            return {
                name,
                path: nodePath,
                type: 'directory',
                size: totalSize,
                children
            };
        } else {
            return {
                name,
                path: nodePath,
                type: 'file',
                size: stats.size
            };
        }
    }

    formatTreeToString(node, indent = '', isLast = true) {
        const lines = [];
        const displayName = node.path === '' ? path.basename(this.projectPath) : node.name;
        const prefix = isLast ? '└── ' : '├── ';
        const icon = node.type === 'directory' ? '📁' : '📄';
        const size = node.formattedSize ? ` (${node.formattedSize})` : '';

        const isNodeSelected = this.selectedPaths.has(node.path);
        const selectedIndicator = isNodeSelected ? '[X] ' : '[ ] ';

        lines.push(`${indent}${prefix}${selectedIndicator}${icon} ${displayName}${size}`);

        if (node.children && node.children.length > 0) {
            const childIndent = indent + (isLast ? '    ' : '│   ');
            for (let i = 0; i < node.children.length; i++) {
                const child = node.children[i];
                const childIsLast = (i === node.children.length - 1);
                lines.push(this.formatTreeToString(child, childIndent, childIsLast));
            }
        }
        return lines.join('\n');
    }


    generateUniqueFilename(baseName = 'export') {
        const timestamp = new Date().toISOString()
            .replace(/:/g, '-')
            .replace(/\..+/, '')
            .replace('T', '_');
        return `${baseName}_${timestamp}.txt`;
    }

    exportToText(customName = null) {
        const output = [];
        const sectionSeparator = '='.repeat(80);
        let fileCount = 0;

        output.push(`${sectionSeparator}\n`);
        output.push(`PROJECT STRUCTURE AND SELECTION\n`);
        output.push(`${sectionSeparator}\n`);
        if (this.projectTree) {
            output.push(this.formatTreeToString(this.projectTree));
        } else {
            output.push('Project tree not loaded.');
        }
        output.push('\n\n');

        output.push(`${sectionSeparator}\n`);
        output.push(`SELECTED FILES CONTENT\n`);
        output.push(`${sectionSeparator}\n\n`);

        let hasSelectedFilesContent = false;
        for (const selectedPath of this.selectedPaths) {
            const node = this.findNode(this.projectTree, selectedPath);
            if (node && node.type === 'file') {
                const fullPath = path.join(this.projectPath, selectedPath);
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    output.push(`--- File: ${selectedPath} ---\n`);
                    output.push(content);
                    output.push('\n\n');
                    fileCount++;
                    hasSelectedFilesContent = true;
                } catch (err) {
                    console.error(`Error reading file ${fullPath}: ${err.message}`);
                    output.push(`--- ERROR reading file: ${selectedPath} --- ${err.message}\n\n`);
                }
            }
        }

        if (!hasSelectedFilesContent) {
            output.push('No file contents were exported (either no files were selected, or selected paths were directories).');
        }
        output.push('\n');

        const exportsDir = path.join(process.cwd(), 'exports');
        if (!fs.existsSync(exportsDir)) {
            fs.mkdirSync(exportsDir, { recursive: true });
        }

        const projectName = path.basename(this.projectPath);
        const fileName = customName || this.generateUniqueFilename(`${projectName}_export`);
        const outputPath = path.join(exportsDir, fileName);

        fs.writeFileSync(outputPath, output.join(''));

        return {
            path: outputPath,
            directory: exportsDir,
            fileCount: fileCount
        };
    }

    findNode(node, targetPath) {
        if (node.path === targetPath) return node;
        if (node.children) {
            for (const child of node.children) {
                const found = this.findNode(child, targetPath);
                if (found) return found;
            }
        }
        return null;
    }

    getAllPaths(node, paths = []) {
        // The root node itself (path === '') is also selectable for 'select all' functionality
        paths.push(node.path);

        if (node.type === 'directory' && node.children) {
            node.children.forEach(child => this.getAllPaths(child, paths));
        }
        return paths;
    }
}

// Create HTTP server for the UI
const exporter = new ProjectExporter();

const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <title>Project Code Exporter</title>
    <meta charset="UTF-8"> <!-- Added: Meta tag for character encoding -->
    <style>
        body {
            font-family: Arial, sans-serif;
            margin: 20px;
            background-color: #f5f5f5;
        }
        .container {
            max-width: 1000px;
            margin: 0 auto;
            background: white;
            padding: 20px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        h1 {
            color: #333;
            text-align: center;
        }
        .input-group {
            margin-bottom: 20px;
            display: flex;
            gap: 10px;
        }
        input[type="text"] {
            flex: 1;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 16px;
        }
        button {
            padding: 10px 20px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 16px;
        }
        button:hover {
            background: #0056b3;
        }
        button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .tree-container {
            background: #f9f9f9;
            border: 1px solid #ddd;
            border-radius: 4px;
            padding: 20px;
            margin-bottom: 20px;
            max-height: 500px;
            overflow-y: auto;
        }
        .tree-item {
            margin: 2px 0;
            white-space: nowrap;
        }
        .tree-item label {
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            padding: 2px 5px;
            border-radius: 3px;
        }
        .tree-item.directory > label { /* Target only the label of a directory item for clickability */
            cursor: default; /* Remove pointer for label as toggle icon handles it */
        }
        .tree-item.file > label {
            cursor: pointer; /* Indicate file content is clickable */
        }
        .tree-item label:hover {
            background: #e9ecef;
        }
        .tree-item input[type="checkbox"] {
            margin-right: 8px;
            width: 16px;
            height: 16px;
            cursor: pointer;
        }
        .size {
            color: #666;
            font-size: 12px;
            margin-left: 10px;
        }
        .export-section {
            display: flex;
            gap: 10px;
            align-items: center;
            margin-top: 20px;
        }
        .export-section input {
            flex: 1;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
        }
        .status {
            margin-top: 20px;
            padding: 15px;
            border-radius: 4px;
            display: none;
        }
        .status.success {
            background: #d4edda;
            color: #155724;
            border: 1px solid #c3e6cb;
        }
        .status.error {
            background: #f8d7da;
            color: #721c24;
            border: 1px solid #f5c6cb;
        }
        .file-icon {
            margin-right: 5px;
        }
        /* Modified: .folder-icon now only applies to non-root folders */
        .folder-icon { 
            margin-right: 5px;
            color: #ffc107; /* Yellow for non-root folders */
        }
        /* New: style for the root folder icon */
        .root-folder-icon {
            margin-right: 5px;
            color: #333; /* Dark gray/black for the root folder */
        }
        .file-count {
            color: #666;
            margin-top: 10px;
        }

        /* New styles for tree controls, exclusions, and file preview */
        .tree-controls {
            margin-bottom: 15px;
            display: flex; /* Initially hidden, but set display property here */
            gap: 10px;
        }
        .tree-controls button {
            padding: 8px 15px;
            font-size: 14px;
        }
        .tree-controls input[type="text"] {
            flex: 1;
            padding: 8px;
            font-size: 14px;
        }

        .exclusion-controls {
            margin-top: 15px;
            margin-bottom: 20px;
            padding: 15px;
            background: #e6e6e6;
            border-radius: 4px;
            display: none; /* Initially hidden */
        }
        .exclusion-controls h3 {
            margin-top: 0;
            margin-bottom: 10px;
            color: #555;
            font-size: 16px;
        }
        .exclusion-controls label {
            margin-right: 15px;
            font-size: 14px;
            display: inline-block;
            cursor: pointer;
        }
        .exclusion-controls input[type="checkbox"] {
            margin-right: 5px;
        }

        .tree-item .toggle-icon {
            margin-right: 5px;
            font-size: 14px;
            color: #555;
            cursor: pointer;
            display: inline-block; /* Ensure it respects margin-right */
            width: 1em; /* Fixed width to prevent text reflow on toggle */
            text-align: center;
        }

        .file-content-preview {
            margin-top: 20px;
            padding: 20px;
            background: #fff;
            border: 1px solid #ddd;
            border-radius: 4px;
            max-height: 400px;
            overflow-y: auto;
            display: none; /* Initially hidden */
        }
        .file-content-preview h3 {
            margin-top: 0;
            color: #333;
            font-size: 18px;
            margin-bottom: 10px;
        }
        .file-content-preview pre {
            background: #eee;
            padding: 15px;
            border-radius: 4px;
            overflow-x: auto;
            white-space: pre-wrap; /* Ensure long lines wrap */
            word-wrap: break-word; /* Break long words */
        }
        .file-content-preview code {
            font-family: 'Consolas', 'Monaco', monospace;
            font-size: 14px;
            color: #333;
        }
        /* Style for the footer */
        .footer {
            text-align: center;
            margin-top: 40px;
            font-size: 12px;
            color: #888;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>📁 Project Code Exporter</h1>
        
        <div class="input-group">
            <input type="text" id="projectPath" placeholder="Enter project path (e.g., C:\\Users\\YourName\\Projects\\my-project)">
            <button onclick="loadProject()">Load Project</button>
        </div>

        <div class="tree-controls" style="display: none;">
            <button onclick="expandAll()">Expand All</button>
            <button onclick="collapseAll()">Collapse All</button>
            <input type="text" id="treeSearch" placeholder="Search files and folders..." oninput="filterTree()">
        </div>

        <div id="treeContainer" class="tree-container" style="display: none;"></div>
        
        <div class="exclusion-controls">
            <h3>Exclude common project artifacts:</h3>
            <label><input type="checkbox" id="excludeNodeModules" checked> node_modules</label>
            <label><input type="checkbox" id="excludeGit" checked> .git</label>
            <label><input type="checkbox" id="excludeVSCode" checked> .vscode</label>
            <label><input type="checkbox" id="excludePackageLock" checked> package-lock.json</label>
            <label><input type="checkbox" id="excludeYarnLock" checked> yarn.lock</label>
            <label><input type="checkbox" id="excludeBuild" checked> build</label>
            <label><input type="checkbox" id="excludeDist" checked> dist</label>
            <label><input type="checkbox" id="excludeTemp" checked> temp</label>
        </div>

        <div class="file-count" id="fileCount"></div>
        
        <div class="export-section" id="exportSection" style="display: none;">
            <input type="text" id="exportName" placeholder="Custom filename (optional)">
            <button onclick="exportFiles()">Export Selected Files</button>
        </div>

        <div id="fileContentPreview" class="file-content-preview">
            <h3>File Content: <span id="previewFileName"></span></h3>
            <pre><code id="fileContentCode"></code></pre>
        </div>
        
        <div id="status" class="status"></div>
    </div>

    <div class="footer">
        Made with ❤️ by YOAV M
    </div>

    <script>
        let projectData = null;
        let allTreeItems = []; // Stores references to all rendered tree item DOM elements

        async function loadProject() {
            const projectPath = document.getElementById('projectPath').value;
            if (!projectPath) {
                showStatus('Please enter a project path', 'error');
                return;
            }

            // Collect selected exclusion names based on their mapped values
            const activeExclusionNames = [];
            const exclusionCheckboxes = document.querySelectorAll('.exclusion-controls input[type="checkbox"]');
            const exclusionMap = {
                'excludeNodeModules': 'node_modules',
                'excludeGit': '.git',
                'excludeVSCode': '.vscode',
                'excludePackageLock': 'package-lock.json',
                'excludeYarnLock': 'yarn.lock',
                'excludeBuild': 'build',
                'excludeDist': 'dist',
                'excludeTemp': 'temp'
            };

            exclusionCheckboxes.forEach(checkbox => {
                if (checkbox.checked) {
                    const mappedName = exclusionMap[checkbox.id];
                    if (mappedName) {
                        activeExclusionNames.push(mappedName);
                    }
                }
            });

            try {
                const response = await fetch('/api/load', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: projectPath, exclusions: activeExclusionNames })
                });

                const data = await response.json();
                if (data.error) {
                    // Escaped backticks
                    showStatus(\`Error loading project: \${data.error}\`, 'error');
                    return;
                }

                projectData = data;
                renderTree(data.tree);
                document.getElementById('treeContainer').style.display = 'block';
                document.querySelector('.tree-controls').style.display = 'flex';
                document.querySelector('.exclusion-controls').style.display = 'block';
                document.getElementById('exportSection').style.display = 'flex';
                updateFileCount();
                // Escaped backticks
                showStatus(\`Project loaded successfully!\`, 'success');
                
                // Reset search and file preview
                document.getElementById('treeSearch').value = '';
                filterTree(); // Apply filter to show all initially
                document.getElementById('fileContentPreview').style.display = 'none';
                document.getElementById('fileContentCode').textContent = '';
                document.getElementById('previewFileName').textContent = '';

            } catch (err) {
                // Escaped backticks
                showStatus(\`Error loading project: \${err.message}\`, 'error');
            }
        }

        function renderTree(node, container = null, level = 0) {
            if (!container) {
                container = document.getElementById('treeContainer');
                container.innerHTML = ''; // Clear previous tree
                allTreeItems = []; // Reset list of all tree items
            }

            const item = document.createElement('div');
            item.className = 'tree-item ' + node.type; // Add 'directory' or 'file' class
            item.style.paddingLeft = (level * 20) + 'px';
            item.dataset.path = node.path; // Store relative path on the DOM element

            const label = document.createElement('label');
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = node.path;
            checkbox.onchange = (e) => {
                updateSelection(node.path, e.target.checked);
            };

            // Toggle icon for directories
            let toggleIcon = null;
            if (node.type === 'directory') {
                toggleIcon = document.createElement('span');
                toggleIcon.className = 'toggle-icon';
                toggleIcon.textContent = '▼'; // Default to expanded (down arrow)
                toggleIcon.onclick = (e) => {
                    e.stopPropagation(); // Prevent label click from also triggering this
                    toggleNode(item);
                };
                label.appendChild(toggleIcon);
            }

            // Modified: Assign different icon class based on whether it's the root folder
            const icon = document.createElement('span');
            let iconClass = '';
            let iconText = '';

            if (node.type === 'directory') {
                iconText = '📁';
                if (node.path === '') { // This is the root folder
                    iconClass = 'root-folder-icon'; // New class for the root
                } else { // This is any other folder
                    iconClass = 'folder-icon'; // Existing class for non-root folders
                }
            } else { // It's a file
                iconText = '📄';
                iconClass = 'file-icon'; // Existing class for files
            }
            icon.className = iconClass;
            icon.textContent = iconText;

            const name = document.createElement('span');
            // This line uses a regex literal, not a template literal, so backslashes are fine.
            name.textContent = node.path === '' ? document.getElementById('projectPath').value.split(/[\\/]/).pop() : node.name; 

            const size = document.createElement('span');
            size.className = 'size';
            size.textContent = '(' + node.formattedSize + ')';

            label.appendChild(checkbox);
            label.appendChild(icon);
            label.appendChild(name);
            label.appendChild(size);
            item.appendChild(label);
            container.appendChild(item);

            // Add click listener for file content preview (only for files)
            if (node.type === 'file') {
                label.onclick = (e) => {
                    // Only trigger preview if checkbox itself wasn't clicked
                    if (e.target !== checkbox) {
                        showFileContent(node.path, node.name);
                    }
                };
            }

            // Create a container for children nodes
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-children';
            item.appendChild(childrenContainer);

            if (node.children) {
                node.children.forEach(child => renderTree(child, childrenContainer, level + 1));
            }

            allTreeItems.push(item); // Add to the global list for filtering
        }

        // --- Tree Expansion/Collapse Functions ---
        function toggleNode(itemElement) {
            const childrenContainer = itemElement.querySelector('.tree-children');
            const toggleIcon = itemElement.querySelector('.toggle-icon');

            if (childrenContainer && toggleIcon) {
                if (childrenContainer.style.display === 'none') {
                    childrenContainer.style.display = 'block';
                    toggleIcon.textContent = '▼'; // Expanded
                } else {
                    childrenContainer.style.display = 'none';
                    toggleIcon.textContent = '►'; // Collapsed
                }
            }
        }

        function expandAll() {
            allTreeItems.forEach(itemElement => {
                if (itemElement.classList.contains('directory')) {
                    const childrenContainer = itemElement.querySelector('.tree-children');
                    const toggleIcon = itemElement.querySelector('.toggle-icon');
                    if (childrenContainer) childrenContainer.style.display = 'block';
                    if (toggleIcon) toggleIcon.textContent = '▼';
                }
            });
        }

        function collapseAll() {
            allTreeItems.forEach(itemElement => {
                // Do not collapse the very root container itself, only its children
                // The root element (level 0) often just holds the first set of children
                // We identify actual expandable directories by the presence of toggleIcon.
                if (itemElement.classList.contains('directory') && itemElement.querySelector('.toggle-icon')) {
                    const childrenContainer = itemElement.querySelector('.tree-children');
                    const toggleIcon = itemElement.querySelector('.toggle-icon');
                    if (childrenContainer) childrenContainer.style.display = 'none';
                    if (toggleIcon) toggleIcon.textContent = '►';
                }
            });
        }

        // --- Tree Search/Filter Function ---
        function filterTree() {
            const searchTerm = document.getElementById('treeSearch').value.toLowerCase();

            // First, hide everything
            allTreeItems.forEach(item => {
                item.style.display = 'none';
            });

            // Find all items that match the search term or are direct parents of a matched item
            const itemsToDisplay = new Set();
            allTreeItems.forEach(item => {
                const itemName = item.querySelector('label span:nth-child(3)').textContent.toLowerCase();
                if (itemName.includes(searchTerm)) {
                    itemsToDisplay.add(item);
                    // Also add all parent items to ensure they are visible
                    let currentPath = item.dataset.path;
                    while (currentPath !== '') {
                        const parentPath = currentPath.substring(0, currentPath.lastIndexOf('/'));
                        const parentItem = allTreeItems.find(i => i.dataset.path === parentPath);
                        if (parentItem) {
                            itemsToDisplay.add(parentItem);
                        }
                        currentPath = parentPath;
                    }
                }
            });

            // Display only the matched items and their necessary parents
            itemsToDisplay.forEach(item => {
                item.style.display = 'block';
                // When an item or its child is shown, ensure its parent directory is also expanded
                if (item.classList.contains('directory')) {
                    const childrenContainer = item.querySelector('.tree-children');
                    const toggleIcon = item.querySelector('.toggle-icon');
                    if (childrenContainer) childrenContainer.style.display = 'block';
                    if (toggleIcon) toggleIcon.textContent = '▼';
                }
            });
        }


        // --- File Content Preview Function ---
        async function showFileContent(filePath, fileName) {
            const previewContainer = document.getElementById('fileContentPreview');
            const previewFileName = document.getElementById('previewFileName');
            const fileContentCode = document.getElementById('fileContentCode');

            previewFileName.textContent = fileName;
            fileContentCode.textContent = 'Loading...';
            previewContainer.style.display = 'block';

            try {
                const response = await fetch('/api/file-content', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ path: filePath })
                });
                const data = await response.json();

                if (data.error) {
                    // Escaped backticks
                    fileContentCode.textContent = \`Error loading file: \${data.error}\`;
                    fileContentCode.style.color = 'red';
                } else {
                    fileContentCode.textContent = data.content;
                    fileContentCode.style.color = '#333'; // Reset color
                    // Optional: You could integrate a syntax highlighter library like highlight.js here
                    // For example: hljs.highlightElement(fileContentCode);
                }
            } catch (err) {
                // Escaped backticks
                fileContentCode.textContent = \`Network error: \${err.message}\`;
                fileContentCode.style.color = 'red';
            }
        }

        // --- Existing Functions (slightly modified or untouched) ---
        async function updateSelection(path, selected) {
            await fetch('/api/select', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ path, selected })
            });
            updateChildCheckboxes(path, selected); // Keep immediate visual feedback
            updateFileCount();
        }

        function updateChildCheckboxes(parentPath, selected) {
            const checkboxes = document.querySelectorAll('#treeContainer input[type="checkbox"]');
            checkboxes.forEach(checkbox => {
                if (checkbox.value === parentPath) {
                    checkbox.checked = selected;
                } else if (parentPath === '') {
                    // If the root was selected/deselected, affect all other checkboxes
                    checkbox.checked = selected;
                } else if (checkbox.value.startsWith(parentPath + '/')) {
                    checkbox.checked = selected;
                }
            });
        }

        async function updateFileCount() {
            const response = await fetch('/api/count');
            const data = await response.json();
            // Escaped backticks
            document.getElementById('fileCount').textContent = 
                \`Selected: \${data.fileCount} files\`;
        }

        async function exportFiles() {
            const customName = document.getElementById('exportName').value;
            
            try {
                const response = await fetch('/api/export', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ customName })
                });

                const data = await response.json();
                if (data.error) {
                    // Escaped backticks
                    showStatus(\`Error exporting files: \${data.error}\`, 'error');
                    return;
                }

                // Escaped backticks
                showStatus(\`✅ Exported \${data.fileCount} files to: \${data.path}\`, 'success');
                document.getElementById('exportName').value = '';
            } catch (err) {
                // Escaped backticks
                showStatus(\`Error exporting files: \${err.message}\`, 'error');
            }
        }

        function showStatus(message, type) {
            const status = document.getElementById('status');
            status.textContent = message;
            status.className = 'status ' + type;
            status.style.display = 'block';
            // Removed setTimeout for success messages to keep them visible
        }

        // --- Event Listeners ---
        document.getElementById('projectPath').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                loadProject();
            }
        });

        document.getElementById('exportName').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                exportFiles();
            }
        });

        // Add event listener for exclusion checkboxes to reload project when changed
        document.querySelectorAll('.exclusion-controls input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                if (projectData) { // Only reload if a project is already loaded
                    loadProject();
                }
            });
        });
    </script>
</body>
</html>
`; // This is the actual closing backtick for htmlContent

const server = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') {
        // Fix 1: Specify UTF-8 in the HTTP header
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(htmlContent);
    } else if (req.method === 'POST' && req.url === '/api/load') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                // Receive exclusions from client
                const { path: projectPath, exclusions } = JSON.parse(body);

                if (!fs.existsSync(projectPath)) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Path does not exist' }));
                    return;
                }

                const stats = fs.statSync(projectPath);
                if (!stats.isDirectory()) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Provided path is not a directory' }));
                    return;
                }

                exporter.projectPath = projectPath;
                // Pass the array of active exclusion names to buildTree
                // Use the provided exclusions array, or a default empty array if none provided
                exporter.projectTree = exporter.buildTree(projectPath, exclusions || []);
                exporter.selectedPaths.clear();

                // Add formatted size to nodes
                const addFormattedSize = (node) => {
                    node.formattedSize = exporter.formatFileSize(node.size);
                    if (node.children) {
                        node.children.forEach(addFormattedSize);
                    }
                };
                if (exporter.projectTree) {
                    addFormattedSize(exporter.projectTree);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ tree: exporter.projectTree }));
            } catch (err) {
                console.error("Error loading project:", err);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
    } else if (req.method === 'POST' && req.url === '/api/select') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            const { path, selected } = JSON.parse(body);
            const node = exporter.findNode(exporter.projectTree, path);

            if (node) {
                const allPaths = exporter.getAllPaths(node);
                if (selected) {
                    allPaths.forEach(p => exporter.selectedPaths.add(p));
                } else {
                    allPaths.forEach(p => exporter.selectedPaths.delete(p));
                }
            }

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
        });
    } else if (req.method === 'GET' && req.url === '/api/count') {
        let fileCount = 0;
        for (const path of exporter.selectedPaths) {
            const node = exporter.findNode(exporter.projectTree, path);
            if (node && node.type === 'file') {
                fileCount++;
            }
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ fileCount }));
    } else if (req.method === 'POST' && req.url === '/api/export') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { customName } = JSON.parse(body);

                if (exporter.selectedPaths.size === 0) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'No files selected' }));
                    return;
                }

                const result = exporter.exportToText(customName);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(result));
            } catch (err) {
                console.error("Export error:", err);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Export failed: ' + err.message }));
            }
        });
    } else if (req.method === 'POST' && req.url === '/api/file-content') {
        // New API endpoint to fetch file content
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const { path: relativePath } = JSON.parse(body);
                if (!relativePath) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'File path not provided' }));
                    return;
                }

                // Construct the full absolute path
                const fullPath = path.join(exporter.projectPath, relativePath);

                // Basic validation to prevent directory traversal outside projectPath
                // Ensure the resolved path is still within the project path
                if (!fullPath.startsWith(exporter.projectPath)) {
                    res.writeHead(403, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Access denied: Path outside project directory' }));
                    return;
                }

                if (!fs.existsSync(fullPath)) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'File does not exist' }));
                    return;
                }

                const stats = fs.statSync(fullPath);
                if (stats.isDirectory()) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Cannot display content of a directory' }));
                    return;
                }

                const content = fs.readFileSync(fullPath, 'utf8');
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ content }));
            } catch (err) {
                console.error(`Error reading file content for ${body}: ${err.message}`);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
    } else {
        res.writeHead(404);
        res.end();
    }
});

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`\n🚀 Project Code Exporter is running!`);
    console.log(`\n📌 Open your browser at: http://localhost:${PORT}`);
    console.log(`\n💡 Tip: Files will be exported to: ${path.join(process.cwd(), 'exports')}`);
    console.log(`\nPress Ctrl+C to stop the server\n`);

    if (process.platform === 'win32') {
        exec(`start http://localhost:${PORT}`);
    }
});
