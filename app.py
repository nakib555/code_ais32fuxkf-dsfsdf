
# --- START OF FILE app.py ---

import os
import subprocess
from flask import Flask, request, jsonify, render_template
import google.generativeai as genai
from dotenv import load_dotenv
import logging
import platform
import re
import shutil
import markdown # Import markdown
from bs4 import BeautifulSoup # Import BeautifulSoup

import tools # Import from our tools file

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()
app = Flask(__name__)

GEMINI_API_KEY_FROM_ENV = os.getenv("GEMINI_API_KEY")
if GEMINI_API_KEY_FROM_ENV:
    logger.info("GEMINI_API_KEY found in .env. It can be used if no key is provided in the UI.")
else:
    logger.info("GEMINI_API_KEY not found in .env. AI chat will require the key to be entered in the UI.")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.join(SCRIPT_DIR, "project_files")


# --- PowerShell Configuration ---
MIN_PWSH_VERSION_TUPLE = (7, 5)
CONFIGURED_PWSH_INVOCATION = None

def _get_powershell_version_from_executable(executable_name):
    """Attempts to get PowerShell version (major, minor) from a given executable."""
    try:
        command = [
            executable_name,
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy", "Bypass",
            "-Command",
            "$PSVersionTable.PSVersion.ToString()"
        ]
        process = subprocess.run(command, shell=False, capture_output=True, text=True,
                                 timeout=10, encoding='utf-8', errors='ignore')
        if process.returncode == 0 and process.stdout:
            version_str = process.stdout.strip()
            match = re.match(r"(\d+)\.(\d+)(?:\.(\d+))?", version_str)
            if match:
                major = int(match.group(1))
                minor = int(match.group(2))
                return (major, minor)
        else:
            logger.debug(f"Version check for {executable_name} failed or no output. RC: {process.returncode}, Stdout: '{process.stdout}', Stderr: '{process.stderr}'")
    except FileNotFoundError:
        logger.debug(f"Executable '{executable_name}' not found during version check.")
    except subprocess.TimeoutExpired:
        logger.warning(f"Timeout while checking PowerShell version for {executable_name}.")
    except Exception as e:
        logger.warning(f"Error checking PowerShell version for {executable_name}: {e}")
    return None

def initialize_powershell_environment():
    global CONFIGURED_PWSH_INVOCATION
    logger.info("Initializing PowerShell environment check...")
    pwsh_exe_name = "pwsh"
    current_version = _get_powershell_version_from_executable(pwsh_exe_name)
    if current_version and current_version >= MIN_PWSH_VERSION_TUPLE:
        logger.info(
            f"Found compatible PowerShell Core ('{pwsh_exe_name}') version "
            f"{current_version[0]}.{current_version[1]}. It will be used for terminal commands."
        )
        CONFIGURED_PWSH_INVOCATION = [
            pwsh_exe_name, "-NoProfile", "-NonInteractive",
            "-ExecutionPolicy", "Bypass", "-Command"
        ]
        return
    if current_version:
        logger.warning(
            f"Found '{pwsh_exe_name}' version {current_version[0]}.{current_version[1]}, "
            f"but require version {MIN_PWSH_VERSION_TUPLE[0]}.{MIN_PWSH_VERSION_TUPLE[1]}+."
        )
    else:
        logger.warning(
            f"'{pwsh_exe_name}' (PowerShell Core {MIN_PWSH_VERSION_TUPLE[0]}.{MIN_PWSH_VERSION_TUPLE[1]}+) "
            "was not found in your system's PATH or its version could not be determined."
        )
    logger.warning("--- IMPORTANT ---")
    logger.warning(f"The integrated terminal feature requires PowerShell {MIN_PWSH_VERSION_TUPLE[0]}.{MIN_PWSH_VERSION_TUPLE[1]}+ (the 'pwsh' command).")
    logger.warning("Please install or update PowerShell Core.")
    logger.warning("Terminal command execution via the UI will be disabled.")
    logger.warning("---------------")
    CONFIGURED_PWSH_INVOCATION = None
# --- End PowerShell Configuration ---


