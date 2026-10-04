import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useI18n } from '../i18n';
import type { NotificationItem } from '../services/ecosystem';
import {
  listenToNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  approveAssignmentRequest,
  rejectAssignmentRequest,
  notifyEcosystemChange,
} from '../services/ecosystem';

export const NotificationsMenu: React.FC = () => {
  const { user, userRole } = useAuth();
  const { t, formatDate } = useI18n();
  const navigate = useNavigate();

  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'applications' | 'alerts'>('all');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [liveToast, setLiveToast] = useState<NotificationItem | null>(null);

  const menuRef = useRef<HTMLDivElement>(null);
  const isOwner = userRole === 'owner' || (!userRole && user?.email?.includes('owner'));
  const activeUid = user?.uid || (userRole === 'farmer' ? 'farmer_01' : 'owner_demo');

  // Real-time listener for incoming notifications
  useEffect(() => {
    const unsub = listenToNotifications(
      activeUid,
      (list) => {
        setNotifications(list);
      },
      userRole
    );

    // Live popup toast on newly received notification
    const handleNewNotif = (e: any) => {
      const notif: NotificationItem = e.detail;
      if (notif) {
        // Show live toast banner for 6 seconds
        setLiveToast(notif);
        setTimeout(() => {
          setLiveToast((curr) => (curr?.id === notif.id ? null : curr));
        }, 6000);
      }
    };

    window.addEventListener('agroai-notification-received', handleNewNotif);

    return () => {
      unsub();
      window.removeEventListener('agroai-notification-received', handleNewNotif);
    };
  }, [activeUid, userRole]);

  // Click outside listener to close dropdown
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const filteredNotifications = notifications.filter((n) => {
    if (filter === 'applications') return n.type === 'assignment';
    if (filter === 'alerts') return n.type !== 'assignment';
    return true;
  });

  const handleMarkAllRead = async () => {
    await markAllNotificationsAsRead(activeUid, userRole);
  };

  const handleNotificationClick = async (notif: NotificationItem) => {
    if (!notif.read) {
      await markNotificationAsRead(notif.id);
    }
    if (notif.requestId) {
      if (isOwner) {
        navigate('/farmers?tab=assignments');
      } else {
        navigate('/farmer-dashboard');
      }
      setIsOpen(false);
    }
  };

  // Quick Inline Approve for Owner
  const handleApproveApplication = async (e: React.MouseEvent, reqId: string, notifId: string) => {
    e.stopPropagation();
    setActionLoadingId(reqId);
    try {
      const res = await approveAssignmentRequest(reqId);
      if (res.success) {
        await markNotificationAsRead(notifId);
        notifyEcosystemChange();
      } else {
        alert(res.error || 'Failed to approve application');
      }
    } catch (err: any) {
      alert(err?.message || 'Error approving application');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Quick Inline Decline for Owner
  const handleDeclineApplication = async (e: React.MouseEvent, reqId: string, notifId: string) => {
    e.stopPropagation();
    setActionLoadingId(reqId);
    try {
      const res = await rejectAssignmentRequest(reqId);
      if (res.success) {
        await markNotificationAsRead(notifId);
        notifyEcosystemChange();
      } else {
        alert(res.error || 'Failed to decline application');
      }
    } catch (err: any) {
      alert(err?.message || 'Error declining application');
    } finally {
      setActionLoadingId(null);
    }
  };

  const formatRelativeTime = (rawTime: any) => {
    if (!rawTime) return 'Just now';
    const date = rawTime?.toDate ? rawTime.toDate() : new Date(rawTime);
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return formatDate(date, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* ── Bell Trigger Button ── */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="relative p-2 rounded-xl text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all cursor-pointer flex items-center justify-center"
        aria-label={t('layout.notifications', 'Notifications')}
        title={t('layout.notifications', 'Notifications')}
        aria-expanded={isOpen}
      >
        <span className="material-symbols-outlined text-[22px]" aria-hidden="true">
          {unreadCount > 0 ? 'notifications_active' : 'notifications'}
        </span>

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-error text-on-error text-[10px] font-bold rounded-full flex items-center justify-center shadow-xs animate-pulse">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* ── Floating Real-Time Toast Banner ── */}
      {liveToast && (
        <div className="fixed top-20 right-4 z-50 max-w-sm w-full bg-surface-container-lowest border border-primary/40 p-4 rounded-2xl shadow-xl flex items-start gap-3 animate-slide-in">
          <div className="w-9 h-9 rounded-xl bg-primary text-on-primary flex items-center justify-center shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[18px]">
              {liveToast.type === 'assignment' ? 'assignment_ind' : 'notifications'}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-1">
              <span className="font-semibold text-xs text-primary uppercase tracking-wider">
                {liveToast.title}
              </span>
              <button
                type="button"
                onClick={() => setLiveToast(null)}
                className="text-on-surface-variant hover:text-on-surface text-xs leading-none p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>
            <p className="text-body-sm text-xs text-on-surface mt-0.5 line-clamp-2">
              {liveToast.message}
            </p>
            {liveToast.type === 'assignment' && isOwner && (
              <div className="flex items-center gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => {
                    setLiveToast(null);
                    setIsOpen(true);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-primary text-on-primary text-[11px] font-semibold hover:opacity-95 shadow-2xs"
                >
                  {t('layout.reviewAndAssign', 'Review & Assign')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Dropdown Popover ── */}
      {isOpen && (
        <div
          className="absolute right-0 mt-2 w-[380px] sm:w-[420px] max-w-[calc(100vw-2rem)] bg-surface-container-lowest rounded-2xl shadow-2xl border border-outline-variant/40 z-50 flex flex-col overflow-hidden animate-fade-in"
          style={{ maxHeight: 'calc(100vh - 5rem)' }}
        >
          {/* Header */}
          <div className="p-4 border-b border-outline-variant/30 flex items-center justify-between bg-surface-container-low/50">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">notifications</span>
              <span className="font-headline-sm text-body-md font-bold text-on-surface">
                {t('layout.notifications', 'Notifications')}
              </span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-[11px] font-bold">
                  {unreadCount} new
                </span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-xs font-semibold text-primary hover:underline cursor-pointer"
              >
                {t('layout.markAllRead', 'Mark all read')}
              </button>
            )}
          </div>

          {/* Filter Pills */}
          <div className="px-4 py-2 border-b border-outline-variant/20 flex items-center gap-1.5 bg-surface-container-low/20">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                filter === 'all'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {t('layout.filterAll', 'All')} ({notifications.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter('applications')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                filter === 'applications'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">assignment_ind</span>
              <span>{t('layout.filterApplications', 'Applications')}</span>
            </button>
            <button
              type="button"
              onClick={() => setFilter('alerts')}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                filter === 'alerts'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {t('layout.filterAlerts', 'Alerts')}
            </button>
          </div>

          {/* Notifications Scroll List */}
          <div className="flex-1 overflow-y-auto divide-y divide-outline-variant/20 max-h-[380px]">
            {filteredNotifications.length === 0 ? (
              <div className="py-12 px-4 flex flex-col items-center justify-center text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-[36px] text-outline mb-2">
                  notifications_off
                </span>
                <span className="text-body-sm font-medium">
                  {t('layout.notificationsEmpty', 'No notifications yet')}
                </span>
              </div>
            ) : (
              filteredNotifications.map((notif) => {
                const isApplication = notif.type === 'assignment';
                const isPending = notif.actionStatus === 'pending';

                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={`p-3.5 hover:bg-surface-container/40 transition-colors cursor-pointer flex items-start gap-3 ${
                      !notif.read ? 'bg-primary/5' : ''
                    }`}
                  >
                    {/* Type Icon */}
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isApplication
                          ? 'bg-secondary/15 text-secondary border border-secondary/30'
                          : 'bg-primary/10 text-primary border border-primary/20'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">
                        {isApplication ? 'assignment_ind' : 'info'}
                      </span>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-semibold text-xs text-on-surface truncate">
                          {notif.title}
                        </span>
                        <span className="text-[10px] text-on-surface-variant shrink-0">
                          {formatRelativeTime(notif.createdAt)}
                        </span>
                      </div>

                      <p className="text-body-sm text-xs text-on-surface-variant mt-0.5 line-clamp-2">
                        {notif.message}
                      </p>

                      {/* Application Info & Quick Actions for Owner */}
                      {isApplication && (
                        <div className="mt-2 pt-2 border-t border-outline-variant/20 flex flex-col gap-1.5">
                          {notif.fieldName && (
                            <div className="flex items-center justify-between text-[11px] font-medium text-on-surface-variant">
                              <span>Parcel: <strong>{notif.fieldName}</strong></span>
                              {notif.dailyRate && (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold">
                                  {notif.dailyRate}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Action Buttons if Pending and Owner */}
                          {isPending && isOwner && notif.requestId && (
                            <div className="flex items-center gap-2 mt-1">
                              <button
                                type="button"
                                disabled={actionLoadingId === notif.requestId}
                                onClick={(e) => handleApproveApplication(e, notif.requestId!, notif.id)}
                                className="flex-1 py-1 rounded-lg bg-primary text-on-primary text-[11px] font-semibold hover:opacity-95 shadow-xs flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                              >
                                <span className="material-symbols-outlined text-[13px]">how_to_reg</span>
                                <span>{actionLoadingId === notif.requestId ? 'Assigning...' : t('layout.acceptAndAssign', 'Accept & Assign')}</span>
                              </button>
                              <button
                                type="button"
                                disabled={actionLoadingId === notif.requestId}
                                onClick={(e) => handleDeclineApplication(e, notif.requestId!, notif.id)}
                                className="px-2.5 py-1 rounded-lg border border-outline-variant text-on-surface-variant text-[11px] font-semibold hover:bg-surface-container cursor-pointer disabled:opacity-50"
                              >
                                {t('layout.decline', 'Decline')}
                              </button>
                            </div>
                          )}

                          {/* Status Badge if Processed */}
                          {notif.actionStatus === 'approved' && (
                            <div className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 px-2 py-0.5 rounded w-fit">
                              <span className="material-symbols-outlined text-[13px]">check_circle</span>
                              <span>{t('layout.approvedStatus', 'Approved & Assigned')}</span>
                            </div>
                          )}
                          {notif.actionStatus === 'rejected' && (
                            <div className="flex items-center gap-1 text-[11px] font-semibold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded w-fit">
                              <span className="material-symbols-outlined text-[13px]">cancel</span>
                              <span>{t('layout.declinedStatus', 'Declined')}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Unread Dot */}
                    {!notif.read && (
                      <span className="w-2 h-2 rounded-full bg-primary mt-1.5 shrink-0" />
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="p-3 border-t border-outline-variant/30 bg-surface-container-low/50 flex items-center justify-between text-xs font-semibold">
            {isOwner ? (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  navigate('/farmers?tab=assignments');
                }}
                className="text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>{t('farmers.reviewApplications', 'Review All Applications')}</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setIsOpen(false);
                  navigate('/farmer-dashboard');
                }}
                className="text-primary hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>{t('navigation.farmerWorkspace', 'Farmer Workspace')}</span>
                <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                navigate('/history');
              }}
              className="text-on-surface-variant hover:text-on-surface cursor-pointer"
            >
              {t('layout.viewAllLogs', 'System Logs')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
