import { useViewTitle } from '@/hooks/useViewTitle';
import { CookiesTab } from '@/modules/designer/CookiesTab';

/** Aus DesignerPage.tsx herausgeloest (Plan-Schritt #11) – eigene Seite unter "Rechtliches". */
export function LegalCookiesPage() {
    useViewTitle('Cookies & Einwilligung');
    return <CookiesTab />;
}