# --- Helper functions for File System Tools ---
def _resolve_path_in_project(path_param):
    if not path_param:
        logger.warning(f"Path validation: Empty path_param received.")
        return None
    normalized_path = os.path.normpath(path_param.lstrip('/\\'))
    if normalized_path == '.' or normalized_path == '..' or '..' in normalized_path.split(os.sep):
        logger.warning(f"Path validation: Invalid or traversal path detected: {path_param} -> {normalized_path}")
        return None
    abs_path = os.path.join(PROJECT_ROOT, normalized_path)
    if not os.path.abspath(abs_path).startswith(os.path.abspath(PROJECT_ROOT)):
        logger.warning(f"Path access violation: {path_param} resolved to {os.path.abspath(abs_path)} which is outside {os.path.abspath(PROJECT_ROOT)}")
        return None
    return abs_path

def execute_write_file(relative_path, content):
    logger.info(f"Tool: Attempting to write file: {relative_path}")
    abs_path = _resolve_path_in_project(relative_path)
    if not abs_path:
        return {"tool_name": "tool_code_write_file", "path": relative_path, "status": "Error", "detail": "Invalid or disallowed path."}
    try:
        parent_dir = os.path.dirname(abs_path)
        if parent_dir and not os.path.exists(parent_dir):
             os.makedirs(parent_dir, exist_ok=True)
             logger.info(f"Tool: Created parent directory {parent_dir} for file {relative_path}")
        with open(abs_path, 'w', encoding='utf-8') as f:
            f.write(content)
        logger.info(f"Tool: Successfully wrote file: {abs_path}")
        return {"tool_name": "tool_code_write_file", "path": relative_path, "status": "Success", "detail": f"File '{relative_path}' written successfully."}
    except Exception as e:
        logger.error(f"Tool: Error writing file '{relative_path}': {e}", exc_info=True)
        return {"tool_name": "tool_code_write_file", "path": relative_path, "status": "Error", "detail": f"Failed to write file: {str(e)}"}

def execute_create_directory(relative_path):
    logger.info(f"Tool: Attempting to create directory: {relative_path}")
    abs_path = _resolve_path_in_project(relative_path)
    if not abs_path:
        return {"tool_name": "tool_code_create_directory", "path": relative_path, "status": "Error", "detail": "Invalid or disallowed path."}
    try:
        os.makedirs(abs_path, exist_ok=True)
        logger.info(f"Tool: Successfully created/ensured directory: {abs_path}")
        return {"tool_name": "tool_code_create_directory", "path": relative_path, "status": "Success", "detail": f"Directory '{relative_path}' created/ensured successfully."}
    except Exception as e:
        logger.error(f"Tool: Error creating directory '{relative_path}': {e}", exc_info=True)
        return {"tool_name": "tool_code_create_directory", "path": relative_path, "status": "Error", "detail": f"Failed to create directory: {str(e)}"}

def execute_delete_item(relative_path):
    logger.info(f"Tool: Attempting to delete item: {relative_path}")
    abs_path = _resolve_path_in_project(relative_path)
    if not abs_path:
        return {"tool_name": "tool_code_delete_item", "path": relative_path, "status": "Error", "detail": "Invalid or disallowed path."}
    if os.path.abspath(abs_path) == os.path.abspath(PROJECT_ROOT):
        logger.warning(f"Tool: Attempt to delete project root denied: {relative_path}")
        return {"tool_name": "tool_code_delete_item", "path": relative_path, "status": "Error", "detail": "Cannot delete the project root directory."}
    try:
        if os.path.isfile(abs_path):
            os.remove(abs_path)
            logger.info(f"Tool: Successfully deleted file: {abs_path}")
            return {"tool_name": "tool_code_delete_item", "path": relative_path, "status": "Success", "detail": f"File '{relative_path}' deleted successfully."}
        elif os.path.isdir(abs_path):
            shutil.rmtree(abs_path)
            logger.info(f"Tool: Successfully deleted directory: {abs_path}")
            return {"tool_name": "tool_code_delete_item", "path": relative_path, "status": "Success", "detail": f"Directory '{relative_path}' and its contents deleted successfully."}
        else:
            logger.warning(f"Tool: Item not found for deletion: {abs_path} (path param: {relative_path})")
            return {"tool_name": "tool_code_delete_item", "path": relative_path, "status": "Error", "detail": "Item not found."}
    except Exception as e:
        logger.error(f"Tool: Error deleting item '{relative_path}': {e}", exc_info=True)
        return {"tool_name": "tool_code_delete_item", "path": relative_path, "status": "Error", "detail": f"Failed to delete item: {str(e)}"}
