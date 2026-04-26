import { Platform } from 'react-native';

import Constants, { ExecutionEnvironment } from 'expo-constants';

import Preferences from './Preferences';
import Lang from './Lang';

const CHANNEL_ID = 'departure-reminders';

let Notifications = null;
let notificationHandlerConfigured = false;

const isAndroidExpoGo = () => (
    Platform.OS === 'android'
    &&
    (
        Constants.executionEnvironment === ExecutionEnvironment.StoreClient
        ||
        Constants.appOwnership === 'expo'
    )
);

const loadNotifications = async () => {
    if (Platform.OS === 'web' || isAndroidExpoGo()) { return null; }

    if (!Notifications) {
        Notifications = await import('expo-notifications');
    }

    if (!notificationHandlerConfigured) {
        Notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldPlaySound: true,
                shouldSetBadge: false,
                shouldShowBanner: true,
                shouldShowList: true
            })
        });

        notificationHandlerConfigured = true;
    }

    return Notifications;
};

const ensureNotificationPermissions = async notifications => {
    if (Platform.OS === 'android') {
        await notifications.setNotificationChannelAsync(CHANNEL_ID, {
            name: Lang.t('notificationChannelName'),
            importance: notifications.AndroidImportance.HIGH,
            vibrationPattern: [ 0, 250, 125, 250 ],
            lightColor: '#be4936'
        });
    }

    const existing = await notifications.getPermissionsAsync();

    if (existing.granted) { return true; }

    const requested = await notifications.requestPermissionsAsync({
        ios: {
            allowAlert: true,
            allowBadge: false,
            allowSound: true
        }
    });

    return requested.granted;
};

const buildReminderBody = (origin, destination, departureTime) => Lang.t('reminderAlertBody')
    .replace('%s', origin.title)
    .replace('%s', destination.title)
    .replace('%s', departureTime.format('HH:mm'));

const Reminders = {
    scheduleDepartureReminder: async ({ origin, destination, departureTime }) => {
        const reminderTime = departureTime.subtract(5, 'minute');
        const seconds      = Math.floor(reminderTime.diff() / 1000);

        if (seconds <= 0) {
            return {
                ok: false,
                reason: 'too-soon',
                message: Lang.t('reminderUnavailableMessage')
            };
        }

        try {
            const notifications = await loadNotifications();

            if (!notifications) {
                return {
                    ok: false,
                    reason: 'unavailable',
                    message: Lang.t('reminderUnavailableMessage')
                };
            }

            const granted = await ensureNotificationPermissions(notifications);

            if (!granted) {
                return {
                    ok: false,
                    reason: 'denied',
                    message: Lang.t('notificationPermissionDeniedMessage')
                };
            }

            const existingId = await Preferences.getReminderNotificationId(origin, destination);

            if (existingId) {
                await notifications.cancelScheduledNotificationAsync(existingId).catch(exception => {
                    console.warn('Reminders: failed to cancel previous notification:', exception);
                });
            }

            const identifier = await notifications.scheduleNotificationAsync({
                content: {
                    title: Lang.t('reminderAlertTitle'),
                    body:  buildReminderBody(origin, destination, departureTime),
                    data:  {
                        originId:      origin.id,
                        destinationId: destination.id,
                        departureTime: departureTime.toISOString()
                    }
                },
                trigger: {
                    type: notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                    seconds,
                    channelId: CHANNEL_ID
                }
            });

            await Preferences.setReminderNotificationId(origin, destination, identifier);

            return {
                ok: true,
                identifier,
                message: Lang.t('reminderSetMessage')
            };
        } catch (exception) {
            console.warn('Reminders: native scheduling unavailable:', exception);

            return {
                ok: false,
                reason: 'unavailable',
                message: Lang.t('reminderUnavailableMessage')
            };
        }
    }
};

export default Reminders;
