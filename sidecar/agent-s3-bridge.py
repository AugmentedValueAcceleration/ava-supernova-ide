#!/usr/bin/env python3
"""
Agent S3 Bridge — NDJSON stdin/stdout wrapper for Agent S3 desktop automation.

Spawned by Ava's Node sidecar as a subprocess.
Communicates via single-line JSON objects on stdin (commands) and stdout (events).

CRITICAL: Never exec() Agent S3's returned Python code directly.
Parse into structured actions, validate, then execute known-safe pyautogui calls only.
"""

import json
import sys
import base64
import io
import re
import time
import traceback

# ── Globals ──────────────────────────────────────────────────────────────────

agent = None
grounding_agent = None
last_proposed_action = None
platform_name = None
settings = {}


# ── NDJSON I/O ───────────────────────────────────────────────────────────────

def emit(event: dict):
    """Send a JSON event to stdout (Node sidecar)."""
    sys.stdout.write(json.dumps(event) + '\n')
    sys.stdout.flush()


def emit_error(message: str, details: str = ''):
    emit({'event': 'error', 'message': message, 'details': details})


def emit_info(message: str):
    emit({'event': 'info', 'message': message})


# ── Screenshot Helpers ───────────────────────────────────────────────────────

def capture_screenshot_b64() -> tuple[str, int, int]:
    """Capture screen and return (base64_png, width, height)."""
    import pyautogui
    screenshot = pyautogui.screenshot()
    buf = io.BytesIO()
    screenshot.save(buf, format='PNG')
    b64 = base64.b64encode(buf.getvalue()).decode('utf-8')
    return b64, screenshot.width, screenshot.height


def capture_screenshot_bytes() -> tuple[bytes, int, int]:
    """Capture screen and return (png_bytes, width, height)."""
    import pyautogui
    screenshot = pyautogui.screenshot()
    buf = io.BytesIO()
    screenshot.save(buf, format='PNG')
    return buf.getvalue(), screenshot.width, screenshot.height


# ── Action Parser ────────────────────────────────────────────────────────────
# Agent S3 returns executable Python code strings. We parse them into
# structured actions instead of using exec(). Only known-safe pyautogui
# calls are recognised.

def parse_action_code(code: str) -> list[dict]:
    """Parse Agent S3's returned Python code into structured action dicts."""
    actions = []

    # pyautogui.click(x, y)
    for m in re.finditer(r'pyautogui\.click\(\s*(\d+)\s*,\s*(\d+)\s*\)', code):
        actions.append({'type': 'click', 'x': int(m.group(1)), 'y': int(m.group(2))})

    # pyautogui.doubleClick(x, y)
    for m in re.finditer(r'pyautogui\.doubleClick\(\s*(\d+)\s*,\s*(\d+)\s*\)', code):
        actions.append({'type': 'double_click', 'x': int(m.group(1)), 'y': int(m.group(2))})

    # pyautogui.rightClick(x, y)
    for m in re.finditer(r'pyautogui\.rightClick\(\s*(\d+)\s*,\s*(\d+)\s*\)', code):
        actions.append({'type': 'right_click', 'x': int(m.group(1)), 'y': int(m.group(2))})

    # pyautogui.moveTo(x, y)
    for m in re.finditer(r'pyautogui\.moveTo\(\s*(\d+)\s*,\s*(\d+)\s*\)', code):
        actions.append({'type': 'move', 'x': int(m.group(1)), 'y': int(m.group(2))})

    # pyautogui.write("text") or pyautogui.typewrite("text")
    for m in re.finditer(r'pyautogui\.(?:write|typewrite)\(\s*["\'](.+?)["\']\s*\)', code):
        actions.append({'type': 'type', 'text': m.group(1)})

    # pyautogui.press("key")
    for m in re.finditer(r'pyautogui\.press\(\s*["\'](.+?)["\']\s*\)', code):
        actions.append({'type': 'key', 'key': m.group(1)})

    # pyautogui.hotkey("ctrl", "s") etc
    hotkey_matches = re.finditer(r'pyautogui\.hotkey\(\s*(.+?)\s*\)', code)
    for m in hotkey_matches:
        keys_str = m.group(1)
        keys = [k.strip().strip("'\"") for k in keys_str.split(',')]
        actions.append({'type': 'key', 'key': '+'.join(keys)})

    # pyautogui.scroll(amount)
    for m in re.finditer(r'pyautogui\.scroll\(\s*(-?\d+)\s*\)', code):
        amount = int(m.group(1))
        actions.append({'type': 'scroll', 'direction': 'up' if amount > 0 else 'down', 'amount': abs(amount)})

    # pyautogui.drag(xOffset, yOffset)
    for m in re.finditer(r'pyautogui\.drag\(\s*(-?\d+)\s*,\s*(-?\d+)\s*', code):
        actions.append({'type': 'drag', 'dx': int(m.group(1)), 'dy': int(m.group(2))})

    # time.sleep(n) — preserve delays
    for m in re.finditer(r'time\.sleep\(\s*([\d.]+)\s*\)', code):
        actions.append({'type': 'wait', 'seconds': float(m.group(1))})

    # If nothing parsed, treat as unknown
    if not actions:
        actions.append({'type': 'unknown', 'raw_code': code[:500]})

    return actions