# --- End Helper functions for File System Tools ---


# --- AI Response Rendering Function ---
def render_ai_response_html(raw_text):
    """
    Parses tool blocks from raw text, converts remaining markdown to HTML,
    and enhances the HTML structure for UI display (code blocks, task lists).
    Returns the rendered HTML and extracted frontend tool calls.
    """
    tool_calls = {
        'terminal_user': [],
        'code_editor': []
    }
    clean_markdown_text = raw_text

    # Regex to find all tool blocks
    # Use non-greedy match (.*?) and include newline in content match ([\s\S]*?)
    tool_regex = re.compile(r"`\s*(terminal|terminal_auto|tool_code_write_file|tool_code_create_directory|tool_code_delete_item|code_editor)\s*\n([\s\S]*?)\n\s*`", re.MULTILINE)

    # Find all matches and store them, then remove from the text
    # Use finditer to get match objects with start/end indices
    matches = list(tool_regex.finditer(raw_text))

    # Build clean_markdown_text by removing tool blocks
    # Process matches in reverse order to keep indices valid
    clean_markdown_text_parts = []
    last_idx = len(raw_text)
    for match in reversed(matches):
        tool_type = match.group(1)
        tool_content = match.group(2)

        # Add text *after* this match (in reverse order) to the parts list
        clean_markdown_text_parts.append(raw_text[match.end():last_idx])
        last_idx = match.start()

        # Store frontend-relevant tool calls
        if tool_type == 'terminal':
            tool_calls['terminal_user'].append(tool_content.strip())
        elif tool_type == 'code_editor':
            # Split path and content, handling potential '---' in content
            parts = tool_content.split('---\n', 1) # Split only on the first '---' followed by newline
            if len(parts) == 2:
                 file_path, file_content = parts[0].strip(), parts[1] # Keep content as is for now
                 if file_path:
                    tool_calls['code_editor'].append({'path': file_path, 'content': file_content})
                 else:
                    logger.warning(f"Malformed code_editor block (empty path): {tool_content[:100]}...")
            else:
                logger.warning(f"Malformed code_editor block (missing '---'): {tool_content[:100]}...")

    # Add text before the first match (or the whole text if no matches)
    clean_markdown_text_parts.append(raw_text[0:last_idx])
    clean_markdown_text_parts.reverse() # Reverse parts to get correct order
    clean_markdown_text = "".join(clean_markdown_text_parts).strip()

    # Convert remaining markdown to HTML
    # Use extensions for fenced code blocks and potentially others like tables, task lists (if available)
    # Python markdown doesn't have a built-in task list extension that matches the UI's icon style,
    # so we'll handle that with BeautifulSoup.
    html_content = markdown.markdown(clean_markdown_text, extensions=['fenced_code', 'tables', 'nl2br']) # nl2br adds <br> for newlines

    # Use BeautifulSoup to manipulate the HTML structure
    soup = BeautifulSoup(html_content, 'html.parser')

    # 1. Enhance Code Blocks
    for pre in soup.find_all('pre'):
        code = pre.find('code')
        if code:
            # Create the container div
            container = soup.new_tag('div')
            container['class'] = 'ai-code-block-container'

            # Create the footer div
            footer = soup.new_tag('div')
            footer['class'] = 'ai-code-block-footer'

            # Add footer content
            footer_left = soup.new_tag('div')
            footer_left['class'] = 'footer-left'

            # Copy button (placeholder - frontend JS adds listener)
            copy_button = soup.new_tag('button')
            copy_button['class'] = 'icon-button'
            copy_button['title'] = 'Copy code'
            copy_button.string = '📋' # Clipboard icon

            # Download button (placeholder - frontend JS adds listener)
            download_button = soup.new_tag('button')
            download_button['class'] = 'icon-button'
            download_button['title'] = 'Download code'
            download_button.string = '⬇️' # Download icon

            footer_left.append(copy_button)
            footer_left.append(download_button)

            footer_center = soup.new_tag('div')
            footer_center['class'] = 'footer-center'
            footer_center.string = 'Use code with caution.'

            footer_right = soup.new_tag('div')
            footer_right['class'] = 'footer-right'
            # Extract language from code class
            lang_class = next((cls for cls in code.get('class', []) if cls.startswith('language-')), None)
            language = lang_class.replace('language-', '').upper() if lang_class else 'PLAINTEXT'
            footer_right.string = language

            footer.append(footer_left)
            footer.append(footer_center)
            footer.append(footer_right)

            # Wrap the original <pre> and append the footer
            pre.wrap(container)
            container.append(footer)

            # Add line-numbers class to pre
            pre['class'] = pre.get('class', []) + ['line-numbers']

    # 2. Enhance Task Lists (Manual Parsing)
    for ul in soup.find_all('ul'):
        is_potential_task_list = True
        li_items = ul.find_all('li', recursive=False) # Only direct children
        if not li_items:
            is_potential_task_list = False

        if is_potential_task_list:
            for li in li_items:
                text_content = li.get_text().strip()
                # Check for common task list icons at the start
                if not re.match(r"^(✅|✔️|❌|🔄)\s*", text_content):
                    is_potential_task_list = False
                    break # Not a task list if any item doesn't match

        if is_potential_task_list:
            ul['class'] = ul.get('class', []) + ['ai-task-list']
            for li in li_items:
                li['class'] = li.get('class', []) + ['ai-task-item']
                original_content_soup = BeautifulSoup(str(li.decode_contents()), 'html.parser') # Parse li content separately

                icon_match = re.match(r"^(✅|✔️|❌|🔄)\s*", original_content_soup.get_text().strip())
                icon_text = ''
                icon_class = ''
                if icon_match:
                    icon_text = icon_match.group(1)
                    # Remove the icon text from the original content soup
                    # This is tricky with BeautifulSoup, simpler to work with string for icon removal
                    original_content_str = str(li.decode_contents())
                    original_content_str = original_content_str[icon_match.end():].strip()
                    original_content_soup = BeautifulSoup(original_content_str, 'html.parser') # Re-parse after removing icon

                    if icon_text in ['✅', '✔️']: icon_class = 'success'
                    elif icon_text == '❌': icon_class = 'error'
                    elif icon_text == '🔄': icon_class = 'pending'

                # Parse description and target from the cleaned content soup
                description_part = ''
                target_part = ''
                target_is_file = False # Flag to add file button

                # Look for <strong>...</strong> followed by optional ':' and then <code>...</code> or plain text
                strong_tag = original_content_soup.find('strong')
                if strong_tag:
                    description_part = str(strong_tag.decode_contents()).strip()
                    # Get text/html after the strong tag
                    rest_after_strong = ''.join(str(c) for c in strong_tag.next_siblings).strip()

                    code_tag = original_content_soup.find('code')
                    if code_tag:
                        target_part = str(code_tag.decode_contents()).strip()
                        # Assume code block target is a file path for now
                        target_is_file = True
                    elif rest_after_strong.startswith(':'):
                         target_part = rest_after_strong[1:].strip()
                         # Could add logic here to detect if target_part looks like a file path
                         if re.match(r"^[a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+$", target_part): # Simple check for file.ext format
                              target_is_file = True
                    else:
                         # If no code tag and no colon, the rest is part of the description
                         description_part += (f" {rest_after_strong}" if rest_after_strong else '')

                else:
                    # No strong tag, treat the whole content as description initially
                    description_part = str(original_content_soup.decode_contents()).strip()
                    # Check if it looks like "Description: Target" or "Description `Target`"
                    simple_target_match = re.match(r"(.*?):\s*([^`].*)", description_part)
                    code_target_match = re.match(r"(.*?)\s*`([^`]+)`", description_part)

                    if code_target_match:
                         description_part = code_target_match.group(1).strip()
                         target_part = code_target_match.group(2).strip()
                         target_is_file = True # Assume code block target is a file path
                    elif simple_target_match:
                         description_part = simple_target_match.group(1).strip()
                         target_part = simple_target_match.group(2).strip()
                         # Could add logic here to detect if target_part looks like a file path
                         if re.match(r"^[a-zA-Z0-9_/-]+\.[a-zA-Z0-9]+$", target_part): # Simple check for file.ext format
                              target_is_file = True


                # Reconstruct the li content
                li.clear() # Remove original contents

                icon_span = soup.new_tag('span')
                icon_span['class'] = ['ai-task-icon', icon_class] if icon_class else ['ai-task-icon']
                icon_span.string = icon_text

                content_span = soup.new_tag('span')
                content_span['class'] = 'ai-task-content'

                desc_span = soup.new_tag('span')
                desc_span['class'] = 'ai-task-description'
                desc_span.string = description_part

                content_span.append(desc_span)

                if target_part:
                    target_span = soup.new_tag('span')
                    target_span['class'] = 'ai-task-target'
                    target_span.string = target_part
                    content_span.append(target_span)

                li.append(icon_span)
                li.append(content_span)

                # Add button if it's a file task
                if target_is_file and target_part:
                     file_button = soup.new_tag('button')
                     file_button['class'] = ['button', 'ai-file-task-button']
                     file_button['data-filepath'] = target_part # Store path for frontend
                     file_button.string = 'View File' # Default text
                     # Adjust button text based on icon/description?
                     if 'create' in description_part.lower():
                          file_button.string = 'Create/View'
                     elif 'update' in description_part.lower():
                          file_button.string = 'Update/View'
                     elif 'view' in description_part.lower():
                          file_button.string = 'View File'

                     li.append(file_button)


    # 3. Enhance Headings (specifically the first H2)
    first_h2 = soup.find('h2')
    if first_h2:
        first_h2['class'] = first_h2.get('class', []) + ['ai-project-title']

    # 4. Enhance Terminal Command Blocks (already extracted, but add a class to the pre/code)
    # This step is actually handled by the frontend now, which creates a div around the pre/code and button.
    # We just need to ensure the frontend correctly identifies these blocks.
    # The regex parsing already removed them from the markdown text.
    # The frontend will receive the raw command strings in tool_calls['terminal_user']
    # and is responsible for creating the HTML structure for them.

    # Return the modified HTML and the frontend tool calls
    # Use prettify() for readability, or str(soup) for compactness
    return str(soup), tool_calls

