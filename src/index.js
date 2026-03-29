import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/index.css';
import App from './App';

const ensureMountNode = () => {
    const existing = document.getElementById('root')
        || document.getElementById('app')
        || document.getElementById('app-root')
        || document.querySelector('[data-react-root]');

    if (existing) {
        if (!existing.id) existing.id = 'root';
        return existing;
    }

    const mount = document.createElement('div');
    mount.id = 'root';
    mount.setAttribute('data-react-root', 'true');

    if (document.body) {
        document.body.prepend(mount);
    } else {
        document.documentElement.appendChild(mount);
    }

    return mount;
};

const mountApp = () => {
    const mountNode = ensureMountNode();
    const root = ReactDOM.createRoot(mountNode);

    root.render(
        <React.StrictMode>
            <App />
        </React.StrictMode>
    );
};

if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', mountApp, { once: true });
} else {
    mountApp();
}
