import React from 'react';

import Constants from 'expo-constants';

import {
    Pressable,
    StyleSheet,
    View
} from 'react-native';

import {
    List,
    SegmentedButtons,
    Text
} from 'react-native-paper';

import Lang from '../includes/Lang';
import { useTheme } from '../includes/Theme';

import { AppScreen, useResponsiveMetrics } from './ui';
import WatchScreenHeader from './watch/WatchScreenHeader';

const appVersion = Constants.expoConfig?.version || Constants.manifest?.version || '3.0.1';

function WatchThemeOption({ mode, label, selected, onPress }) {
    const { theme } = useTheme();

    return (
        <Pressable
            onPress={() => onPress(mode)}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected }}
            accessibilityLabel={label}
            style={({ pressed }) => [
                styles.watchOption,
                {
                    backgroundColor: selected ? theme.accentSoft : theme.paperTheme.colors.surfaceVariant,
                    opacity: pressed ? 0.72 : 1
                }
            ]}
        >
            <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.78}
                style={[
                    styles.watchOptionText,
                    { color: selected ? theme.accentStrong : theme.paperTheme.colors.onSurfaceVariant }
                ]}
            >
                {label}
            </Text>
            <Text style={[ styles.watchOptionCheck, { color: theme.accentStrong } ]}>
                {selected ? '✓' : ''}
            </Text>
        </Pressable>
    );
}

// M3 grouped list section: label above a tonal surface container instead of an outlined card.
function SettingsGroup({ title, children }) {
    const { theme } = useTheme();

    return (
        <View style={styles.group}>
            <Text variant="labelLarge" style={[ styles.groupTitle, theme.type.emphasized.label, { color: theme.roles.primary } ]}>
                {title}
            </Text>
            <View style={[ styles.groupSurface, { backgroundColor: theme.roles.surfaceContainerLow, borderRadius: theme.shape.lg } ]}>
                {children}
            </View>
        </View>
    );
}