# --- End AI Response Rendering Function ---


if not os.path.exists(PROJECT_ROOT):
    try:
        os.makedirs(PROJECT_ROOT)
        logger.info(f"Created project_files directory at: {PROJECT_ROOT}")
        with open(os.path.join(PROJECT_ROOT, "welcome.txt"), "w", encoding="utf-8") as f:
            f.write("Welcome to your AI Coding Agent's project space!\nClick on a file in the explorer to view its content.\nIf the AI suggests a command like `\terminal\ncommand_here\n` a run button will appear.\n")
        os.makedirs(os.path.join(PROJECT_ROOT, "src", "components"), exist_ok=True)
        with open(os.path.join(PROJECT_ROOT, "src", "components", "example.tsx"), "w", encoding="utf-8") as f:
            f.write("export const MyComponent = () => {\n  return <div>Hello, World!</div>;\n};\n")
        with open(os.path.join(PROJECT_ROOT, "vite.config.ts"), "w", encoding="utf-8") as f:
            f.write('''import { defineConfig } from "vite";\nimport react from "@vitejs/plugin-react-swc";\nimport path from "path";\n\nexport default defineConfig({\n  plugins: [react()],\n  server: { host: "::", port: 8080, },\n  resolve: { alias: { "@": path.resolve(__dirname, "./src"), }, },\n});\n''')
    except Exception as e:
        logger.error(f"Could not create project_files directory or example files: {e}")

