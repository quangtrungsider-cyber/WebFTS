import React from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import './index.css'; // Import global styles
import './main'; // Import legacy initialization
import AppShell from './app/AppShell';
import { ThemeProvider } from './theme/ThemeProvider';
import { I18nProvider } from './i18n';

import { AuthProvider } from './auth/AuthProvider';

document.addEventListener('DOMContentLoaded', () => {
    const rootElement = document.getElementById('react-root');
    if (rootElement) {
        const root = createRoot(rootElement);
        root.render(
            <ThemeProvider>
                <I18nProvider>
                    <AuthProvider>
                        <HashRouter>
                            <AppShell />
                        </HashRouter>
                    </AuthProvider>
                </I18nProvider>
            </ThemeProvider>
        );
    }
});