# ── Safe Action Executor ─────────────────────────────────────────────────────

def execute_action(action: dict):
    """Execute a single parsed action via pyautogui. Only known-safe calls."""
    import pyautogui
    pyautogui.FAILSAFE = True  # Move mouse to corner to abort

    action_type = action.get('type')

    if action_type == 'click':
        pyautogui.click(action['x'], action['y'])
    elif action_type == 'double_click':
        pyautogui.doubleClick(action['x'], action['y'])
    elif action_type == 'right_click':
        pyautogui.rightClick(action['x'], action['y'])
    elif action_type == 'move':
        pyautogui.moveTo(action['x'], action['y'])
    elif action_type == 'type':
        pyautogui.write(action['text'], interval=0.02)
    elif action_type == 'key':
        keys = action['key'].split('+')
        if len(keys) > 1:
            pyautogui.hotkey(*keys)
        else:
            pyautogui.press(keys[0])
    elif action_type == 'scroll':
        amount = action.get('amount', 3)
        if action.get('direction') == 'down':
            amount = -amount
        pyautogui.scroll(amount)
    elif action_type == 'drag':
        pyautogui.drag(action.get('dx', 0), action.get('dy', 0), duration=0.5)
    elif action_type == 'wait':
        time.sleep(min(action.get('seconds', 1), 5))  # Cap at 5 seconds
    elif action_type == 'unknown':
        emit_info(f"Skipped unknown action: {action.get('raw_code', '')[:100]}")
    else:
        emit_info(f"Unrecognised action type: {action_type}")


# ── Command Handlers ─────────────────────────────────────────────────────────

def handle_check_install(data: dict = None):
    """Check if gui-agents is installed and report status."""
    try:
        import gui_agents
        version = getattr(gui_agents, '__version__', 'unknown')
        emit({'event': 'install_status', 'installed': True, 'version': version})
    except ImportError:
        emit({'event': 'install_status', 'installed': False, 'version': None})

    # Also check pyautogui
    try:
        import pyautogui
        emit_info(f"pyautogui available, screen size: {pyautogui.size()}")
    except ImportError:
        emit_info("pyautogui not available")


def handle_init(data: dict):
    """Initialise Agent S3 with the provided settings."""
    global agent, grounding_agent, platform_name, settings

    settings = data.get('settings', {})
    platform_name = data.get('platform', 'windows')

    grounding_model = settings.get('groundingModel', 'openai')
    grounding_api_key = settings.get('groundingApiKey', '')
    grounding_base_url = settings.get('groundingBaseUrl', '')
    main_model = settings.get('mainModel', 'gpt-4o')
    main_provider = settings.get('mainProvider', 'openai')

    try:
        from gui_agents.s3.agents.agent_s import AgentS3
        from gui_agents.s3.agents.grounding import OSWorldACI

        # Configure main model
        engine_params = {
            'engine_type': main_provider,
            'model': main_model,
        }
        if grounding_api_key and main_provider == 'openai':
            import os
            os.environ['OPENAI_API_KEY'] = grounding_api_key
        elif grounding_api_key and main_provider == 'anthropic':
            import os
            os.environ['ANTHROPIC_API_KEY'] = grounding_api_key

        # Configure grounding model
        engine_params_grounding = {
            'engine_type': grounding_model,
            'model': settings.get('groundingModelId', 'ui-tars-1.5-7b'),
        }
        if grounding_base_url:
            engine_params_grounding['base_url'] = grounding_base_url

        # Screen dimensions for grounding
        import pyautogui
        screen_w, screen_h = pyautogui.size()
        engine_params_grounding['grounding_width'] = screen_w
        engine_params_grounding['grounding_height'] = screen_h

        grounding_agent = OSWorldACI(
            platform=platform_name,
            engine_params_for_generation=engine_params,
            engine_params_for_grounding=engine_params_grounding,
        )

        agent = AgentS3(engine_params, grounding_agent, platform=platform_name)

        emit({'event': 'ready', 'platform': platform_name, 'screen': {'w': screen_w, 'h': screen_h}})

    except Exception as e:
        emit_error(f"Failed to initialise Agent S3: {e}", traceback.format_exc())