@app.route('/')
def index():
    return render_template('index.html')

def execute_backend_command(command_str):
    if CONFIGURED_PWSH_INVOCATION is None:
        error_message = f"PowerShell {MIN_PWSH_VERSION_TUPLE[0]}.{MIN_PWSH_VERSION_TUPLE[1]}+ not configured."
        logger.error(f"Auto-execute failed: {error_message} for command: {command_str}")
        return {'output': error_message, 'return_code': -1, 'error': error_message}
    full_command_list = CONFIGURED_PWSH_INVOCATION + [command_str]
    logger.info(f"Backend executing: {' '.join(full_command_list)} in {PROJECT_ROOT}")
    try:
        process = subprocess.run(full_command_list, shell=False, capture_output=True, text=True,
                                 cwd=PROJECT_ROOT, timeout=30, encoding='utf-8', errors='ignore')
        output = process.stdout if process.stdout else ""
        if process.stderr:
            if output: output += "\n"
            output += f"STDERR: {process.stderr}"
        return {'output': output.strip(), 'return_code': process.returncode}
    except FileNotFoundError:
        error_msg = f"PowerShell executable '{CONFIGURED_PWSH_INVOCATION[0]}' not found."
        return {'output': error_msg, 'return_code': -1, 'error': error_msg}
    except subprocess.TimeoutExpired:
        error_msg = 'Auto-executed command timed out after 30s.'
        return {'output': error_msg, 'return_code': -1, 'error': error_msg}
    except Exception as e:
        return {'output': f'Error during auto-execution: {e}', 'return_code': -1, 'error': str(e)}