export default function Settings({ navigation }) {
    const { theme, themeMode, setThemeMode } = useTheme();
    const responsive = useResponsiveMetrics();
    const watchLayout = responsive.isWatch;

    if (watchLayout) {
        return (
            <AppScreen contentStyle={styles.watchStack}>
                <WatchScreenHeader title={Lang.t('screenSettingsName')} subtitle={Lang.t('appVersionLabel').replace('%s', appVersion)} />

                <View style={styles.watchSection}>
                    <Text variant="labelLarge" style={styles.watchSectionTitle}>
                        {Lang.t('settingsThemeSectionTitle')}
                    </Text>
                    {[
                        [ 'system', Lang.t('themeModeSystem') ],
                        [ 'light',  Lang.t('themeModeLight')  ],
                        [ 'dark',   Lang.t('themeModeDark')   ]
                    ].map(([ mode, label ]) => (
                        <WatchThemeOption
                            key={mode}
                            mode={mode}
                            label={label}
                            selected={themeMode === mode}
                            onPress={setThemeMode}
                        />
                    ))}
                </View>

                <Pressable
                    onPress={() => navigation.navigate('Reminders')}
                    accessibilityRole="button"
                    accessibilityLabel={Lang.t('settingsRemindersRowTitle')}
                    accessibilityHint={Lang.t('settingsRemindersRowDescription')}
                    style={({ pressed }) => [
                        styles.watchAboutButton,
                        {
                            backgroundColor: theme.accentSoft,
                            opacity: pressed ? 0.72 : 1
                        }
                    ]}
                >
                    <Text numberOfLines={1} style={[ styles.watchAboutText, { color: theme.accentStrong } ]}>
                        {Lang.t('settingsRemindersRowTitle')}
                    </Text>
                </Pressable>

                <Pressable
                    onPress={() => navigation.navigate('About')}
                    accessibilityRole="button"
                    accessibilityLabel={Lang.t('settingsAboutRowTitle')}
                    accessibilityHint={Lang.t('settingsAboutRowDescription')}
                    style={({ pressed }) => [
                        styles.watchAboutButton,
                        {
                            backgroundColor: theme.paperTheme.colors.surfaceVariant,
                            opacity: pressed ? 0.72 : 1
                        }
                    ]}
                >
                    <Text numberOfLines={1} style={[ styles.watchAboutText, { color: theme.paperTheme.colors.onSurfaceVariant } ]}>
                        ⓘ {Lang.t('screenAboutName')}
                    </Text>
                </Pressable>

                <View style={{ height: Math.round(responsive.shortestSide * 0.16) }} />
            </AppScreen>
        );
    }

    return (
        <AppScreen contentStyle={styles.stack}>
            <View style={styles.column}>
                <View style={styles.header}>
                    <Text variant="headlineSmall" style={[ styles.title, theme.type.emphasized.headline ]}>
                        BelgranoWear
                    </Text>
                    <Text variant="bodyMedium" style={{ color: theme.textMuted }}>
                        {Lang.t('settingsSubtitle')}
                    </Text>
                    <Text variant="labelMedium" style={{ color: theme.textMuted }}>
                        {Lang.t('appVersionLabel').replace('%s', appVersion)}
                    </Text>
                </View>

                <SettingsGroup title={Lang.t('settingsAppearanceSectionTitle')}>
                    <View style={styles.groupPadding}>
                        <Text variant="titleMedium" style={styles.sectionTitle}>
                            {Lang.t('settingsThemeSectionTitle')}
                        </Text>
                        <Text variant="bodyMedium" style={{ color: theme.textMuted }}>
                            {Lang.t('settingsThemeSectionDescription')}
                        </Text>
                        <SegmentedButtons
                            value={themeMode}
                            onValueChange={setThemeMode}
                            buttons={[
                                { value: 'system', label: Lang.t('themeModeSystem'), icon: 'theme-light-dark' },
                                { value: 'light',  label: Lang.t('themeModeLight'),  icon: 'white-balance-sunny' },
                                { value: 'dark',   label: Lang.t('themeModeDark'),   icon: 'weather-night' }
                            ]}
                            style={styles.segmented}
                        />
                    </View>
                </SettingsGroup>

                <SettingsGroup title={Lang.t('settingsNotificationsSectionTitle')}>
                    <List.Item
                        title={Lang.t('settingsRemindersRowTitle')}
                        description={Lang.t('settingsRemindersRowDescription')}
                        left={props => <List.Icon {...props} icon="bell-ring-outline" />}
                        right={props => <List.Icon {...props} icon="chevron-right" />}
                        onPress={() => navigation.navigate('Reminders')}
                        accessibilityRole="button"
                        accessibilityHint={Lang.t('settingsRemindersRowDescription')}
                        titleStyle={styles.rowTitle}
                        style={styles.listItem}
                    />
                </SettingsGroup>

                <SettingsGroup title={Lang.t('settingsInformationSectionTitle')}>
                    <List.Item
                        title={Lang.t('settingsAboutRowTitle')}
                        description={Lang.t('settingsAboutRowDescription')}
                        left={props => <List.Icon {...props} icon="information-outline" />}
                        right={props => <List.Icon {...props} icon="chevron-right" />}
                        onPress={() => navigation.navigate('About')}
                        accessibilityRole="button"
                        accessibilityHint={Lang.t('settingsAboutRowDescription')}
                        titleStyle={styles.rowTitle}
                        style={styles.listItem}
                    />
                </SettingsGroup>
            </View>
        </AppScreen>
    );
}

const styles = StyleSheet.create({
    stack: {
        gap: 12
    },
    column: {
        width: '100%',
        maxWidth: 680,
        alignSelf: 'center',
        gap: 20
    },
    header: {
        gap: 4,
        paddingHorizontal: 4
    },
    group: {
        gap: 8
    },
    groupTitle: {
        paddingHorizontal: 16
    },
    groupSurface: {
        overflow: 'hidden'
    },
    groupPadding: {
        padding: 16,
        gap: 8
    },
    segmented: {
        marginTop: 8
    },
    rowTitle: {
        fontWeight: '700'
    },
    title: {
        fontWeight: '900'
    },
    sectionTitle: {
        fontWeight: '800'
    },
    listItem: {
        paddingLeft: 8,
        paddingRight: 8,
        minHeight: 64,
        justifyContent: 'center'
    },
    watchStack: {
        alignItems: 'center',
        gap: 8
    },
    watchSection: {
        width: '92%',
        alignSelf: 'center',
        gap: 6
    },
    watchSectionTitle: {
        textAlign: 'center',
        fontWeight: '800',
        marginBottom: 1
    },
    watchOption: {
        minHeight: 44,
        borderRadius: 22,
        paddingLeft: 16,
        paddingRight: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center'
    },
    watchOptionText: {
        flex: 1,
        textAlign: 'center',
        fontSize: 15,
        lineHeight: 18,
        fontWeight: '800',
        includeFontPadding: false
    },
    watchOptionCheck: {
        width: 20,
        textAlign: 'center',
        fontSize: 18,
        lineHeight: 22,
        fontWeight: '900',
        includeFontPadding: false
    },
    watchAboutButton: {
        width: '74%',
        minHeight: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: 4
    },
    watchAboutText: {
        textAlign: 'center',
        fontSize: 14,
        lineHeight: 18,
        fontWeight: '800'
    }
});
