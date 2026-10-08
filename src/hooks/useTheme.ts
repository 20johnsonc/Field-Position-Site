// src/hooks/useTheme.ts
import { useState, useEffect } from 'react';

export type Theme = 'dark' | 'light';

export function useTheme() {
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    // Sync state with current document attribute set by inline script
    const currentTheme = 
      (document.documentElement.getAttribute('data-theme') as Theme) ||
      (localStorage.getItem('theme') as Theme) ||
      (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');

    setTheme(currentTheme);

    // Listen for theme updates triggered elsewhere on the page
    const handleThemeChange = (e: CustomEvent<Theme>) => {
      setTheme(e.detail);
    };

    window.addEventListener('theme-change' as any, handleThemeChange);
    return () => window.removeEventListener('theme-change' as any, handleThemeChange);
  }, []);

  const toggleTheme = () => {
    const nextTheme: Theme = theme === 'dark' ? 'light' : 'dark';
    
    // Update DOM & LocalStorage
    document.documentElement.setAttribute('data-theme', nextTheme);
    localStorage.setItem('theme', nextTheme);
    setTheme(nextTheme);

    // Broadcast change to other components on the page
    window.dispatchEvent(new CustomEvent('theme-change', { detail: nextTheme }));
  };

  return { theme, toggleTheme };
}