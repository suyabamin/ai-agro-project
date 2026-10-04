import React, { useEffect, useState } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Navigation } from './Navigation';
import { PreferenceControls } from './PreferenceControls';
import { NotificationsMenu } from './NotificationsMenu';
import { ErrorBoundary } from './common/ErrorBoundary';
import { apiService } from '../services/api';
import type { HealthResponse } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import { ECOSYSTEM_UPDATED_EVENT, getFarms } from '../services/ecosystem';

export const Layout: React.FC = () => {
  const [backendHealth, setBackendHealth] = useState<HealthResponse | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const navigate = useNavigate();
  const { userProfile, userRole, logout } = useAuth();
  const { t, translateEnum } = useI18n();

  const [farmName, setFarmName] = useState('Green Valley Farm');
  const [farmLocation, setFarmLocation] = useState('Sector 4 — Salinas Valley, CA');

  const loadFarmHeader = () => {
    getFarms().then((farms) => {
      if (farms && farms.length > 0) {
        setFarmName(farms[0].name);
        setFarmLocation(farms[0].location);
      }
    });
  };

  useEffect(() => {
    apiService.healthCheck().then(setBackendHealth);
    loadFarmHeader();
    window.addEventListener(ECOSYSTEM_UPDATED_EVENT, loadFarmHeader);
    return () => window.removeEventListener(ECOSYSTEM_UPDATED_EVENT, loadFarmHeader);
  }, []);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) setMobileNavOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!userMenuOpen) return;
    const close = () => setUserMenuOpen(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [userMenuOpen]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  const displayName = userProfile?.fullName || t('common.enums.roles.farmOperator');
  const initials = displayName
    .split(' ')
    .map((n: string) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="flex min-h-screen bg-surface text-on-surface font-body-md">
      <Navigation
        health={backendHealth}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <div className="flex flex-col min-h-screen w-full lg:pl-[240px]">
        <header
          className="fixed top-0 right-0 h-16 bg-surface-container-lowest z-40 flex items-center justify-between px-margin left-0 lg:left-[240px]"
          style={{
            borderBottom: '1px solid var(--app-outline-variant)',
            boxShadow: 'var(--app-shadow)',
          }}
        >
          <div className="flex items-center gap-space-sm min-w-0">
            <button
              className="p-space-xs rounded-lg text-on-surface-variant lg:hidden"
              onClick={() => setMobileNavOpen(true)}
              aria-label={t('accessibility.openNavigation')}
              type="button"
            >
              <span className="material-symbols-outlined" style={{ fontSize: '22px' }} aria-hidden="true">menu</span>
            </button>

            <span className="material-symbols-outlined text-secondary shrink-0" style={{ fontSize: '20px' }} aria-hidden="true">
              eco
            </span>
            <div className="flex items-center gap-space-xs truncate">
              <span className="font-headline-sm text-on-surface font-semibold truncate">{farmName}</span>
              <span className="text-outline font-label-md" aria-hidden="true">•</span>
              <span className="font-body-md text-on-surface-variant truncate hidden md:block">{farmLocation}</span>
            </div>
          </div>

          <div className="flex items-center gap-gutter-lg shrink-0">
            <div
              className="hidden xl:flex items-center gap-space-xs bg-surface px-space-md py-space-xs rounded-lg text-on-surface-variant font-data-mono"
              style={{ border: '1px solid var(--app-outline-variant)' }}
            >
              <span className="material-symbols-outlined text-secondary" style={{ fontSize: '18px' }} aria-hidden="true">partly_cloudy_day</span>
              <span>{t('layout.clearWeather')}</span>
              <span className="text-outline-variant" aria-hidden="true">|</span>
              <span>{t('layout.humidity', { value: '58' })}</span>
              <span className="text-outline-variant" aria-hidden="true">|</span>
              <span>{t('layout.wind', { speed: '9', direction: 'NW' })}</span>
            </div>

            <div className="flex items-center gap-space-md">
              <PreferenceControls compact />

              <NotificationsMenu />

              <div className="h-6 w-px bg-outline-variant" style={{ opacity: 0.4 }} aria-hidden="true" />

              <div style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setUserMenuOpen((o) => !o); }}
                  className="flex items-center gap-space-sm"
                  aria-label={t('accessibility.userMenu')}
                  aria-haspopup="true"
                  aria-expanded={userMenuOpen}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: '8px' }}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: 'linear-gradient(135deg, #2d6a4f 0%, #40916c 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      border: '2px solid var(--app-outline-variant)',
                      flexShrink: 0,
                    }}
                    aria-hidden="true"
                  >
                    <span style={{ fontSize: '12px', fontWeight: 700, color: '#fff', fontFamily: 'Inter, sans-serif', letterSpacing: '0.5px' }}>
                      {initials}
                    </span>
                  </div>
                  <div className="hidden md:flex flex-col text-left">
                    <span className="font-label-md text-on-surface font-semibold leading-tight flex items-center gap-1.5">
                      {displayName}
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-primary-container text-on-primary font-bold uppercase">
                        {translateEnum('common.enums.roles', userRole, userRole)}
                      </span>
                    </span>
                    <span className="font-label-sm text-on-surface-variant leading-tight">
                      {backendHealth?.status === 'ok' ? t('layout.systemOnline') : t('layout.demoMode')}
                    </span>
                  </div>
                  <span className="material-symbols-outlined text-on-surface-variant hidden md:block" style={{ fontSize: '18px' }} aria-hidden="true">
                    {userMenuOpen ? 'expand_less' : 'expand_more'}
                  </span>
                </button>

                {userMenuOpen && (
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="bg-surface-container-lowest rounded-xl border shadow-lg"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 8px)',
                      right: 0,
                      minWidth: '220px',
                      borderColor: 'var(--app-outline-variant)',
                      zIndex: 100,
                      overflow: 'hidden',
                      fontFamily: 'Inter, Noto Sans Bengali, sans-serif',
                    }}
                  >
                    <div className="p-space-md" style={{ borderBottom: '1px solid var(--app-outline-variant)' }}>
                      <div className="flex items-center justify-between gap-space-sm">
                        <p className="m-0 text-sm font-semibold text-on-surface truncate">{displayName}</p>
                        <span className="px-2 py-0.5 rounded text-[10px] bg-primary-container text-on-primary font-bold uppercase">
                          {translateEnum('common.enums.roles', userRole, userRole)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-on-surface-variant truncate">{userProfile?.email || 'farmer@agroai.app'}</p>
                    </div>

                    <div className="p-space-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          navigate(userRole === 'farmer' ? '/farmer-dashboard' : '/owner-dashboard');
                        }}
                        className="w-full flex items-center gap-space-sm px-space-sm py-space-xs rounded-lg text-left text-sm font-semibold text-primary hover:bg-surface-container"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">
                          {userRole === 'farmer' ? 'assignment_turned_in' : 'admin_panel_settings'}
                        </span>
                        {t('layout.goToMyWorkspace')}
                      </button>

                      <button
                        type="button"
                        onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
                        className="w-full flex items-center gap-space-sm px-space-sm py-space-xs rounded-lg text-left text-sm font-semibold text-on-surface hover:bg-surface-container"
                      >
                        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '18px' }} aria-hidden="true">settings</span>
                        {t('navigation.settings')}
                      </button>

                      <div className="h-px bg-outline-variant my-1" aria-hidden="true" />
                      <button
                        id="logout-btn"
                        type="button"
                        onClick={handleLogout}
                        className="w-full flex items-center gap-space-sm px-space-sm py-space-xs rounded-lg text-left text-sm font-semibold text-error hover:bg-error-container"
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden="true">logout</span>
                        {t('layout.signOut')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 pt-16 bg-surface min-h-screen">
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
};
