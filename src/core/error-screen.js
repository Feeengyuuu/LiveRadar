function applyStyles(element, styles) {
    element.style.cssText = styles;
    return element;
}

function createActionButton(label, styles, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    applyStyles(button, styles);
    button.addEventListener('click', onClick);
    return button;
}

export function renderErrorScreen({ container, errorMessage, errorStack, isDev, onReload, onClearCache }) {
    if (!container) return;

    container.replaceChildren();

    const wrapper = applyStyles(document.createElement('div'), 'display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:50vh;text-align:center;padding:2rem;');
    const icon = applyStyles(document.createElement('div'), 'font-size:4rem;margin-bottom:1rem;');
    icon.textContent = '⚠️';

    const title = applyStyles(document.createElement('h2'), 'color:#ef4444;font-size:1.5rem;margin-bottom:1rem;');
    title.textContent = '应用初始化失败';

    const message = applyStyles(document.createElement('p'), 'color:#9ca3af;margin-bottom:2rem;max-width:500px;');
    message.textContent = errorMessage;

    const actions = applyStyles(document.createElement('div'), 'display:flex;gap:1rem;');
    actions.append(
        createActionButton(
            '刷新页面',
            'background:#ef4444;color:white;padding:0.75rem 1.5rem;border-radius:0.5rem;border:none;cursor:pointer;font-weight:600;',
            onReload
        ),
        createActionButton(
            '清除缓存并刷新',
            'background:#6b7280;color:white;padding:0.75rem 1.5rem;border-radius:0.5rem;border:none;cursor:pointer;font-weight:600;',
            onClearCache
        )
    );

    wrapper.append(icon, title, message, actions);

    if (isDev && errorStack) {
        const details = applyStyles(document.createElement('details'), 'margin-top:2rem;text-align:left;max-width:600px;');
        const summary = applyStyles(document.createElement('summary'), 'cursor:pointer;color:#9ca3af;');
        summary.textContent = '技术详情';
        const pre = applyStyles(document.createElement('pre'), 'background:#1f1f1f;padding:1rem;border-radius:0.5rem;overflow-x:auto;margin-top:1rem;color:#ef4444;font-size:0.875rem;');
        pre.textContent = errorStack;
        details.append(summary, pre);
        wrapper.appendChild(details);
    }

    container.appendChild(wrapper);
}