@app.route('/api/chat', methods=['POST'])
def chat_api():
    if not request.is_json:
        return jsonify({'error': 'Request must be JSON'}), 400
    data = request.get_json()
    user_message_from_client = data.get('message')
    api_key_from_user = data.get('apiKey', '').strip()
    model_name = data.get('model', 'gemini-1.5-flash-latest')
    chosen_api_key = api_key_from_user or GEMINI_API_KEY_FROM_ENV

    if not user_message_from_client: return jsonify({'error': 'No message provided'}), 400
    if not chosen_api_key: return jsonify({'error': 'API key is required.'}), 400

    full_prompt_to_ai = (tools.SYSTEM_PROMPT_PREAMBLE + "\n" + tools.TOOL_DOCUMENTATION + "\n\n" +
                         (user_message_from_client if user_message_from_client.startswith("[System Note:")
                          else "USER QUERY:\n" + user_message_from_client))
    logger.debug(f"Initial full prompt to AI (first call):\n{full_prompt_to_ai[:500]}...")

    try:
        genai.configure(api_key=chosen_api_key)
        model = genai.GenerativeModel(model_name)
        response1 = model.generate_content(full_prompt_to_ai)

        if not response1.candidates:
            block_reason_fb = response1.prompt_feedback.block_reason if response1.prompt_feedback else "Unknown"
            block_reason = block_reason_fb.name if hasattr(block_reason_fb, 'name') else str(block_reason_fb)
            logger.warning(f"Prompt blocked (call 1). Reason: {block_reason}. Feedback: {response1.prompt_feedback}")
            return jsonify({'error': f'Prompt blocked (call 1). Reason: {block_reason}'}), 400

        ai_response_text1 = response1.text
        logger.debug(f"AI Response (call 1):\n{ai_response_text1[:500]}...")

        # --- Backend Tool Execution (Auto only) ---
        executed_tool_results = []
        # Use the same regex pattern as in render_ai_response_html but only process auto tools
        tool_regex_auto = re.compile(r"`\s*(terminal_auto|tool_code_write_file|tool_code_create_directory|tool_code_delete_item)\s*\n([\s\S]*?)\n\s*`", re.MULTILINE)
        auto_tool_matches = list(tool_regex_auto.finditer(ai_response_text1))

        for match in auto_tool_matches:
            tool_type = match.group(1)
            tool_content = match.group(2)

            if tool_type == 'terminal_auto':
                command_to_auto_execute = tool_content.strip()
                logger.info(f"AI suggested auto-execution for command: '{command_to_auto_execute}'")
                execution_result = execute_backend_command(command_to_auto_execute)
                executed_tool_results.append({
                    "tool_name": "terminal_auto", "command": command_to_auto_execute,
                    "output": execution_result['output'], "return_code": execution_result['return_code']
                })
            elif tool_type == 'tool_code_write_file':
                parts = tool_content.split('---\n', 1)
                if len(parts) == 2:
                    file_path, file_content = parts[0].strip(), parts[1]
                    logger.info(f"AI suggested tool_code_write_file for path: '{file_path}'")
                    executed_tool_results.append(execute_write_file(file_path, file_content))
                else:
                    logger.warning(f"Malformed tool_code_write_file block (backend parse): {tool_content[:100]}...")
                    executed_tool_results.append({"tool_name": "tool_code_write_file", "path": "N/A", "status": "Error", "detail": "Malformed tool block."})
            elif tool_type == 'tool_code_create_directory':
                dir_path = tool_content.strip()
                logger.info(f"AI suggested tool_code_create_directory for path: '{dir_path}'")
                executed_tool_results.append(execute_create_directory(dir_path))
            elif tool_type == 'tool_code_delete_item':
                item_path = tool_content.strip()
                logger.info(f"AI suggested tool_code_delete_item for path: '{item_path}'")
                executed_tool_results.append(execute_delete_item(item_path))

        final_ai_response_text = ai_response_text1 # Start with the first response text
        files_affected_by_tools = []

        if executed_tool_results:
            tool_feedback_context_parts = ["[System Note: The following tools were automatically executed based on your previous response:]"]
            for res in executed_tool_results:
                part = f"\n--- Tool: {res['tool_name']} ---"
                if res['tool_name'] == 'terminal_auto':
                    part += f"\nCommand: `{res['command']}`\n<TerminalOutput>\n{res['output']}\n</TerminalOutput>\nReturn Code: {res['return_code']}"
                else: # File tools
                    part += f"\nPath: {res['path']}\nStatus: {res['status']}\nDetail: {res['detail']}"
                    if res.get("status") == "Success" and res.get("path"):
                         files_affected_by_tools.append(res["path"])
                tool_feedback_context_parts.append(part)
            tool_feedback_context = "\n".join(tool_feedback_context_parts)

            prompt_for_second_call = (
                f"{full_prompt_to_ai}\n\n[AI's Intermediate Response with Tool Calls:]\n{ai_response_text1}\n\n"
                f"{tool_feedback_context}\n\n[System Instruction: Now, please provide your final response to the original user query, "
                f"taking the results of the executed tools into account. The original user query context was:\n{user_message_from_client}\n"
                f"Please formulate your response directly to the user now, do not call any more tools in this turn.]"
            )
            logger.debug(f"Prompt for AI (second call after tool-exec, first 1000 chars):\n{prompt_for_second_call[:1000]}...")
            response2 = model.generate_content(prompt_for_second_call)

            if not response2.candidates:
                block_reason_fb = response2.prompt_feedback.block_reason if response2.prompt_feedback else "Unknown"
                block_reason = block_reason_fb.name if hasattr(block_reason_fb, 'name') else str(block_reason_fb)
                logger.warning(f"Prompt blocked (call 2). Reason: {block_reason}. Feedback: {response2.prompt_feedback}")
                tool_summary = "; ".join([f"{r['tool_name']}({r.get('path', r.get('command', 'N/A'))})->{r.get('status', r.get('return_code', 'N/A'))}" for r in executed_tool_results])
                return jsonify({'error': f'AI response generation failed after tool execution (call 2 blocked: {block_reason}). Tools attempted: {tool_summary}'}), 400

            final_ai_response_text = response2.text
            logger.debug(f"Final AI Response (after tool-exec call 2):\n{final_ai_response_text[:500]}...")

        # --- End Backend Tool Execution ---

        # --- Render the final AI response text to HTML ---
        rendered_html, frontend_tool_calls = render_ai_response_html(final_ai_response_text)
        # --- End Rendering ---

        return jsonify({
            'reply': rendered_html,
            'files_modified': files_affected_by_tools,
            'frontend_tool_calls': frontend_tool_calls # Send frontend tools back
        })

    except Exception as e:
        key_source_log = 'UI' if api_key_from_user else ('.env' if GEMINI_API_KEY_FROM_ENV else 'None')
        logger.error(f"Gemini API interaction error (model: {model_name}, key_source: {key_source_log}): {e}", exc_info=True)
        err_str = str(e).upper()
        if any(k in err_str for k in ["API_KEY_INVALID", "PERMISSION_DENIED", "AUTHENTICATION_FAILED", "INVALID_API_KEY"]):
            return jsonify({'error': 'API key is not valid.'}), 403
        if any(k in err_str for k in ["MODEL_NOT_FOUND", "RESOURCE_EXHAUSTED", "NAME_NOT_FOUND"]):
             return jsonify({'error': f'Gemini Model Error ({model_name}): {str(e)}'}), 404
        return jsonify({'error': f'Gemini API Error: {str(e)}'}), 500

