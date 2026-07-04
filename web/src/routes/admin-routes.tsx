import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthLayout } from '@/components/layout/AuthLayout';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { KitchenLayout } from '@/components/layout/KitchenLayout';
import { RequireAuth } from '@/components/shared/RequireAuth';
import { LoginPage } from '@/modules/auth/LoginPage';
import { PlaceholderPage } from '@/modules/PlaceholderPage';
import { DashboardPage } from '@/modules/dashboard/DashboardPage';
import {
    MenuDishesPage,
    MenuCategoriesPage,
    MenuAllergensPage,
    MenuAdditivesPage,
} from '@/modules/menu/MenuPage';
import { DailyPage } from '@/modules/menu/DailyPage';
import { KitchenPage } from '@/modules/kitchen/KitchenPage';
import { OrdersPage } from '@/modules/orders/OrdersPage';
import { KassenbuchPage } from '@/modules/kassenbuch/KassenbuchPage';
import { OrderSettingsPage } from '@/modules/order-settings/OrderSettingsPage';
import { OpeningPage } from '@/modules/opening/OpeningPage';
import { AuditLogPage } from '@/modules/audit-log/AuditLogPage';
import { FeedbackPage } from '@/modules/feedback/FeedbackPage';
import { BackupPage } from '@/modules/backup/BackupPage';
import { PluginsPage } from '@/modules/plugins/PluginsPage';
import { LegalCookiesPage } from '@/modules/legal/LegalCookiesPage';
import { LegalTextsPage } from '@/modules/legal/LegalTextsPage';
import { QrCodesPage } from '@/modules/qrcodes/QrCodesPage';
import { ShiftsPage } from '@/modules/shifts/ShiftsPage';
import { ReservationsPage } from '@/modules/reservations/ReservationsPage';
import { ArchivePage } from '@/modules/reservations/ArchivePage';
import { TablePlannerPage } from '@/modules/table-planner/TablePlannerPage';
import {
    DesignerVisualsPage,
    DesignerLocationPage,
    DesignerVacationPage,
    DesignerHolidayPage,
} from '@/modules/designer/DesignerPage';
import {
    SettingsBrandingPage,
    SettingsUsersPage,
    SettingsSmtpPage,
    SettingsLicensePage,
    SettingsReservationsPage,
    SettingsImageAiPage,
    SettingsOrderEmailsPage,
} from '@/modules/settings/SettingsPage';
import { flattenNav } from '@/config/navigation';

// Bereits portierte Feature-Module (id → Komponente). Routen ohne Eintrag
// fallen übergangsweise auf PlaceholderPage zurück.
const PAGES: Record<string, React.ComponentType> = {
    dashboard: DashboardPage,
    orders: OrdersPage,
    kassenbuch: KassenbuchPage,
    'order-settings': OrderSettingsPage,
    opening: OpeningPage,
    'audit-log': AuditLogPage,
    feedback: FeedbackPage,
    backup: BackupPage,
    plugins: PluginsPage,
    'legal-cookies': LegalCookiesPage,
    'legal-texts': LegalTextsPage,
    qrcodes: QrCodesPage,
    shifts: ShiftsPage,
    reservations: ReservationsPage,
    archive: ArchivePage,
    'table-planner': TablePlannerPage,
    tables: TablePlannerPage,
    'home-editor': DesignerVisualsPage,
    location: DesignerLocationPage,
    vacation: DesignerVacationPage,
    holiday: DesignerHolidayPage,
    dishes: MenuDishesPage,
    daily: DailyPage,
    categories: MenuCategoriesPage,
    allergens: MenuAllergensPage,
    additives: MenuAdditivesPage,
    branding: SettingsBrandingPage,
    users: SettingsUsersPage,
    smtp: SettingsSmtpPage,
    license: SettingsLicensePage,
    'res-settings': SettingsReservationsPage,
    'image-ai': SettingsImageAiPage,
    'order-emails': SettingsOrderEmailsPage,
};

// Routen werden aus der NAV_CONFIG generiert → keine doppelte Navigationsquelle.
const navItems = flattenNav().filter((i) => !i.external);

export function AdminRoutes() {
    return (
        <HashRouter>
            <Routes>
                {/* Auth */}
                <Route element={<AuthLayout />}>
                    <Route path="/login" element={<LoginPage />} />
                    <Route
                        path="/password-change"
                        element={<PlaceholderPage title="Passwort ändern" />}
                    />
                </Route>

                {/* Küchen-Display (Vollbild, ohne Dashboard-Chrome) */}
                <Route element={<RequireAuth />}>
                    <Route element={<KitchenLayout />}>
                        <Route path="/kitchen" element={<KitchenPage />} />
                    </Route>
                </Route>

                {/* Geschützter Admin-Bereich */}
                <Route element={<RequireAuth />}>
                    <Route element={<DashboardLayout />}>
                        <Route index element={<Navigate to="/dashboard" replace />} />
                        {navItems.map((item) => {
                            const Page = PAGES[item.id];
                            return (
                                <Route
                                    key={item.id}
                                    path={item.path}
                                    element={
                                        Page ? <Page /> : <PlaceholderPage title={item.label} />
                                    }
                                />
                            );
                        })}
                    </Route>
                </Route>

                <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
        </HashRouter>
    );
}
