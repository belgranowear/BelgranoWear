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

import { AppScreen, TransitCard, useResponsiveMetrics } from './ui';

const appVersion = Constants.expoConfig?.version || Constants.manifest?.version || '2.0.0';

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

export default function Settings({ navigation }) {
    const { theme, themeMode, setThemeMode } = useTheme();
    const responsive = useResponsiveMetrics();
    const watchLayout = responsive.isWatch;

    if (watchLayout) {
        return (
            <AppScreen contentStyle={styles.watchStack}>
                <View style={styles.watchHeader}>
                    <Text variant="titleMedium" style={styles.watchTitle}>
                        {Lang.t('screenSettingsName')}
                    </Text>
                    <Text variant="labelSmall" style={styles.watchSubtitle} numberOfLines={1}>
                        {Lang.t('appVersionLabel').replace('%s', appVersion)}
                    </Text>
                </View>

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
            <TransitCard>
                <Text variant="headlineSmall" style={styles.title}>
                    BelgranoWear
                </Text>
                <Text variant="bodyMedium">
                    {Lang.t('settingsSubtitle')}
                </Text>
                <Text variant="labelLarge">
                    {Lang.t('appVersionLabel').replace('%s', appVersion)}
                </Text>
            </TransitCard>

            <TransitCard>
                <Text variant="titleMedium" style={styles.sectionTitle}>
                    {Lang.t('settingsThemeSectionTitle')}
                </Text>
                <Text variant="bodyMedium">
                    {Lang.t('settingsThemeSectionDescription')}
                </Text>
                <SegmentedButtons
                    value={themeMode}
                    onValueChange={setThemeMode}
                    buttons={[
                        { value: 'system', label: Lang.t('themeModeSystem') },
                        { value: 'light',  label: Lang.t('themeModeLight')  },
                        { value: 'dark',   label: Lang.t('themeModeDark')   }
                    ]}
                />
            </TransitCard>

            <TransitCard>
                <List.Item
                    title={Lang.t('settingsAboutRowTitle')}
                    description={Lang.t('settingsAboutRowDescription')}
                    left={props => <List.Icon {...props} icon="information-outline" />}
                    right={props => <List.Icon {...props} icon="chevron-right" />}
                    onPress={() => navigation.navigate('About')}
                    accessibilityRole="button"
                    accessibilityHint={Lang.t('settingsAboutRowDescription')}
                    style={styles.listItem}
                />
            </TransitCard>
        </AppScreen>
    );
}

const styles = StyleSheet.create({
    stack: {
        gap: 12
    },
    title: {
        fontWeight: '900'
    },
    sectionTitle: {
        fontWeight: '800'
    },
    listItem: {
        paddingHorizontal: 0
    },
    watchStack: {
        alignItems: 'center',
        gap: 8
    },
    watchHeader: {
        width: '78%',
        alignSelf: 'center',
        alignItems: 'center',
        paddingTop: 2,
        paddingBottom: 4
    },
    watchTitle: {
        textAlign: 'center',
        fontWeight: '900',
        fontSize: 20,
        lineHeight: 24
    },
    watchSubtitle: {
        textAlign: 'center',
        opacity: 0.68,
        fontSize: 12,
        lineHeight: 15
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