@app.route('/api/list-models', methods=['POST'])
def list_models_api():
    if not request.is_json: return jsonify({'error': 'Request must be JSON'}), 400
    data = request.get_json()
    api_key_from_user = data.get('apiKey', '').strip()
    chosen_api_key = api_key_from_user or GEMINI_API_KEY_FROM_ENV
    if not chosen_api_key: return jsonify({'error': 'API key is required.'}), 400
    try:
        genai.configure(api_key=chosen_api_key)
        models_list = [{'name': m.name, 'display_name': m.display_name, 'description': m.description,
                        'version': m.version, 'supported_generation_methods': m.supported_generation_methods}
                       for m in genai.list_models() if 'generateContent' in m.supported_generation_methods]
        return jsonify({'models': models_list})
    except Exception as e:
        logger.error(f"Error listing models: {e}", exc_info=True)
        err_str = str(e).upper()
        if any(k in err_str for k in ["API_KEY_INVALID", "PERMISSION_DENIED", "AUTHENTICATION_FAILED", "INVALID_API_KEY"]):
            return jsonify({'error': 'API key is not valid.'}), 403
        return jsonify({'error': f'Error listing models: {str(e)}'}), 500

@app.route('/api/files', methods=['GET'])
def list_files_api():
    path_param = request.args.get('path', '').strip().lstrip('/\\')
    current_path = os.path.normpath(os.path.join(PROJECT_ROOT, path_param))
    if not os.path.abspath(current_path).startswith(os.path.abspath(PROJECT_ROOT)):
        return jsonify({"error": "Access denied."}), 403
    try:
        if not os.path.exists(current_path) or not os.path.isdir(current_path):
            return jsonify({"error": "Path does not exist or is not a directory."}), 404
        items = [{'name': i, 'is_dir': os.path.isdir(os.path.join(current_path, i)),
                  'path': os.path.join(path_param, i).replace('\\', '/')}
                 for i in os.listdir(current_path)]
        return jsonify(items)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/file-content', methods=['GET'])
