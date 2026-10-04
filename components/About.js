import React from 'react';

import Constants from 'expo-constants';

import {
    Linking,
    Pressable,
    StyleSheet,
    View
} from 'react-native';

import {
    Button,
    Divider,
    List,
    Text
} from 'react-native-paper';

import { isRoundScreen } from '../includes/Device';
import Lang from '../includes/Lang';
import OpenSourceLibraries from '../includes/OpenSourceLibraries';
import { useTheme } from '../includes/Theme';

import { AppScreen, useResponsiveMetrics } from './ui';
import WatchScreenHeader from './watch/WatchScreenHeader';

const APP_REPOSITORY_URL = 'https://github.com/belgranowear/BelgranoWear';
const appVersion = Constants.expoConfig?.version || Constants.manifest?.version || '3.0.1';

const openURL = url => {
    if (!url) { return; }

    Linking.openURL(url).catch(exception => {
        console.warn(`About: couldn't open "${url}":`, exception);
    });
};

const libraryDescription = library => [
    Lang.t('appVersionLabel').replace('%s', library.version),
    library.license
].filter(Boolean).join(' · ');

export default function About() {
    const { theme } = useTheme();
    const responsive = useResponsiveMetrics();

    if (responsive.isWatch) {
        return (
            <AppScreen contentStyle={styles.watchStack}>
                <WatchScreenHeader title={Lang.t('screenAboutName')} subtitle={Lang.t('appVersionLabel').replace('%s', appVersion)} />

                {/* Narrower on round faces so lines scrolling past the top and bottom stay off the bezel. */}
                <View style={[ styles.watchIntro, isRoundScreen({ width: responsive.width, height: responsive.height, watch: true }) && styles.watchIntroRound ]}>
                    <Text style={styles.watchIntroText}>
                        {Lang.t('aboutDescription')}
                    </Text>
                    <Text style={styles.watchCreatorText} numberOfLines={2}>
                        {Lang.t('aboutCreatorLabel').replace('%s', 'Facundo Montero')}
                    </Text>
                </View>

                <Pressable
                    onPress={() => openURL(APP_REPOSITORY_URL)}
                    accessibilityRole="link"
                    accessibilityLabel={Lang.t('aboutOpenRepositoryLabel')}
                    style={({ pressed }) => [
                        styles.watchRepoButton,
                        {
                            backgroundColor: theme.accentSoft,
                            opacity: pressed ? 0.72 : 1
                        }
                    ]}
                >
                    <Text numberOfLines={1} style={[ styles.watchRepoText, { color: theme.accentStrong } ]}>
                        GitHub
                    </Text>
                </Pressable>

                <Text variant="labelLarge" style={styles.watchSectionTitle}>
                    {Lang.t('aboutAcknowledgementsTitle')}
                </Text>

                {OpenSourceLibraries.map(group => (
                    <View key={group.categoryKey} style={styles.watchLibraryGroup}>
                        <Text style={styles.watchLibraryGroupTitle} numberOfLines={2}>
                            {Lang.t(group.categoryKey)}
                        </Text>
                        {group.items.map(library => (
                            <Pressable
                                key={library.name}
                                onPress={() => openURL(library.url)}
                                accessibilityRole="link"
                                accessibilityLabel={library.name}
                                accessibilityHint={Lang.t('aboutLibraryLinkHint').replace('%s', library.name)}
                                style={({ pressed }) => [
                                    styles.watchLibraryItem,
                                    {
                                        backgroundColor: theme.paperTheme.colors.surfaceVariant,
                                        opacity: pressed ? 0.72 : 1
                                    }
                                ]}
                            >
                                <Text
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.72}
                                    style={[ styles.watchLibraryName, { color: theme.paperTheme.colors.onSurfaceVariant } ]}
                                >
                                    {library.name}
                                </Text>
                                <Text numberOfLines={1} style={[ styles.watchLibraryMeta, { color: theme.paperTheme.colors.onSurfaceVariant } ]}>
                                    {library.version} · {library.license}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                ))}

                <View style={{ height: Math.round(responsive.shortestSide * 0.18) }} />
            </AppScreen>
        );
    }

    return (
        <AppScreen contentStyle={styles.stack} contentWidth="wide">
            <View style={styles.column}>
                <View style={[ styles.hero, { backgroundColor: theme.roles.surfaceContainerLow, borderRadius: theme.shape.xl } ]}>
                    <Text variant="headlineSmall" style={[ styles.title, theme.type.emphasized.headline ]}>
                        {Lang.t('aboutAppTitle')}
                    </Text>
                    <Text variant="bodyLarge">
                        {Lang.t('aboutDescription')}
                    </Text>
                    <Text variant="bodyMedium" style={styles.emphasis}>
                        {Lang.t('aboutCreatorLabel').replace('%s', 'Facundo Montero')}
                    </Text>
                    <Text variant="labelLarge" style={{ color: theme.textMuted }}>
                        {Lang.t('appVersionLabel').replace('%s', appVersion)}
                    </Text>
                    <Button
                        mode="contained-tonal"
                        icon="github"
                        onPress={() => openURL(APP_REPOSITORY_URL)}
                        accessibilityLabel={Lang.t('aboutOpenRepositoryLabel')}
                        style={styles.repoButton}
                    >
                        {Lang.t('aboutRepositoryLabel')}
                    </Button>
                </View>

                <View style={styles.acknowledgements}>
                    <Text variant="titleMedium" style={[ styles.sectionTitle, theme.type.emphasized.title ]}>
                        {Lang.t('aboutAcknowledgementsTitle')}
                    </Text>
                    <Text variant="bodyMedium" style={{ color: theme.textMuted }}>
                        {Lang.t('aboutAcknowledgementsDescription')}
                    </Text>
                </View>

                {OpenSourceLibraries.map(group => (
                    <View key={group.categoryKey} style={styles.group}>
                        <Text variant="labelLarge" style={[ styles.groupTitle, theme.type.emphasized.label, { color: theme.roles.primary } ]}>
                            {Lang.t(group.categoryKey)}
                        </Text>
                        <View style={[ styles.groupSurface, { backgroundColor: theme.roles.surfaceContainerLow, borderRadius: theme.shape.lg } ]}>
                            {group.items.map((library, index) => (
                                <View key={library.name}>
                                    <List.Item
                                        title={library.name}
                                        description={libraryDescription(library)}
                                        left={props => <List.Icon {...props} icon="code-tags" />}
                                        right={props => <List.Icon {...props} icon="open-in-new" />}
                                        onPress={() => openURL(library.url)}
                                        accessibilityRole="link"
                                        accessibilityHint={Lang.t('aboutLibraryLinkHint').replace('%s', library.name)}
                                        titleNumberOfLines={2}
                                        descriptionNumberOfLines={2}
                                        style={styles.libraryItem}
                                    />
                                    {index < group.items.length - 1 ? <Divider style={{ backgroundColor: theme.roles.outlineVariant }} /> : null}
                                </View>
                            ))}
                        </View>
                    </View>
                ))}
            </View>
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
    emphasis: {
        fontWeight: '800'
    },
    sectionTitle: {
        fontWeight: '800'
    },
    column: {
        width: '100%',
        maxWidth: 800,
        alignSelf: 'center',
        gap: 20
    },
    hero: {
        padding: 20,
        gap: 8
    },
    repoButton: {
        alignSelf: 'flex-start',
        marginTop: 4
    },
    acknowledgements: {
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
    libraryItem: {
        paddingHorizontal: 8
    },
    watchStack: {
        alignItems: 'center',
        gap: 8
    },
    watchIntro: {
        width: '86%',
        alignSelf: 'center',
        alignItems: 'center',
        gap: 4
    },
    watchIntroRound: {
        width: '76%'
    },
    watchIntroText: {
        textAlign: 'center',
        fontSize: 13,
        lineHeight: 16
    },
    watchCreatorText: {
        textAlign: 'center',
        fontSize: 13,
        lineHeight: 16,
        fontWeight: '800'
    },
    watchRepoButton: {
        width: '62%',
        minHeight: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center'
    },
    watchRepoText: {
        textAlign: 'center',
        fontSize: 14,
        lineHeight: 18,
        fontWeight: '900'
    },
    watchSectionTitle: {
        width: '78%',
        textAlign: 'center',
        fontWeight: '800',
        marginTop: 4
    },
    watchLibraryGroup: {
        width: '92%',
        alignSelf: 'center',
        gap: 5,
        paddingTop: 4
    },
    watchLibraryGroupTitle: {
        textAlign: 'center',
        fontSize: 13,
        lineHeight: 16,
        fontWeight: '900'
    },
    watchLibraryItem: {
        minHeight: 42,
        borderRadius: 21,
        paddingHorizontal: 12,
        alignItems: 'center',
        justifyContent: 'center'
    },
    watchLibraryName: {
        width: '100%',
        textAlign: 'center',
        fontSize: 13,
        lineHeight: 16,
        fontWeight: '800',
        includeFontPadding: false
    },
    watchLibraryMeta: {
        width: '100%',
        textAlign: 'center',
        opacity: 0.68,
        fontSize: 11,
        lineHeight: 13,
        includeFontPadding: false
    }
});