def handle_predict(data: dict):
    """Run Agent S3 predict on the current screen state."""
    global last_proposed_action

    if not agent:
        emit_error("Agent S3 not initialised. Send 'init' first.")
        return

    task = data.get('task', '')
    context = data.get('context', '')
    step = data.get('step', 1)
    max_steps = data.get('maxSteps', 50)

    if step > max_steps:
        emit({'event': 'done', 'reason': 'max_steps', 'summary': f'Reached max steps ({max_steps})'})
        return

    try:
        # Capture screenshot
        screenshot_bytes, screen_w, screen_h = capture_screenshot_bytes()
        screenshot_b64, _, _ = capture_screenshot_b64()

        # Build instruction with context
        instruction = task
        if context:
            instruction = f"{context}\n\nTask: {task}"

        # Call Agent S3
        obs = {'screenshot': screenshot_bytes}
        info, action_code_list = agent.predict(instruction=instruction, observation=obs)

        if not action_code_list or not action_code_list[0]:
            emit({'event': 'done', 'reason': 'no_action', 'summary': 'Agent S3 returned no action — task may be complete.'})
            return

        raw_code = action_code_list[0]

        # Check if Agent S3 signals done
        if 'DONE' in raw_code.upper() or 'task_completed' in raw_code.lower():
            emit({'event': 'done', 'reason': 'completed', 'summary': str(info), 'screenshot': screenshot_b64})
            return

        # Parse into structured actions
        parsed_actions = parse_action_code(raw_code)
        last_proposed_action = parsed_actions

        emit({
            'event': 'action_proposed',
            'step': step,
            'actions': parsed_actions,
            'thought': str(info)[:500],
            'raw_code': raw_code[:500],
            'screenshot_before': screenshot_b64,
            'screen': {'w': screen_w, 'h': screen_h},
        })

    except Exception as e:
        emit_error(f"Predict failed: {e}", traceback.format_exc())


def handle_execute_action(data: dict):
    """Execute the last proposed action (after sidecar validation)."""
    global last_proposed_action

    if not last_proposed_action:
        emit_error("No pending action to execute.")
        return

    actions = last_proposed_action
    last_proposed_action = None
    delay = settings.get('actionDelay', 500) / 1000.0  # Convert ms to seconds

    try:
        for i, action in enumerate(actions):
            if action['type'] == 'unknown':
                emit_info(f"Skipping unknown action")
                continue

            execute_action(action)

            # Delay between actions
            if i < len(actions) - 1 and delay > 0:
                time.sleep(delay)

        # Capture after-screenshot
        time.sleep(0.3)  # Brief pause for screen to update
        screenshot_b64, _, _ = capture_screenshot_b64()

        emit({
            'event': 'action_executed',
            'actions': actions,
            'screenshot_after': screenshot_b64,
        })

    except Exception as e:
        emit_error(f"Action execution failed: {e}", traceback.format_exc())


def handle_skip_action(data: dict):
    """Skip the last proposed action."""
    global last_proposed_action
    last_proposed_action = None
    emit({'event': 'action_skipped', 'reason': data.get('reason', 'user_denied')})


def handle_cancel(data: dict = None):
    """Cancel the current task."""
    global last_proposed_action
    last_proposed_action = None
    emit({'event': 'cancelled'})


# ── Main Loop ────────────────────────────────────────────────────────────────

def main():
    emit_info("Agent S3 bridge starting...")

    handlers = {
        'check_install': handle_check_install,
        'init': handle_init,
        'predict': handle_predict,
        'execute_action': handle_execute_action,
        'skip_action': handle_skip_action,
        'cancel': handle_cancel,
    }

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue

        try:
            data = json.loads(line)
        except json.JSONDecodeError:
            emit_error(f"Invalid JSON: {line[:100]}")
            continue

        cmd = data.get('cmd', '')
        handler = handlers.get(cmd)

        if handler:
            try:
                handler(data)
            except Exception as e:
                emit_error(f"Handler '{cmd}' failed: {e}", traceback.format_exc())
        else:
            emit_error(f"Unknown command: {cmd}")


if __name__ == '__main__':
    main()