def get_file_content_api():
    file_path_param = request.args.get('path', '').strip().lstrip('/\\')
    if not file_path_param: return jsonify({"error": "No file path provided"}), 400
    abs_file_path = _resolve_path_in_project(file_path_param)
    if not abs_file_path:
        return jsonify({"error": "Access denied or invalid file path."}), 403
    if os.path.isdir(abs_file_path): return jsonify({"error": "Path is a directory."}), 400
    try:
        with open(abs_file_path, 'r', encoding='utf-8', errors='ignore') as f: content = f.read()
        return jsonify({"content": content})
    except FileNotFoundError: return jsonify({"error": "File not found."}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/run-command', methods=['POST'])
def run_command_api():
    if not request.is_json: return jsonify({'error': 'Request must be JSON'}), 400
    if CONFIGURED_PWSH_INVOCATION is None:
        error_message = f"PowerShell {MIN_PWSH_VERSION_TUPLE[0]}.{MIN_PWSH_VERSION_TUPLE[1]}+ not configured."
        return jsonify({'error': error_message, 'output': error_message, 'return_code': -1}), 503
    data = request.get_json()
    command_str = data.get('command')
    if not command_str: return jsonify({'error': 'No command provided'}), 400
    execution_result = execute_backend_command(command_str)
    return jsonify(execution_result)

if __name__ == '__main__':
    initialize_powershell_environment()
    logger.info(f"AI Coding Agent Pro - DevUI starting on http://127.0.0.1:5001")
    logger.info(f"Project root: {PROJECT_ROOT}")
    if CONFIGURED_PWSH_INVOCATION:
        logger.info(f"Terminal commands will use: {' '.join(CONFIGURED_PWSH_INVOCATION)} <your_command>")
    else:
        logger.warning("Terminal command functionality is disabled as compatible PowerShell (pwsh 7.5+) was not found.")
    app.run(host='127.0.0.1', port=5001, debug=True)
# --- END OF FILE app.py ---